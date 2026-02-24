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
  console.log(`[YAMPI-CAT] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 500) : "");
  const res = await fetch(url, opts);
  let data: unknown;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) console.error(`[YAMPI-CAT] ERROR ${res.status} ${path}:`, JSON.stringify(data));
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

    // Fetch all Yampi categories (paginated)
    const yampiCategories: Record<string, number> = {};
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const res = await yampiRequest(yampiBase, yampiHeaders, `/catalog/categories?limit=50&page=${page}`, "GET");
      if (res.ok && res.data?.data) {
        const cats = res.data.data as Array<Record<string, unknown>>;
        for (const c of cats) {
          const slug = (c.slug as string || "").toLowerCase().trim();
          const name = (c.name as string || "").toLowerCase().trim();
          if (slug) yampiCategories[slug] = c.id as number;
          if (name) yampiCategories[name] = c.id as number;
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

    console.log(`[YAMPI-CAT] Found ${Object.keys(yampiCategories).length / 2} categories in Yampi`);

    // Fetch local active categories (parents first)
    const { data: localCategories, error: catError } = await supabase
      .from("categories")
      .select("id, name, slug, parent_category_id, yampi_category_id, is_active")
      .eq("is_active", true)
      .order("parent_category_id", { ascending: true, nullsFirst: true });

    if (catError) throw new Error(`Erro ao buscar categorias: ${catError.message}`);

    let created = 0;
    let matched = 0;
    let errors = 0;
    const errorDetails: Array<{ category_id: string; message: string }> = [];

    // Process parents first, then children
    const parents = (localCategories || []).filter(c => !c.parent_category_id);
    const children = (localCategories || []).filter(c => c.parent_category_id);
    const ordered = [...parents, ...children];

    for (const cat of ordered) {
      try {
        // Check if already mapped
        if (cat.yampi_category_id) {
          matched++;
          continue;
        }

        // Try to match by slug or name
        const slug = (cat.slug || "").toLowerCase().trim();
        const name = (cat.name || "").toLowerCase().trim();
        let yampiId = yampiCategories[slug] || yampiCategories[name];

        if (yampiId) {
          // Found existing, save mapping
          await supabase.from("categories").update({ yampi_category_id: yampiId }).eq("id", cat.id);
          matched++;
          console.log(`[YAMPI-CAT] Matched category "${cat.name}" -> yampi_id=${yampiId}`);
        } else {
          // Create in Yampi
          const parentYampiId = cat.parent_category_id
            ? ordered.find(p => p.id === cat.parent_category_id)?.yampi_category_id
            : null;

          const createPayload: Record<string, unknown> = {
            name: cat.name,
            slug: cat.slug || cat.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
            active: true,
            searchable: true,
          };
          if (parentYampiId) createPayload.parent_id = parentYampiId;

          const res = await yampiRequest(yampiBase, yampiHeaders, "/catalog/categories", "POST", createPayload);

          if (res.ok) {
            const createdData = res.data?.data;
            yampiId = Array.isArray(createdData)
              ? (createdData[0] as Record<string, unknown>)?.id as number
              : (createdData as Record<string, unknown>)?.id as number;

            if (yampiId) {
              await supabase.from("categories").update({ yampi_category_id: yampiId }).eq("id", cat.id);
              // Update local cache so children can reference
              cat.yampi_category_id = yampiId;
              yampiCategories[slug] = yampiId;
              yampiCategories[name] = yampiId;
              created++;
              console.log(`[YAMPI-CAT] Created category "${cat.name}" -> yampi_id=${yampiId}`);
            }
          } else {
            errors++;
            errorDetails.push({ category_id: cat.id, message: `${res.status}: ${JSON.stringify(res.data)}` });
          }
        }

        await delay(1000);
      } catch (err: unknown) {
        errors++;
        errorDetails.push({ category_id: cat.id, message: err instanceof Error ? err.message : "Erro desconhecido" });
      }
    }

    const result = { created, matched, errors, error_details: errorDetails.slice(0, 20) };

    // Log
    await supabase.from("integrations_checkout_test_logs").insert({
      provider: "yampi",
      status: errors > 0 ? "partial" : "success",
      message: `Categorias: ${created} criadas, ${matched} mapeadas, ${errors} erros`,
      payload_preview: result,
    });

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[YAMPI-CAT] Fatal:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
