import {
  corsHeaders,
  getServiceClient,
  getSettingsByEnv,
  getAppToken,
  logAppmax,
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
    const generateRes = await fetch(`${settings.base_api_url}/app/client/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token }),
    });

    const generateData = await generateRes.json();

    if (!generateRes.ok) {
      await logAppmax(supabase, "error", `Falha em /app/client/generate (${env})`, {
        status: generateRes.status,
        response_message: generateData.message || "unknown",
      });

      await supabase
        .from("appmax_installations")
        .update({
          status: "error",
          last_error: generateData.message || "Falha ao gerar credenciais",
        })
        .eq("external_key", external_key)
        .eq("environment", env);

      return errorResponse(generateData.message || "Falha ao gerar credenciais do merchant");
    }

    const merchantClientId =
      generateData.client_id || generateData.data?.client_id;
    const merchantClientSecret =
      generateData.client_secret || generateData.data?.client_secret;

    if (!merchantClientId || !merchantClientSecret) {
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

    await logAppmax(supabase, "info", `Credenciais do merchant geradas com sucesso (${env})`, {
      external_key,
      merchant_client_id: merchantClientId,
      merchant_client_secret: maskSecret(merchantClientSecret),
    });

    // NEVER return merchant_client_secret to frontend
    return jsonResponse({ success: true, status: "connected", environment: env });
  } catch (err: any) {
    await logAppmax(supabase, "error", `Erro em appmax-generate-merchant-keys: ${err.message}`);
    return errorResponse(err.message);
  }
});
