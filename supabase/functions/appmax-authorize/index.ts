import {
  corsHeaders,
  getServiceClient,
  getActiveSettings,
  getSettingsByEnv,
  getAppToken,
  appmaxRequest,
  logAppmax,
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
    const externalKey = body.external_key;
    const envOverride = body.environment; // optional

    if (!externalKey) return errorResponse("external_key é obrigatório", 400);

    // Load settings: use explicit env or active env
    const settings = envOverride
      ? await getSettingsByEnv(supabase, envOverride)
      : await getActiveSettings(supabase);

    if (!settings) {
      return errorResponse("Nenhum ambiente Appmax configurado/ativo", 400);
    }

    const env = settings.environment;
    const appId = settings.app_id;
    const isBootstrap = !appId;
    const callbackUrl =
      settings.callback_url ||
      Deno.env.get("APPMAX_CALLBACK_URL") ||
      "https://vanessalima.lovable.app/admin/integrations/appmax/callback";
    const portalUrl = settings.base_portal_url;

    if (!settings.base_api_url) {
      return errorResponse(`base_api_url não configurado para ${env}`, 400);
    }

    // Check if already connected
    const { data: existing } = await supabase
      .from("appmax_installations")
      .select("id, status")
      .eq("external_key", externalKey)
      .eq("environment", env)
      .maybeSingle();

    if (existing?.status === "connected") {
      return jsonResponse(
        { error: "Já conectado. Desconecte antes de reconectar.", status: "already_connected" },
        409
      );
    }

    // Build authorize payload
    const callbackWithKey = `${callbackUrl}?external_key=${encodeURIComponent(externalKey)}`;
    const authorizePayload: Record<string, string> = {
      external_key: externalKey,
      url_callback: callbackWithKey,
    };
    if (appId) authorizePayload.app_id = appId;

    await logAppmax(supabase, "info", `Chamando /app/authorize (${env})`, {
      external_key: externalKey,
      bootstrap: isBootstrap,
      environment: env,
    });

    // Use appmaxRequest helper (with retry)
    const result = await appmaxRequest(supabase, settings, "/app/authorize", {
      method: "POST",
      body: authorizePayload as any,
    });

    if (!result.ok) {
      await logAppmax(supabase, "error", `Falha em /app/authorize (${env})`, {
        status: result.status,
        response: result.data,
        bootstrap: isBootstrap,
      });
      throw new Error(
        result.data?.message || JSON.stringify(result.data) || "Falha ao autorizar"
      );
    }

    // Extract token/hash
    const authorizeToken =
      result.data.token ||
      result.data.hash ||
      result.data.data?.token ||
      result.data.data?.hash;

    if (!authorizeToken) {
      await logAppmax(supabase, "error", "Token de autorização não retornado", {
        response: result.data,
      });
      throw new Error("Token de autorização não retornado pela Appmax");
    }

    // Upsert installation
    const upsertData = {
      external_key: externalKey,
      environment: env,
      app_id: appId || "bootstrap-pending",
      authorize_token: authorizeToken,
      status: "pending",
      last_error: null,
    };

    if (existing?.id) {
      await supabase.from("appmax_installations").update(upsertData).eq("id", existing.id);
    } else {
      await supabase.from("appmax_installations").insert(upsertData);
    }

    await logAppmax(supabase, "info", `Autorização iniciada (${env})`, {
      external_key: externalKey,
      bootstrap: isBootstrap,
    });

    const redirectUrl = portalUrl
      ? `${portalUrl}/appstore/integration/${authorizeToken}`
      : authorizeToken;

    return jsonResponse({ redirect_url: redirectUrl, bootstrap: isBootstrap, environment: env });
  } catch (err: any) {
    await logAppmax(supabase, "error", `Erro em appmax-authorize: ${err.message}`);
    return errorResponse(err.message);
  }
});
