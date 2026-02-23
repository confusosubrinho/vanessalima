import {
  corsHeaders,
  getServiceClient,
  getSettingsByEnv,
  getAppToken,
  logAppmax,
  logHandshake,
  extractSafeHeaders,
  encrypt,
  maskSecret,
  requireAdmin,
  errorResponse,
  jsonResponse,
} from "../_shared/appmax.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = getServiceClient();
  const requestId = crypto.randomUUID();
  const safeHeaders = extractSafeHeaders(req);

  const authResult = await requireAdmin(req, supabase);
  if (authResult instanceof Response) return authResult;

  try {
    const body = await req.json();
    const { external_key, token, environment } = body;

    if (!external_key || !token) {
      return errorResponse("external_key e token são obrigatórios", 400);
    }

    const env = environment || "sandbox";

    // Check if already connected — DON'T overwrite a successful healthcheck
    const { data: currentInstall } = await supabase
      .from("appmax_installations")
      .select("status, merchant_client_id")
      .eq("external_key", external_key)
      .eq("environment", env)
      .maybeSingle();

    if (currentInstall?.status === "connected" && currentInstall?.merchant_client_id) {
      return jsonResponse({ success: true, status: "connected", environment: env, source: "healthcheck" });
    }

    const settings = await getSettingsByEnv(supabase, env);
    if (!settings) {
      return errorResponse(`Nenhuma configuração encontrada para ambiente '${env}'`, 400);
    }
    if (!settings.base_api_url) {
      return errorResponse(`base_api_url não configurado para ambiente '${env}'`, 400);
    }

    const accessToken = await getAppToken(supabase, settings);
    const generateUrl = `${settings.base_api_url}/app/client/generate`;

    // Per Appmax docs: POST /app/client/generate with { "token": "HASH" }
    // The token is the hash from /app/authorize
    const generateRes = await fetch(generateUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    const rawText = await generateRes.text();
    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = { raw: rawText.slice(0, 1000) };
    }

    await logAppmax(supabase, "info", `generate response (${env})`, {
      request_id: requestId,
      status: generateRes.status,
      ok: generateRes.ok,
      response_keys: parsed ? Object.keys(parsed) : [],
      response_preview: rawText.slice(0, 500),
    });

    if (!generateRes.ok) {
      const errMsg =
        typeof parsed?.errors?.message === "string"
          ? parsed.errors.message
          : typeof parsed?.errors?.message === "object"
            ? JSON.stringify(parsed.errors.message)
            : parsed?.message || "Falha ao gerar credenciais";

      await logHandshake(supabase, {
        environment: env,
        stage: "callback",
        external_key,
        request_id: requestId,
        ok: false,
        http_status: generateRes.status,
        message: `Falha em /app/client/generate: ${errMsg}`,
        payload: {
          api_status: generateRes.status,
          api_response: parsed,
          generate_url: generateUrl,
          token_preview: maskSecret(token),
        },
        headers: safeHeaders,
      });

      // DON'T update installation status to error if it was connected via healthcheck
      const { data: checkAgain } = await supabase
        .from("appmax_installations")
        .select("status, merchant_client_id")
        .eq("external_key", external_key)
        .eq("environment", env)
        .maybeSingle();

      if (checkAgain?.status === "connected" && checkAgain?.merchant_client_id) {
        return jsonResponse({ success: true, status: "connected", environment: env, source: "healthcheck" });
      }

      return errorResponse(`HTTP ${generateRes.status}: ${errMsg}`);
    }

    // Per docs, response is: { data: { client: { client_id, client_secret } } }
    const merchantClientId =
      parsed?.data?.client?.client_id ||
      parsed?.data?.client_id ||
      parsed?.client_id ||
      null;
    const merchantClientSecret =
      parsed?.data?.client?.client_secret ||
      parsed?.data?.client_secret ||
      parsed?.client_secret ||
      null;

    if (!merchantClientId || !merchantClientSecret) {
      await logHandshake(supabase, {
        environment: env,
        stage: "callback",
        external_key,
        request_id: requestId,
        ok: false,
        http_status: generateRes.status,
        message: "Resposta de generate não contém client_id/client_secret",
        payload: { response_keys: Object.keys(parsed || {}), data_keys: Object.keys(parsed?.data || {}) },
        headers: safeHeaders,
      });
      return errorResponse("Resposta de generate não contém credenciais do merchant");
    }

    const encryptedSecret = await encrypt(merchantClientSecret);

    await supabase
      .from("appmax_installations")
      .update({
        merchant_client_id: merchantClientId,
        merchant_client_secret: null,
        merchant_client_secret_encrypted: encryptedSecret,
        status: "connected",
        last_error: null,
      })
      .eq("external_key", external_key)
      .eq("environment", env);

    await logHandshake(supabase, {
      environment: env,
      stage: "callback",
      external_key,
      request_id: requestId,
      ok: true,
      http_status: 200,
      message: `Credenciais geradas com sucesso via /app/client/generate (${env})`,
      payload: { merchant_client_id: merchantClientId },
      headers: safeHeaders,
    });

    return jsonResponse({ success: true, status: "connected", environment: env });
  } catch (err: any) {
    await logHandshake(supabase, {
      environment: "unknown",
      stage: "callback",
      external_key: null,
      request_id: requestId,
      ok: false,
      http_status: 500,
      message: `Erro em appmax-generate-merchant-keys: ${err.message}`,
      headers: safeHeaders,
      error_stack: err.stack || null,
    });
    return errorResponse(err.message);
  }
});
