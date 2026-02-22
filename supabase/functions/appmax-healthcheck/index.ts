import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function logAppmax(
  supabase: any,
  level: string,
  message: string,
  meta?: Record<string, unknown>
) {
  try {
    await supabase
      .from("appmax_logs")
      .insert({ level, scope: "appmax", message, meta: meta ?? {} });
  } catch (_) {}
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { app_id, client_id, client_secret, external_key } = body;

    await logAppmax(supabase, "info", "Health check recebido", {
      app_id,
      external_key,
      has_client_id: !!client_id,
      has_client_secret: !!client_secret,
    });

    if (!client_id || !client_secret || !external_key) {
      await logAppmax(supabase, "error", "Campos obrigatórios ausentes no health check", {
        has_client_id: !!client_id,
        has_client_secret: !!client_secret,
        has_external_key: !!external_key,
      });
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read saved app_id from appmax_settings
    const { data: settings } = await supabase
      .from("appmax_settings")
      .select("id, app_id")
      .eq("environment", "sandbox")
      .maybeSingle();

    const savedAppId = settings?.app_id;

    if (!savedAppId) {
      // === BOOTSTRAP MODE: first installation ===
      // No app_id saved yet — accept the incoming one and save it
      if (!app_id) {
        await logAppmax(supabase, "error", "Bootstrap: app_id não enviado pela Appmax");
        return new Response(JSON.stringify({ error: "app_id is required for bootstrap" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Save the app_id as official
      if (settings?.id) {
        await supabase
          .from("appmax_settings")
          .update({ app_id: String(app_id), client_id, client_secret })
          .eq("id", settings.id);
      } else {
        await supabase
          .from("appmax_settings")
          .insert({
            environment: "sandbox",
            app_id: String(app_id),
            client_id,
            client_secret,
          });
      }

      await logAppmax(supabase, "info", "Bootstrap: app_id salvo como oficial", {
        app_id,
        external_key,
      });
    } else {
      // === NORMAL MODE: validate app_id ===
      if (String(app_id) !== String(savedAppId)) {
        await logAppmax(supabase, "error", "app_id inválido no health check", {
          received: app_id,
          expected: savedAppId,
        });
        return new Response(JSON.stringify({ error: "Invalid app_id" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Upsert installation
    const { data: existing } = await supabase
      .from("appmax_installations")
      .select("id, external_id")
      .eq("external_key", external_key)
      .eq("environment", "sandbox")
      .maybeSingle();

    const externalId = existing?.external_id || crypto.randomUUID();

    const updateData = {
      merchant_client_id: client_id,
      merchant_client_secret: client_secret,
      external_id: externalId,
      status: "connected",
      last_error: null,
    };

    if (existing?.id) {
      const { error } = await supabase
        .from("appmax_installations")
        .update(updateData)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("appmax_installations")
        .insert({
          ...updateData,
          external_key,
          environment: "sandbox",
          app_id: String(app_id),
        });
      if (error) throw error;
    }

    await logAppmax(supabase, "info", "Health check concluído — status: connected", {
      external_key,
      external_id: externalId,
      merchant_client_id: client_id,
      bootstrap: !savedAppId,
    });

    return new Response(
      JSON.stringify({ external_id: externalId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    await logAppmax(supabase, "error", `Erro no health check: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
