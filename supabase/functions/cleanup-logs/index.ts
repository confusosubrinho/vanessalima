import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// === CONFIGURATION ===
const RETENTION = {
  error_logs: 30,        // days
  app_logs: 14,
  appmax_logs: 30,
  bling_webhook_logs: 30,
  bling_webhook_events: 30,
  bling_sync_runs: 60,
  login_attempts: 7,
  traffic_sessions: 30,
  abandoned_carts: 90,   // keep longer for marketing
};

// Safety limits per execution
const MAX_DELETE_PER_TABLE = 5000;

// Tables that must NEVER be deleted
const PROTECTED_TABLES = [
  "orders",
  "order_items",
  "order_events",
  "customers",
  "products",
  "product_variants",
  "categories",
  "coupons",
  "profiles",
  "user_roles",
  "payment_pricing_config",
  "payment_pricing_audit_log",
];

interface CleanupResult {
  table: string;
  deleted: number;
  consolidated: number;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const jobType = body.job_type || "daily_logs"; // daily_logs | daily_storage | weekly_optimize
    const mode = body.mode || "execute"; // dry_run | execute
    const isDryRun = mode === "dry_run";

    // Create cleanup run record
    const startTime = Date.now();
    const { data: run, error: runError } = await supabase
      .from("cleanup_runs")
      .insert({
        job_type: jobType,
        mode,
        status: "running",
      })
      .select("id")
      .single();

