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

  // Auth check — admin only
  const authResult = await requireAdmin(req, supabase);
  if (authResult instanceof Response) return authResult;

  try {
    const body = await req.json();
    const { external_key, token, environment } = body;

    if (!external_key || !token) {
      return errorResponse("external_key e token são obrigatórios", 400);
    }

    // Determine environment: explicit param > fallback "sandbox"
    const env = environment || "sandbox";

    // Load settings for the target environment
    const settings = await getSettingsByEnv(supabase, env);
    if (!settings) {
      return errorResponse(`Nenhuma configuração encontrada para ambiente '${env}'`, 400);
    }

    if (!settings.base_api_url) {
      return errorResponse(`base_api_url não configurado para ambiente '${env}'`, 400);
    }

    // Get app token using shared cache + encryption
    const accessToken = await getAppToken(supabase, settings);

    // Call /app/client/generate
    const generateUrl = `${settings.base_api_url}/app/client/generate`;
    const generateRes = await fetch(generateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token }),
    });

    const rawText = await generateRes.text();
    let generateData: any;
    try {
      generateData = JSON.parse(rawText);
    } catch {
      await logHandshake(supabase, {
        environment: env,
        stage: "callback",
        external_key,
        request_id: requestId,
        ok: false,
        http_status: generateRes.status,
        message: `Resposta não-JSON de /app/client/generate: HTTP ${generateRes.status}`,
        payload: { response_preview: rawText.slice(0, 300) },
        headers: safeHeaders,
      });
      return errorResponse(`Resposta inválida de /app/client/generate (HTTP ${generateRes.status})`);
    }

    if (!generateRes.ok) {
      const errMsg = generateData.message || "Falha ao gerar credenciais";

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
          api_response_message: errMsg,
        },
        headers: safeHeaders,
      });

      await logAppmax(supabase, "error", `Falha em /app/client/generate (${env})`, {
        status: generateRes.status,
        response_message: errMsg,
      });

      await supabase
        .from("appmax_installations")
        .update({
          status: "error",
          last_error: errMsg,
        })
        .eq("external_key", external_key)
        .eq("environment", env);

      return errorResponse(errMsg);
    }

    const merchantClientId =
      generateData.client_id || generateData.data?.client_id;
    const merchantClientSecret =
      generateData.client_secret || generateData.data?.client_secret;

    if (!merchantClientId || !merchantClientSecret) {
      await logHandshake(supabase, {
        environment: env,
        stage: "callback",
        external_key,
        request_id: requestId,
        ok: false,
        http_status: generateRes.status,
        message: "Credenciais do merchant não retornadas pela Appmax",
        payload: { response_keys: Object.keys(generateData) },
        headers: safeHeaders,
      });

      await logAppmax(supabase, "error", `Credenciais do merchant não retornadas (${env})`, {
        response_keys: Object.keys(generateData),
      });
      return errorResponse("Credenciais do merchant não retornadas pela Appmax");
    }

    // Encrypt merchant_client_secret before storing
    const encryptedSecret = await encrypt(merchantClientSecret);

    // Update installation with encrypted credentials
    await supabase
      .from("appmax_installations")
      .update({
        merchant_client_id: merchantClientId,
        merchant_client_secret: null, // clear plaintext
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
      http_status: generateRes.status,
      message: `Credenciais do merchant geradas com sucesso (${env})`,
      payload: {
        merchant_client_id: merchantClientId,
      },
      headers: safeHeaders,
    });

    await logAppmax(supabase, "info", `Credenciais do merchant geradas com sucesso (${env})`, {
      external_key,
      merchant_client_id: merchantClientId,
      merchant_client_secret: maskSecret(merchantClientSecret),
    });

    // NEVER return merchant_client_secret to frontend
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
    await logAppmax(supabase, "error", `Erro em appmax-generate-merchant-keys: ${err.message}`);
    return errorResponse(err.message);
  }
});
