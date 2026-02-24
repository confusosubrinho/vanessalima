import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function yampiRequest(
  yampiBase: string,
  headers: Record<string, string>,
  path: string,
  method: string,
  body?: unknown
) {
  const url = `${yampiBase}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  console.log(`[YAMPI-VAR] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 500) : "");
  const res = await fetch(url, opts);
  let data: unknown;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) console.error(`[YAMPI-VAR] ERROR ${res.status} ${path}:`, JSON.stringify(data));
  return { ok: res.ok, status: res.status, data: data as Record<string, unknown> };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Load Yampi config
    const { data: providerConfig } = await supabase
      .from("integrations_checkout_providers")
      .select("config")
      .eq("provider", "yampi")
      .single();

    if (!providerConfig?.config) {
      return new Response(JSON.stringify({ error: "Yampi não configurado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = providerConfig.config as Record<string, unknown>;
    const alias = config.alias as string;
    const userToken = config.user_token as string;
    const userSecretKey = config.user_secret_key as string;

    if (!alias || !userToken || !userSecretKey) {
      return new Response(JSON.stringify({ error: "Credenciais Yampi incompletas" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const yampiBase = `https://api.dooki.com.br/v2/${alias}`;
    const yampiHeaders = {
      "User-Token": userToken,
      "User-Secret-Key": userSecretKey,
      "Content-Type": "application/json",
    };

    // ─── Step 1: Fetch/Create variation groups (Tamanho, Cor) ───
    const groupMap: Record<string, number> = {};

    const groupsRes = await yampiRequest(yampiBase, yampiHeaders, "/catalog/variations?limit=50", "GET");
    if (groupsRes.ok && groupsRes.data?.data) {
      for (const g of groupsRes.data.data as Array<Record<string, unknown>>) {
        const name = (g.name as string || "").trim();
        groupMap[name.toLowerCase()] = g.id as number;
      }
    }

    // Ensure "Tamanho" exists
    if (!groupMap["tamanho"]) {
      const res = await yampiRequest(yampiBase, yampiHeaders, "/catalog/variations", "POST", { name: "Tamanho" });
      await delay(1000);
      if (res.ok) {
        const d = res.data?.data;
        const id = Array.isArray(d) ? (d[0] as Record<string, unknown>)?.id as number : (d as Record<string, unknown>)?.id as number;
        if (id) groupMap["tamanho"] = id;
      }
    }

    // Ensure "Cor" exists
    if (!groupMap["cor"]) {
      const res = await yampiRequest(yampiBase, yampiHeaders, "/catalog/variations", "POST", { name: "Cor" });
      await delay(1000);
      if (res.ok) {
        const d = res.data?.data;
        const id = Array.isArray(d) ? (d[0] as Record<string, unknown>)?.id as number : (d as Record<string, unknown>)?.id as number;
        if (id) groupMap["cor"] = id;
      }
    }

    console.log(`[YAMPI-VAR] Variation groups: Tamanho=${groupMap["tamanho"]}, Cor=${groupMap["cor"]}`);

    // ─── Step 2: Fetch existing variation values from Yampi ───
    const existingValues: Record<string, Record<string, number>> = { tamanho: {}, cor: {} };

    for (const [groupName, groupId] of Object.entries(groupMap)) {
      if (!["tamanho", "cor"].includes(groupName)) continue;
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await yampiRequest(yampiBase, yampiHeaders, `/catalog/variations/${groupId}/values?limit=50&page=${page}`, "GET");
        if (res.ok && res.data?.data) {
          const values = res.data.data as Array<Record<string, unknown>>;
          for (const v of values) {
            const val = (v.name as string || v.value as string || "").trim().toLowerCase();
            if (val) existingValues[groupName][val] = v.id as number;
          }
          const meta = res.data.meta as Record<string, unknown>;
          const pagination = meta?.pagination as Record<string, unknown>;
          const currentPage = pagination?.current_page as number || page;
          const totalPages = Math.ceil((pagination?.total as number || 0) / (pagination?.per_page as number || 50));
          hasMore = currentPage < totalPages;
          page++;
        } else {
          hasMore = false;
        }
        await delay(500);
      }
    }

    console.log(`[YAMPI-VAR] Existing values: Tamanho=${Object.keys(existingValues["tamanho"]).length}, Cor=${Object.keys(existingValues["cor"]).length}`);

    // ─── Step 3: Collect unique local values ───
    const { data: variants } = await supabase
      .from("product_variants")
      .select("size, color")
      .eq("is_active", true);

    const localSizes = new Set<string>();
    const localColors = new Set<string>();
    for (const v of variants || []) {
      if (v.size && v.size.trim()) localSizes.add(v.size.trim());
      if (v.color && v.color.trim()) localColors.add(v.color.trim());
    }

    console.log(`[YAMPI-VAR] Local unique: ${localSizes.size} sizes, ${localColors.size} colors`);

    let created = 0;
    let matched = 0;
    let errors = 0;
    const errorDetails: Array<{ type: string; value: string; message: string }> = [];

    // ─── Step 4: Create missing values in Yampi and save to variation_value_map ───
    const processValues = async (
      type: "size" | "color",
      groupName: string,
      groupId: number | undefined,
      values: Set<string>
    ) => {
      if (!groupId) return;

      for (const val of values) {
        try {
          const valLower = val.toLowerCase();
          let yampiValueId = existingValues[groupName]?.[valLower];

          if (!yampiValueId) {
            // Create value in Yampi
            const res = await yampiRequest(yampiBase, yampiHeaders, `/catalog/variations/${groupId}/values`, "POST", {
              name: val,
            });
            await delay(800);

            if (res.ok) {
              const d = res.data?.data;
              yampiValueId = Array.isArray(d)
                ? (d[0] as Record<string, unknown>)?.id as number
                : (d as Record<string, unknown>)?.id as number;

              if (yampiValueId) {
                created++;
                existingValues[groupName][valLower] = yampiValueId;
              }
            } else {
              errors++;
              errorDetails.push({ type, value: val, message: `${res.status}: ${JSON.stringify(res.data)}` });
              continue;
            }
          } else {
            matched++;
          }

          // Upsert into variation_value_map
          if (yampiValueId) {
            await supabase.from("variation_value_map").upsert({
              type,
              value: val,
              yampi_variation_id: groupId,
              yampi_value_id: yampiValueId,
              updated_at: new Date().toISOString(),
            }, { onConflict: "type,value" });
          }
        } catch (err: unknown) {
          errors++;
          errorDetails.push({ type, value: val, message: err instanceof Error ? err.message : "Erro" });
        }
      }
    };

    await processValues("size", "tamanho", groupMap["tamanho"], localSizes);
    await processValues("color", "cor", groupMap["cor"], localColors);

    const result = {
      sizes_total: localSizes.size,
      colors_total: localColors.size,
      created,
      matched,
      errors,
      error_details: errorDetails.slice(0, 20),
      variation_groups: groupMap,
    };

    // Log
    await supabase.from("integrations_checkout_test_logs").insert({
      provider: "yampi",
      status: errors > 0 ? "partial" : "success",
      message: `Variações: ${created} criadas, ${matched} mapeadas, ${errors} erros (${localSizes.size} tamanhos, ${localColors.size} cores)`,
      payload_preview: result,
    });

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[YAMPI-VAR] Fatal:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
