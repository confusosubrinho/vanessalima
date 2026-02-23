import {
  corsHeaders,
  getServiceClient,
  getActiveSettings,
  getSettingsByEnv,
  getAppToken,
  logAppmax,
  logHandshake,
  extractSafeHeaders,
  encrypt,
  jsonResponse,
  maskSecret,
} from "../_shared/appmax.ts";

/** Structured error response with error_code + message */
function healthError(error_code: string, message: string, status: number) {
  return new Response(JSON.stringify({ error_code, message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = getServiceClient();
  const requestId = crypto.randomUUID();
  const safeHeaders = extractSafeHeaders(req);

  async function fail(env: string, extKey: string | null, errorCode: string, msg: string, status: number, payload?: Record<string, unknown>, errStack?: string) {
    await logHandshake(supabase, {
      environment: env,
      stage: "healthcheck",
      external_key: extKey,
      request_id: requestId,
      ok: false,
      http_status: status,
      message: msg,
      payload: payload || null,
      headers: safeHeaders,
      error_stack: errStack || null,
    });
    return healthError(errorCode, msg, status);
  }

  try {
    // Accept both GET and POST (Appmax may use either)
    if (req.method !== "POST" && req.method !== "GET") {
      return await fail("unknown", null, "METHOD_NOT_ALLOWED", "Method not allowed. Use GET or POST.", 405);
    }

    // Parse body from POST or query params from GET
    let body: Record<string, unknown> = {};

    if (req.method === "GET") {
      // Parse from query string
      const url = new URL(req.url);
      for (const [k, v] of url.searchParams) {
        body[k] = v;
      }
    } else {
      // POST: parse JSON or form-urlencoded
      const ct = req.headers.get("content-type") || "";
      const rawText = await req.text();

      try {
        if (ct.includes("application/json")) {
          body = JSON.parse(rawText);
        } else if (ct.includes("x-www-form-urlencoded")) {
          const params = new URLSearchParams(rawText);
          for (const [k, v] of params) body[k] = v;
        } else {
          // Try JSON first, then form-urlencoded
          try {
            body = JSON.parse(rawText);
          } catch {
            const params = new URLSearchParams(rawText);
            for (const [k, v] of params) body[k] = v;
          }
        }
      } catch {
        return await fail("unknown", null, "INVALID_BODY", "Corpo da requisição inválido.", 400, { raw_preview: rawText.slice(0, 200) });
      }
    }

    const { app_id, client_id, client_secret, external_key } = body as Record<string, string>;

    await logAppmax(supabase, "info", `Health check recebido (${req.method})`, {
      method: req.method,
      app_id,
      external_key,
      has_client_id: !!client_id,
      has_client_secret: !!client_secret,
      body_keys: Object.keys(body),
    }, requestId);

    // Validate required fields
    if (!external_key) {
      return await fail("unknown", null, "MISSING_EXTERNAL_KEY", "Campo obrigatório ausente: external_key", 400, {
        has_client_id: !!client_id,
        has_client_secret: !!client_secret,
        has_external_key: false,
        body_keys: Object.keys(body),
        method: req.method,
      });
    }

    // Find environment from installation or active settings
    const envAppId = Deno.env.get("APPMAX_APP_ID");
    let settings: any = null;

    for (const envName of ["sandbox", "production"]) {
      const { data: inst } = await supabase
        .from("appmax_installations")
        .select("environment")
        .eq("external_key", external_key)
        .eq("environment", envName)
        .maybeSingle();

      if (inst) {
        settings = await getSettingsByEnv(supabase, envName);
        break;
      }
    }

    if (!settings) {
      settings = await getActiveSettings(supabase);
    }

    if (!settings) {
      return await fail("unknown", external_key, "NO_ENVIRONMENT", "Nenhum ambiente configurado.", 500);
    }

    const env = settings.environment;
    const savedAppId = settings.app_id || envAppId;

    // Validate app_id
    if (!savedAppId) {
      // BOOTSTRAP MODE
      if (app_id) {
        await supabase
          .from("appmax_settings")
          .update({ app_id: String(app_id) })
          .eq("id", settings.id);
        await logAppmax(supabase, "info", `Bootstrap: app_id salvo (${env})`, { app_id, external_key }, requestId);
      }
    } else {
      // NORMAL MODE: validate app_id if provided
      if (app_id && String(app_id) !== String(savedAppId)) {
        return await fail(env, external_key, "APP_ID_MISMATCH", `app_id inválido: recebido=${app_id}, esperado=${savedAppId}`, 401, {
          received_app_id: app_id,
          expected_app_id: savedAppId,
        });
      }
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
      external_id: externalId,
      status: "connected",
      last_error: null,
    };

    // If merchant credentials are provided (POST with full payload), save them
    if (client_id && client_secret) {
      updateData.merchant_client_id = client_id;
      updateData.merchant_client_secret = maskSecret(client_secret);
      try {
        updateData.merchant_client_secret_encrypted = await encrypt(client_secret);
      } catch (encErr: any) {
        await logAppmax(supabase, "warn", `Falha ao criptografar secret: ${encErr.message}`, {}, requestId);
      }
    }

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
          app_id: String(app_id || savedAppId || "unknown"),
        });
      if (error) throw error;
    }

    // If no credentials came with the healthcheck, try to generate them now
    const resolvedExternalKey = external_key;
    if (!client_id || !client_secret) {
      const { data: installData } = await supabase
        .from("appmax_installations")
        .select("authorize_token")
        .eq("external_key", resolvedExternalKey)
        .eq("environment", env)
        .maybeSingle();

      if (installData?.authorize_token) {
        try {
          const generateUrl = `${settings.base_api_url}/app/client/generate`;
          const accessToken = await getAppToken(supabase, settings);

          const genRes = await fetch(generateUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ token: installData.authorize_token }),
          });

          const genData = await genRes.json();
          const merchantClientId =
            genData?.data?.client?.client_id || genData?.data?.client_id || null;
          const merchantClientSecret =
            genData?.data?.client?.client_secret || genData?.data?.client_secret || null;

          if (merchantClientId && merchantClientSecret) {
            const encryptedSecret = await encrypt(merchantClientSecret);
            await supabase
              .from("appmax_installations")
              .update({
                merchant_client_id: merchantClientId,
                merchant_client_secret_encrypted: encryptedSecret,
                last_error: null,
              })
              .eq("external_key", resolvedExternalKey)
              .eq("environment", env);

            await logAppmax(supabase, "info", `Generate automático OK após healthcheck (${env})`, {
              merchant_client_id: merchantClientId,
            }, requestId);
          } else {
            await logAppmax(supabase, "warn", `Generate automático sem credenciais (${env})`, {
              gen_status: genRes.status,
              gen_keys: Object.keys(genData?.data || {}),
            }, requestId);
          }
        } catch (genErr: any) {
          await logAppmax(supabase, "warn", `Generate automático falhou (${env}): ${genErr.message}`, {}, requestId);
          // Não falha o healthcheck por causa do generate
        }
      }
    }

    // Log success
    await logHandshake(supabase, {
      environment: env,
      stage: "healthcheck",
      external_key,
      request_id: requestId,
      ok: true,
      http_status: 200,
      message: `Health check OK — connected (${env}) via ${req.method}`,
      payload: {
        external_id: externalId,
        merchant_client_id: client_id || null,
        has_credentials: !!(client_id && client_secret),
        method: req.method,
        app_id: app_id || savedAppId,
      },
      headers: safeHeaders,
    });

    // MANDATORY: return { external_id } on success
    return jsonResponse({ external_id: externalId });
  } catch (err: any) {
    await logHandshake(supabase, {
      environment: "unknown",
      stage: "healthcheck",
      external_key: null,
      request_id: requestId,
      ok: false,
      http_status: 500,
      message: `Erro não tratado: ${err.message}`,
      headers: safeHeaders,
      error_stack: err.stack || null,
    });
    return healthError("INTERNAL_ERROR", err.message, 500);
  }
});
