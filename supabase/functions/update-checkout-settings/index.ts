/**
 * PR8: Atualiza a tabela canônica checkout_settings_canonical (source of truth).
 * Espelha em integrations_checkout e integrations_checkout_providers para compatibilidade com legado.
 * Requer Authorization: Bearer <user_jwt>. Apenas admin. Valida combinações provider/channel/experience.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
};

const SINGLETON_ID = "00000000-0000-0000-0000-000000000001";

type Provider = "stripe" | "yampi" | "appmax";
type Channel = "internal" | "external";
type Experience = "transparent" | "native";

function jsonRes(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function validateCombination(provider: Provider, channel: Channel, experience: Experience): string | null {
  if (provider === "yampi" && channel !== "external") {
    return "Yampi só permite channel external.";
  }
  if (provider === "appmax" && channel === "external") {
    return "Appmax não suporta channel external.";
  }
  if (channel === "internal" && provider === "yampi") {
    return "Yampi não suporta channel internal.";
  }
  if (provider === "stripe" && channel === "external" && experience !== "native") {
    return "Stripe com channel external deve usar experience native.";
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonRes({ success: false, error: "Method not allowed" }, 405);

  const userJwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!userJwt) return jsonRes({ success: false, error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });
  const { data: isAdmin } = await supabaseUser.rpc("is_admin");
  if (!isAdmin) return jsonRes({ success: false, error: "Forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    return jsonRes({ success: false, error: "Body JSON inválido" }, 400);
  }

  const active_provider = body.active_provider as Provider | undefined;
  const channel = body.channel as Channel | undefined;
  const experience = body.experience as Experience | undefined;
  const environment = (body.environment as "sandbox" | "production" | undefined) ?? "production";
  const notes = body.notes as string | undefined;
  const change_reason = body.change_reason as string | undefined;
  const request_id = (body.request_id as string) || req.headers.get("x-request-id") || undefined;

  if (!active_provider || !channel || !experience) {
    return jsonRes(
      { success: false, error: "active_provider, channel e experience são obrigatórios" },
      400
    );
  }
  const providers: Provider[] = ["stripe", "yampi", "appmax"];
  const channels: Channel[] = ["internal", "external"];
  const experiences: Experience[] = ["transparent", "native"];
  if (!providers.includes(active_provider) || !channels.includes(channel) || !experiences.includes(experience)) {
    return jsonRes(
      { success: false, error: "active_provider, channel ou experience com valor inválido" },
      400
    );
  }
  if (environment !== "sandbox" && environment !== "production") {
    return jsonRes({ success: false, error: "environment deve ser sandbox ou production" }, 400);
  }

  const validationError = validateCombination(active_provider, channel, experience);
  if (validationError) return jsonRes({ success: false, error: validationError }, 400);

  const supabase = createClient(supabaseUrl, serviceKey);

  // Ler/atualizar apenas a tabela canônica (singleton: sempre 1 linha)
  const { data: current, error: fetchError } = await supabase
    .from("checkout_settings_canonical")
    .select("*")
    .eq("id", SINGLETON_ID)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    console.error("update-checkout-settings fetch error:", fetchError);
    return jsonRes({ success: false, error: "Erro ao ler configuração atual" }, 500);
  }

  const oldValue = current
    ? {
        enabled: current.enabled,
        active_provider: current.active_provider,
        channel: current.channel,
        experience: current.experience,
        environment: current.environment,
        config_version: current.config_version,
        updated_at: current.updated_at,
        updated_by: current.updated_by,
        notes: current.notes,
      }
    : {};

  const { data: user } = await supabaseUser.auth.getUser();
  const updatedBy = user?.user?.id ?? null;

  const updatePayload = {
    enabled: current?.enabled ?? true,
    active_provider: active_provider,
    channel,
    experience,
    environment,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
    notes: notes ?? current?.notes ?? null,
  };

  const { data: updated, error: updateError } = await supabase
    .from("checkout_settings_canonical")
    .update(updatePayload)
    .eq("id", SINGLETON_ID)
    .select()
    .single();

  if (updateError) {
    console.error("update-checkout-settings update error:", updateError);
    return jsonRes({ success: false, error: updateError.message }, 500);
  }

  const newValue = {
    enabled: updated.enabled,
    active_provider: updated.active_provider,
    channel: updated.channel,
    experience: updated.experience,
    environment: updated.environment,
    config_version: updated.config_version,
    updated_at: updated.updated_at,
    updated_by: updated.updated_by,
    notes: updated.notes,
  };

  await supabase.from("checkout_settings_audit").insert({
    settings_id: SINGLETON_ID,
    changed_by: updatedBy,
    old_value: oldValue,
    new_value: newValue,
    change_reason: change_reason ?? null,
    request_id: request_id ?? null,
  });

  // Espelhar em tabelas legadas (compat). checkout_settings_canonical é source of truth.
  const { data: legacyRow } = await supabase
    .from("integrations_checkout")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (legacyRow?.id) {
    await supabase
      .from("integrations_checkout")
      .update({
        provider: updated.active_provider,
        enabled: updated.enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", legacyRow.id);
  }

  const { data: providerRows } = await supabase
    .from("integrations_checkout_providers")
    .select("id, provider, config");
  if (providerRows?.length) {
    for (const row of providerRows) {
      const isActive = row.provider === updated.active_provider;
      const config = (row.config as Record<string, unknown>) || {};
      const newConfig =
        row.provider === "stripe"
          ? { ...config, checkout_mode: updated.channel === "external" ? "external" : "embedded" }
          : config;
      await supabase
        .from("integrations_checkout_providers")
        .update({ is_active: isActive, config: newConfig, updated_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  return jsonRes({ success: true, settings: updated });
});
