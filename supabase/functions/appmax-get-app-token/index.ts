import {
  corsHeaders,
  getServiceClient,
  getActiveSettings,
  getSettingsByEnv,
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

    const token = await getAppToken(supabase, settings);

    await logAppmax(supabase, "info", `Token obtido via get-app-token (${settings.environment})`, {
      expires_in: "from_cache_or_fresh",
      environment: settings.environment,
    });

    return jsonResponse({
      access_token: token,
      environment: settings.environment,
    });
  } catch (err: any) {
    await logAppmax(supabase, "error", `Erro em appmax-get-app-token: ${err.message}`);
    return errorResponse(err.message);
  }
});
