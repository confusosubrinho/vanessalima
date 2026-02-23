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

    const env = environment || "sandbox";
    const settings = await getSettingsByEnv(supabase, env);
    if (!settings) {
      return errorResponse(`Nenhuma configuração encontrada para ambiente '${env}'`, 400);
    }

    if (!settings.base_api_url) {
      return errorResponse(`base_api_url não configurado para ambiente '${env}'`, 400);
    }

    // Get app token
    const accessToken = await getAppToken(supabase, settings);

    // Try multiple payload formats for /app/client/generate
    const generateUrl = `${settings.base_api_url}/app/client/generate`;

    // Attempt 1: { token }
    // Attempt 2: { install_token }
    // Attempt 3: { hash }
    // Attempt 4: { token, external_key }
    // Attempt 5: { token, app_id, external_key }
    const payloadAttempts = [
      { token },
      { install_token: token },
      { hash: token },
      { token, external_key },
      { token, app_id: settings.app_id, external_key },
    ];

    let lastResponse: any = null;
    let lastRawText = "";
    let lastStatus = 0;
    let successData: any = null;

    for (const payload of payloadAttempts) {
      try {
        const generateRes = await fetch(generateUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });

        lastStatus = generateRes.status;
        lastRawText = await generateRes.text();

        let parsed: any;
        try {
          parsed = JSON.parse(lastRawText);
        } catch {
          parsed = { raw: lastRawText.slice(0, 500) };
        }

        lastResponse = parsed;

        await logAppmax(supabase, "info", `generate attempt: ${JSON.stringify(Object.keys(payload))}`, {
          status: generateRes.status,
          ok: generateRes.ok,
          response_keys: typeof parsed === 'object' ? Object.keys(parsed) : [],
          response_preview: lastRawText.slice(0, 300),
          payload_keys: Object.keys(payload),
        }, requestId);

        if (generateRes.ok) {
          const merchantClientId = parsed.client_id || parsed.data?.client_id;
          const merchantClientSecret = parsed.client_secret || parsed.data?.client_secret;

          if (merchantClientId && merchantClientSecret) {
            successData = { merchantClientId, merchantClientSecret, payload };
            break;
          }
        }

        // If 400, try next payload format
        if (generateRes.status === 400) continue;

        // If non-400 error, stop trying
        if (!generateRes.ok) break;
      } catch (fetchErr: any) {
        await logAppmax(supabase, "error", `generate fetch error: ${fetchErr.message}`, {
          payload_keys: Object.keys(payload),
        }, requestId);
      }
    }

    if (successData) {
      // Success! Save credentials
      const encryptedSecret = await encrypt(successData.merchantClientSecret);

      await supabase
        .from("appmax_installations")
        .update({
          merchant_client_id: successData.merchantClientId,
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
        message: `Credenciais geradas com sucesso (${env})`,
        payload: {
          merchant_client_id: successData.merchantClientId,
          used_payload_keys: Object.keys(successData.payload),
        },
        headers: safeHeaders,
      });

      return jsonResponse({ success: true, status: "connected", environment: env });
    }

    // All attempts failed — log full diagnostic
    const errMsg = lastResponse?.message || lastResponse?.error || lastResponse?.error_description || "Falha ao gerar credenciais";
    const fullDiag = {
      api_status: lastStatus,
      api_response: typeof lastResponse === 'object' ? lastResponse : { raw: lastRawText.slice(0, 500) },
      attempted_payload_formats: payloadAttempts.map(p => Object.keys(p)),
      generate_url: generateUrl,
      token_preview: maskSecret(token),
    };

    await logHandshake(supabase, {
      environment: env,
      stage: "callback",
      external_key,
      request_id: requestId,
      ok: false,
      http_status: lastStatus,
      message: `Todas as tentativas falharam em /app/client/generate: ${errMsg}`,
      payload: fullDiag,
      headers: safeHeaders,
    });

    await logAppmax(supabase, "error", `Falha definitiva em /app/client/generate (${env})`, fullDiag);

    await supabase
      .from("appmax_installations")
      .update({
        status: "error",
        last_error: `HTTP ${lastStatus}: ${errMsg}`,
      })
      .eq("external_key", external_key)
      .eq("environment", env);

    return errorResponse(`${errMsg} (HTTP ${lastStatus}). Verifique os logs de diagnóstico.`);
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
