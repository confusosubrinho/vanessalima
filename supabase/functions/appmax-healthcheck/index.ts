import {
  corsHeaders,
  getServiceClient,
  getActiveSettings,
  getSettingsByEnv,
  logAppmax,
  encrypt,
  errorResponse,
  jsonResponse,
  maskSecret,
} from "../_shared/appmax.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = getServiceClient();
  const requestId = crypto.randomUUID();

  try {
    if (req.method !== "POST") {
      return errorResponse("Method not allowed", 405);
    }

    const body = await req.json();
    const { app_id, client_id, client_secret, external_key } = body;

    await logAppmax(
      supabase,
      "info",
      "Health check recebido",
      {
        app_id,
        external_key,
        has_client_id: !!client_id,
        has_client_secret: !!client_secret,
      },
      requestId
    );

    if (!client_id || !client_secret || !external_key) {
      await logAppmax(supabase, "error", "Campos obrigatórios ausentes no health check", {
        has_client_id: !!client_id,
        has_client_secret: !!client_secret,
        has_external_key: !!external_key,
      }, requestId);
      return errorResponse("Missing required fields", 400);
    }

    // Validate app_id against configured APPMAX_APP_ID env var
    const envAppId = Deno.env.get("APPMAX_APP_ID");

    // Try to detect environment from external_key or installations
    let settings: any = null;

    for (const env of ["sandbox", "production"]) {
      const { data: inst } = await supabase
        .from("appmax_installations")
        .select("environment")
        .eq("external_key", external_key)
        .eq("environment", env)
        .maybeSingle();

      if (inst) {
        settings = await getSettingsByEnv(supabase, env);
        break;
      }
    }

    // Fallback: use active environment
    if (!settings) {
      settings = await getActiveSettings(supabase);
    }

    if (!settings) {
      await logAppmax(supabase, "error", "Nenhum ambiente configurado para healthcheck", {}, requestId);
      return errorResponse("No environment configured", 500);
    }

    const env = settings.environment;
    const savedAppId = settings.app_id || envAppId;

    if (!savedAppId) {
      // === BOOTSTRAP MODE ===
      if (!app_id) {
        await logAppmax(supabase, "error", "Bootstrap: app_id não enviado", {}, requestId);
        return errorResponse("app_id is required for bootstrap", 400);
      }

      // Save the app_id as official
      await supabase
        .from("appmax_settings")
        .update({ app_id: String(app_id) })
        .eq("id", settings.id);

      await logAppmax(supabase, "info", `Bootstrap: app_id salvo (${env})`, {
        app_id,
        external_key,
      }, requestId);
    } else {
      // === NORMAL MODE: validate app_id ===
      if (app_id && String(app_id) !== String(savedAppId)) {
        await logAppmax(supabase, "error", `app_id inválido (${env})`, {
          received: app_id,
          expected: savedAppId,
        }, requestId);
        return errorResponse("Invalid app_id", 401);
      }
    }

    // Encrypt merchant secrets before storing
    let encryptedClientSecret: string | null = null;
    try {
      encryptedClientSecret = await encrypt(client_secret);
    } catch (encErr: any) {
      await logAppmax(supabase, "warn", `Falha ao criptografar secret: ${encErr.message}`, {}, requestId);
    }

    // Upsert installation
    const { data: existing } = await supabase
      .from("appmax_installations")
      .select("id, external_id")
      .eq("external_key", external_key)
      .eq("environment", env)
      .maybeSingle();

    const externalId = existing?.external_id || crypto.randomUUID();

    const updateData: Record<string, any> = {
      merchant_client_id: client_id,
      merchant_client_secret: maskSecret(client_secret),
      merchant_client_secret_encrypted: encryptedClientSecret,
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
          environment: env,
          app_id: String(app_id || savedAppId),
        });
      if (error) throw error;
    }

    await logAppmax(
      supabase,
      "info",
      `Health check concluído — connected (${env})`,
      {
        external_key,
        external_id: externalId,
        merchant_client_id: client_id,
        bootstrap: !savedAppId,
      },
      requestId
    );

    // Appmax requires external_id in the response
    return jsonResponse({ external_id: externalId });
  } catch (err: any) {
    await logAppmax(supabase, "error", `Erro no health check: ${err.message}`, {}, requestId);
    return errorResponse(err.message);
  }
});
