import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// === CONFIGURATION ===
const RETENTION: Record<string, { days: number; dateCol: string }> = {
  app_logs:              { days: 15, dateCol: "created_at" },
  appmax_logs:           { days: 30, dateCol: "created_at" },
  bling_webhook_logs:    { days: 14, dateCol: "created_at" },
  bling_sync_runs:       { days: 90, dateCol: "started_at" },
  login_attempts:        { days: 30, dateCol: "attempted_at" },
  email_automation_logs: { days: 30, dateCol: "created_at" },
  error_logs:            { days: 30, dateCol: "created_at" },
  traffic_sessions:      { days: 30, dateCol: "created_at" },
  abandoned_carts:       { days: 90, dateCol: "created_at" },
  order_events:          { days: 90, dateCol: "received_at" },
  bling_webhook_events:  { days: 60, dateCol: "created_at" },
  product_change_log:    { days: 180, dateCol: "changed_at" },
  payment_pricing_audit_log: { days: 180, dateCol: "changed_at" },
};

const MAX_DELETE_PER_TABLE = 5000;

const LEVEL_COL: Record<string, string> = {
  app_logs: "level",
  appmax_logs: "level",
  bling_webhook_logs: "result",
  error_logs: "severity",
};

// All tables that reference media URLs (for orphan detection)
const MEDIA_TABLES: { table: string; cols: string[] }[] = [
  { table: "product_images", cols: ["url"] },
  { table: "banners", cols: ["image_url", "mobile_image_url"] },
  { table: "highlight_banners", cols: ["image_url"] },
  { table: "categories", cols: ["image_url", "banner_image_url"] },
  { table: "instagram_videos", cols: ["thumbnail_url"] },
  { table: "features_bar", cols: ["icon_url"] },
  { table: "store_settings", cols: ["logo_url", "header_logo_url"] },
  { table: "social_links", cols: ["icon_image_url"] },
  { table: "security_seals", cols: ["image_url"] },
  { table: "payment_methods_display", cols: ["image_url"] },
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
    const jobType = body.job_type || "daily_logs";
    const mode = body.mode || "execute";
    const isDryRun = mode === "dry_run";

    const startTime = Date.now();
    const { data: run, error: runError } = await supabase
      .from("cleanup_runs")
      .insert({ job_type: jobType, mode, status: "running" })
      .select("id")
      .single();

    if (runError) {
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
    let bytesFreed = 0;

    // === JOB: DAILY LOGS CLEANUP ===
    if (jobType === "daily_logs") {
      for (const [table, config] of Object.entries(RETENTION)) {
        try {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - config.days);
          const cutoff = cutoffDate.toISOString();

          // Count records to delete
          let countQuery = supabase
            .from(table as any)
            .select("id", { count: "exact", head: true })
            .lt(config.dateCol, cutoff);

          if (table === "abandoned_carts") {
            countQuery = countQuery.eq("recovered", false);
          }

          const { count, error: countErr } = await countQuery;

          if (countErr) {
            errors.push(`Count ${table}: ${countErr.message}`);
            results.push({ table, deleted: 0, consolidated: 0, error: countErr.message });
            continue;
          }

          const toDelete = Math.min(count || 0, MAX_DELETE_PER_TABLE);
          if (toDelete === 0) {
            results.push({ table, deleted: 0, consolidated: 0 });
            continue;
          }

          // Consolidate logs with levels into daily stats
          const levelCol = LEVEL_COL[table];
          if (levelCol && !isDryRun) {
            const { data: aggData } = await supabase
              .from(table as any)
              .select(`${config.dateCol}, ${levelCol}`)
              .lt(config.dateCol, cutoff)
              .limit(MAX_DELETE_PER_TABLE);

            if (aggData && aggData.length > 0) {
              const statsMap = new Map<string, { total: number; error: number; warning: number; info: number }>();
              for (const row of aggData) {
                const date = new Date((row as any)[config.dateCol]).toISOString().split("T")[0];
                const level = (row as any)[levelCol] || "info";
                if (!statsMap.has(date)) statsMap.set(date, { total: 0, error: 0, warning: 0, info: 0 });
                const s = statsMap.get(date)!;
                s.total++;
                if (["error", "critical"].includes(level)) s.error++;
                else if (["warning", "warn"].includes(level)) s.warning++;
                else s.info++;
              }
              for (const [date, s] of statsMap) {
                await supabase.from("log_daily_stats").upsert(
                  { stat_date: date, log_source: table, total_count: s.total, error_count: s.error, warning_count: s.warning, info_count: s.info },
                  { onConflict: "stat_date,log_source" }
                );
              }
              totalConsolidated += aggData.length;
            }
          }

          // Delete old records in batches
          if (!isDryRun) {
            const { data: idsToDelete } = await supabase
              .from(table as any)
              .select("id")
              .lt(config.dateCol, cutoff)
              .limit(MAX_DELETE_PER_TABLE);

            if (idsToDelete && idsToDelete.length > 0) {
              const ids = idsToDelete.map((r: any) => r.id);
              for (let i = 0; i < ids.length; i += 500) {
                const { error: delErr } = await supabase
                  .from(table as any)
                  .delete()
                  .in("id", ids.slice(i, i + 500));
                if (delErr) errors.push(`Delete ${table}: ${delErr.message}`);
              }
            }
            totalDeleted += toDelete;
          }

          results.push({ table, deleted: isDryRun ? toDelete : toDelete, consolidated: 0 });
        } catch (err: any) {
          errors.push(`Error ${table}: ${err.message}`);
          results.push({ table, deleted: 0, consolidated: 0, error: err.message });
        }
      }
    }

    // === JOB: DAILY STORAGE CLEANUP ===
    if (jobType === "daily_storage") {
      try {
        // 1. Build set of all referenced URLs across all media tables
        const referencedFiles = new Set<string>();
        for (const { table, cols } of MEDIA_TABLES) {
          const { data: rows } = await supabase
            .from(table as any)
            .select(cols.join(","))
            .limit(5000);
          if (rows) {
            for (const row of rows) {
              for (const col of cols) {
                const val = (row as any)[col];
                if (val && typeof val === "string") {
                  // Extract filename from URL
                  const parts = val.split("/");
                  const fname = parts[parts.length - 1];
                  if (fname) referencedFiles.add(fname);
                }
              }
            }
          }
        }

        // 2. Paginate through storage bucket
        let orphansRemoved = 0;
        let offset = 0;
        const PAGE_SIZE = 100;
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

        // List top-level (could be folders or files)
        const { data: topLevel } = await supabase.storage
          .from("product-media")
          .list("", { limit: 1000 });

        if (topLevel) {
          for (const item of topLevel) {
            // If it's a folder, list its contents with pagination
            const { data: innerFiles } = await supabase.storage
              .from("product-media")
              .list(item.name, { limit: 500 });

            const filesToCheck = innerFiles || [];
            // Also check if item itself is a file (has metadata)
            if (item.metadata && item.name) {
              filesToCheck.push(item);
            }

            for (const file of filesToCheck) {
              if (!file.name) continue;
              const filePath = innerFiles ? `${item.name}/${file.name}` : file.name;

              // Check age (only delete files older than 7 days)
              const createdAt = file.created_at ? new Date(file.created_at) : null;
              if (createdAt && createdAt > sevenDaysAgo) continue;

              // Check if referenced
              if (!referencedFiles.has(file.name)) {
                if (!isDryRun) {
                  const { error: rmErr } = await supabase.storage
                    .from("product-media")
                    .remove([filePath]);
                  if (!rmErr) {
                    orphansRemoved++;
                    bytesFreed += (file.metadata?.size || 0);
                  } else {
                    errors.push(`Remove ${filePath}: ${rmErr.message}`);
                  }
                } else {
                  orphansRemoved++;
                  bytesFreed += (file.metadata?.size || 0);
                }
              }
            }
          }
        }

        results.push({ table: "storage:product-media", deleted: orphansRemoved, consolidated: 0 });
        totalDeleted += orphansRemoved;
      } catch (err: any) {
        errors.push(`Storage cleanup: ${err.message}`);
      }
    }

    // === JOB: WEEKLY OPTIMIZE ===
    if (jobType === "weekly_optimize") {
      try {
        // Clean old cleanup_runs (keep 90 days)
        const cutoff90 = new Date(Date.now() - 90 * 86400000).toISOString();
        if (!isDryRun) {
          const { data: oldRuns } = await supabase
            .from("cleanup_runs")
            .select("id")
            .lt("created_at", cutoff90)
            .limit(1000);
          if (oldRuns && oldRuns.length > 0) {
            await supabase.from("cleanup_runs").delete().in("id", oldRuns.map((r: any) => r.id));
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
            await supabase.from("log_daily_stats").delete().in("id", oldStats.map((r: any) => r.id));
            totalDeleted += oldStats.length;
            results.push({ table: "log_daily_stats", deleted: oldStats.length, consolidated: 0 });
          }
        }

        // Deduplicate bling_webhook_events
        const { data: dupes } = await supabase
          .from("bling_webhook_events" as any)
          .select("event_id, id, created_at")
          .order("created_at", { ascending: false })
          .limit(5000);
        if (dupes) {
          const seen = new Set<string>();
          const dupeIds: string[] = [];
          for (const row of dupes) {
            if (seen.has(row.event_id)) dupeIds.push(row.id);
            else seen.add(row.event_id);
          }
          if (dupeIds.length > 0 && !isDryRun) {
            for (let i = 0; i < dupeIds.length; i += 500) {
              await supabase.from("bling_webhook_events" as any).delete().in("id", dupeIds.slice(i, i + 500));
            }
            totalDeleted += dupeIds.length;
          }
          results.push({ table: "bling_webhook_events_dedup", deleted: dupeIds.length, consolidated: 0 });
        }
      } catch (err: any) {
        errors.push(`Weekly optimize: ${err.message}`);
      }
    }

    // Update cleanup run
    const durationMs = Date.now() - startTime;
    await supabase.from("cleanup_runs").update({
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      records_deleted: totalDeleted,
      records_consolidated: totalConsolidated,
      bytes_freed: bytesFreed,
      details: { results, mode },
      errors: errors.length > 0 ? errors : null,
      status: errors.length > 0 ? "completed_with_errors" : "completed",
    }).eq("id", runId);

    return new Response(
      JSON.stringify({
        run_id: runId,
        job_type: jobType,
        mode,
        duration_ms: durationMs,
        records_deleted: totalDeleted,
        records_consolidated: totalConsolidated,
        bytes_freed: bytesFreed,
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