    if (runError) {
      console.error("Failed to create cleanup run:", runError);
      return new Response(
        JSON.stringify({ error: "Failed to create cleanup run" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const runId = run.id;
    const results: CleanupResult[] = [];
    const errors: string[] = [];
    let totalDeleted = 0;
    let totalConsolidated = 0;

    // === JOB: DAILY LOGS CLEANUP (03:30) ===
    if (jobType === "daily_logs") {
      // 1. Consolidate logs into daily stats BEFORE deleting
      for (const [table, days] of Object.entries(RETENTION)) {
        try {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - days);
          const cutoff = cutoffDate.toISOString();

          // Determine level column name
          let levelCol = "level";
          let hasLevel = true;
          if (table === "error_logs") levelCol = "severity";
          if (table === "login_attempts" || table === "traffic_sessions" || table === "abandoned_carts") hasLevel = false;
          if (table === "bling_sync_runs") hasLevel = false;

          // Consolidate: count records that will be deleted, grouped by date
          if (hasLevel) {
            const { data: stats, error: statsErr } = await supabase.rpc("consolidate_logs_before_delete", {
              p_table_name: table,
              p_cutoff: cutoff,
              p_level_col: levelCol,
            }).maybeSingle();

            // If RPC doesn't exist, do manual aggregation via direct count
            if (statsErr) {
              console.warn(`Consolidation RPC not available for ${table}, skipping aggregation`);
            }
          }

          // Count records to delete
          // login_attempts uses attempted_at instead of created_at
          const dateCol = table === "login_attempts" ? "attempted_at" : "created_at";

          let countQuery = supabase
            .from(table as any)
            .select("id", { count: "exact", head: true })
            .lt(dateCol, cutoff);

          // For abandoned_carts, only delete non-recovered ones
          if (table === "abandoned_carts") {
            countQuery = countQuery.eq("recovered", false);
          }

          const { count, error: countErr } = await countQuery;

          if (countErr) {
            const errMsg = `Count error on ${table}: ${countErr.message}`;
            errors.push(errMsg);
            results.push({ table, deleted: 0, consolidated: 0, error: errMsg });
            continue;
          }

          const toDelete = Math.min(count || 0, MAX_DELETE_PER_TABLE);

          if (toDelete === 0) {
            results.push({ table, deleted: 0, consolidated: 0 });
            continue;
          }

          // Aggregate stats manually before deleting
          if (hasLevel && !isDryRun) {
            // Get aggregated counts by date for the records about to be deleted
            const { data: aggData } = await supabase
              .from(table as any)
              .select(`${dateCol}, ${levelCol}`)
              .lt(dateCol, cutoff)
              .limit(MAX_DELETE_PER_TABLE);

            if (aggData && aggData.length > 0) {
              const statsMap = new Map<string, { total: number; error: number; warning: number; info: number }>();
              
              for (const row of aggData) {
                const date = new Date(row[dateCol]).toISOString().split("T")[0];
                const level = (row as any)[levelCol] || "info";
                
                if (!statsMap.has(date)) {
                  statsMap.set(date, { total: 0, error: 0, warning: 0, info: 0 });
                }
                const s = statsMap.get(date)!;
                s.total++;
                if (level === "error" || level === "critical") s.error++;
                else if (level === "warning" || level === "warn") s.warning++;
                else s.info++;
              }

              // Upsert stats
              for (const [date, s] of statsMap) {
                await supabase
                  .from("log_daily_stats")
                  .upsert(
                    {
                      stat_date: date,
                      log_source: table,
                      total_count: s.total,
                      error_count: s.error,
                      warning_count: s.warning,
                      info_count: s.info,
                    },
                    { onConflict: "stat_date,log_source" }
                  );
              }
              totalConsolidated += aggData.length;
            }
          }

          // Delete old records
          if (!isDryRun) {
            // Get IDs to delete (with limit for safety)
            const { data: idsToDelete } = await supabase
              .from(table as any)
              .select("id")
              .lt(dateCol, cutoff)
              .limit(MAX_DELETE_PER_TABLE);

            if (idsToDelete && idsToDelete.length > 0) {
              const ids = idsToDelete.map((r: any) => r.id);
              
              // Delete in batches of 500
              for (let i = 0; i < ids.length; i += 500) {
                const batch = ids.slice(i, i + 500);
                const { error: delErr } = await supabase
                  .from(table as any)
                  .delete()
                  .in("id", batch);

                if (delErr) {
                  errors.push(`Delete error on ${table}: ${delErr.message}`);
                }
              }
            }

            totalDeleted += toDelete;
          }

          results.push({ table, deleted: isDryRun ? 0 : toDelete, consolidated: 0 });

        } catch (err: any) {
          const errMsg = `Error processing ${table}: ${err.message}`;
          errors.push(errMsg);
          results.push({ table, deleted: 0, consolidated: 0, error: errMsg });
        }
      }

      // Clean expired sessions (login_attempts older than 24h)
      if (!isDryRun) {
        const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
        await supabase
          .from("login_attempts" as any)
          .delete()
          .lt("attempted_at", oneDayAgo)
          .eq("success", true);
      }
    }

    // === JOB: DAILY STORAGE CLEANUP (04:00) ===
    if (jobType === "daily_storage") {
      // Clean orphaned product media (images not referenced by any product)
      try {
        const { data: files, error: listErr } = await supabase.storage
          .from("product-media")
          .list("", { limit: 500 });

        if (listErr) {
          errors.push(`Storage list error: ${listErr.message}`);
        } else if (files) {
          let orphansRemoved = 0;

          for (const folder of files) {
            if (!folder.id) continue; // It's a folder, list its contents
            
            const { data: innerFiles } = await supabase.storage
              .from("product-media")
              .list(folder.name, { limit: 100 });

            if (innerFiles) {
              for (const file of innerFiles) {
                const filePath = `${folder.name}/${file.name}`;
                const url = supabase.storage.from("product-media").getPublicUrl(filePath).data.publicUrl;
                
                // Check if this URL is referenced in product_images
                const { count } = await supabase
                  .from("product_images")
                  .select("id", { count: "exact", head: true })
                  .ilike("url", `%${file.name}%`);

                if ((count || 0) === 0 && !isDryRun) {
                  // Also check banners and other tables
                  const { count: bannerCount } = await supabase
                    .from("banners")
                    .select("id", { count: "exact", head: true })
                    .or(`image_url.ilike.%${file.name}%,mobile_image_url.ilike.%${file.name}%`);

                  if ((bannerCount || 0) === 0) {
                    const { error: rmErr } = await supabase.storage
                      .from("product-media")
                      .remove([filePath]);

                    if (!rmErr) orphansRemoved++;
                    else errors.push(`Failed to remove ${filePath}: ${rmErr.message}`);
                  }
                }
              }
            }
          }

          results.push({ table: "storage:product-media", deleted: orphansRemoved, consolidated: 0 });
          totalDeleted += orphansRemoved;
        }
      } catch (err: any) {
        errors.push(`Storage cleanup error: ${err.message}`);
      }
    }

    // === JOB: WEEKLY OPTIMIZE (Sunday 05:00) ===
    if (jobType === "weekly_optimize") {
      // Clean old cleanup_runs (keep last 90 days)
      try {
        const cutoff90 = new Date(Date.now() - 90 * 86400000).toISOString();
        
        if (!isDryRun) {
          const { data: oldRuns } = await supabase
            .from("cleanup_runs")
            .select("id")
            .lt("created_at", cutoff90)
            .limit(1000);

          if (oldRuns && oldRuns.length > 0) {
            await supabase
              .from("cleanup_runs")
              .delete()
              .in("id", oldRuns.map((r: any) => r.id));
            
            totalDeleted += oldRuns.length;
            results.push({ table: "cleanup_runs", deleted: oldRuns.length, consolidated: 0 });
          }
        }

        // Clean old log_daily_stats (keep 1 year)
        const cutoff365 = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];
        if (!isDryRun) {
          const { data: oldStats } = await supabase
            .from("log_daily_stats")
            .select("id")
            .lt("stat_date", cutoff365)
            .limit(1000);

          if (oldStats && oldStats.length > 0) {
            await supabase
              .from("log_daily_stats")
              .delete()
              .in("id", oldStats.map((r: any) => r.id));

            totalDeleted += oldStats.length;
            results.push({ table: "log_daily_stats", deleted: oldStats.length, consolidated: 0 });
          }
        }

        // Clean duplicate bling_webhook_events by event_id (keep most recent)
        const { data: dupes } = await supabase
          .from("bling_webhook_events" as any)
          .select("event_id, id, created_at")
          .order("created_at", { ascending: false })
          .limit(5000);

        if (dupes) {
          const seen = new Set<string>();
          const dupeIds: string[] = [];
          for (const row of dupes) {
            if (seen.has(row.event_id)) {
              dupeIds.push(row.id);
            } else {
              seen.add(row.event_id);
            }
          }

          if (dupeIds.length > 0 && !isDryRun) {
            for (let i = 0; i < dupeIds.length; i += 500) {
              await supabase
                .from("bling_webhook_events" as any)
                .delete()
                .in("id", dupeIds.slice(i, i + 500));
            }
            totalDeleted += dupeIds.length;
          }
          results.push({ table: "bling_webhook_events_dedup", deleted: isDryRun ? dupeIds.length : dupeIds.length, consolidated: 0 });
        }

      } catch (err: any) {
        errors.push(`Weekly optimize error: ${err.message}`);
      }
    }

    // Update cleanup run with results
    const durationMs = Date.now() - startTime;
    await supabase
      .from("cleanup_runs")
      .update({
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        records_deleted: totalDeleted,
        records_consolidated: totalConsolidated,
        details: { results, mode },
        errors: errors.length > 0 ? errors : null,
        status: errors.length > 0 ? "completed_with_errors" : "completed",
      })
      .eq("id", runId);

    return new Response(
      JSON.stringify({
        run_id: runId,
        job_type: jobType,
        mode,
        duration_ms: durationMs,
        records_deleted: totalDeleted,
        records_consolidated: totalConsolidated,
        results,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Cleanup function error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
