import {
  corsHeaders,
  getServiceClient,
  getActiveSettings,
  getClientSecret,
  getAppToken,
  logAppmax,
  requireAdmin,
  errorResponse,
  jsonResponse,
  maskSecret,
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
    const { data: settings } = await supabase
      .from("appmax_settings")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();

    if (!settings) {
      return errorResponse("Nenhum ambiente Appmax ativo configurado", 400);
    }

    const env = settings.environment;

    // Diagnostic: log which credential source is being used
    const clientIdSource = settings.client_id ? "db" : (Deno.env.get("APPMAX_CLIENT_ID") ? "env" : "none");
    const hasEncryptedSecret = !!settings.client_secret_encrypted;
    const hasPlaintextSecret = !!settings.client_secret;
    const hasEnvSecret = !!Deno.env.get("APPMAX_CLIENT_SECRET");

    await logAppmax(supabase, "info", `get-app-token: resolvendo credenciais (${env})`, {
      environment: env,
      client_id_source: clientIdSource,
      client_id_preview: maskSecret(settings.client_id || Deno.env.get("APPMAX_CLIENT_ID") || ""),
      has_encrypted_secret: hasEncryptedSecret,
      has_plaintext_secret: hasPlaintextSecret,
      has_env_secret: hasEnvSecret,
      base_auth_url: settings.base_auth_url || "NOT_SET",
    });

    const token = await getAppToken(supabase, settings);

    await logAppmax(supabase, "info", `Token obtido via get-app-token (${env})`, {
      expires_in: "from_cache_or_fresh",
      environment: env,
    });

    return jsonResponse({
      access_token: token,
      environment: env,
    });
  } catch (err: any) {
    await logAppmax(supabase, "error", `Erro em appmax-get-app-token: ${err.message}`, {
      stack: err.stack?.slice(0, 500),
    });
    return errorResponse(err.message);
  }
});
