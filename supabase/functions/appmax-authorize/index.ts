import {
  corsHeaders,
  getServiceClient,
  getActiveSettings,
  getSettingsByEnv,
  getAppToken,
  appmaxRequest,
  logAppmax,
  logHandshake,
  extractSafeHeaders,
  requireAdmin,
  errorResponse,
  jsonResponse,
} from "../_shared/appmax.ts";

// ── Dynamic callback URL helpers ──

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/$/, "");
}

function safeOrigin(origin: string | null) {
  if (!origin || origin === "null") return null;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.hostname !== "localhost") return null;
    return normalizeBaseUrl(u.toString());
  } catch {
    return null;
  }
}

async function getSetting(supabase: any, key: string) {
  const { data } = await supabase
    .from("store_settings")
    .select(key)
    .limit(1)
    .maybeSingle();
  return data?.[key] as string | undefined;
}

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

    if (!settings.base_api_url) {
      return errorResponse(`base_api_url não configurado para ${env}`, 400);
    }

    // ── Dynamic callback URL resolution ──
    const originHeader = req.headers.get("origin");
    const configuredBase = await getSetting(supabase, "public_base_url");
    const callbackPath =
      (await getSetting(supabase, "appmax_callback_path")) ||
      "/admin/integrations/appmax/callback";

    const baseUrl = configuredBase
      ? normalizeBaseUrl(configuredBase)
      : safeOrigin(originHeader);

    let callbackUrl: string;
    if (baseUrl) {
      callbackUrl = `${baseUrl}${callbackPath.startsWith("/") ? "" : "/"}${callbackPath}`;
    } else {
      callbackUrl =
        settings.callback_url ||
        Deno.env.get("APPMAX_CALLBACK_URL") ||
        "https://vanessalima.lovable.app/admin/integrations/appmax/callback";
    }

    const portalUrl = settings.base_portal_url;

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

    const healthcheckUrl =
      settings.healthcheck_url ||
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/appmax-healthcheck`;

    const authorizePayload: Record<string, string> = {
      external_key: externalKey,
      url_callback: callbackWithKey,
      healthcheck_url: healthcheckUrl,
    };
    if (appId) authorizePayload.app_id = appId;

    await logAppmax(supabase, "info", `Chamando /app/authorize (${env})`, {
      external_key: externalKey,
      bootstrap: isBootstrap,
      environment: env,
      callback_url: callbackUrl,
    });

    // Use appmaxRequest helper (with retry)
    const result = await appmaxRequest(supabase, settings, "/app/authorize", {
      method: "POST",
      body: authorizePayload as any,
    });

    if (!result.ok) {
      // Log authorize failure to handshake_logs
      await logHandshake(supabase, {
        environment: env,
        stage: "authorize",
        external_key: externalKey,
        request_id: requestId,
        ok: false,
        http_status: result.status,
        message: `Falha em /app/authorize: ${result.data?.message || JSON.stringify(result.data)}`,
        payload: {
          bootstrap: isBootstrap,
          api_status: result.status,
          api_response_message: result.data?.message || null,
        },
        headers: safeHeaders,
      });

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
      await logHandshake(supabase, {
        environment: env,
        stage: "authorize",
        external_key: externalKey,
        request_id: requestId,
        ok: false,
        http_status: result.status,
        message: "Token de autorização não retornado pela Appmax",
        payload: { api_response_keys: Object.keys(result.data || {}) },
        headers: safeHeaders,
      });

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

    const redirectUrl = portalUrl
      ? `${portalUrl}/appstore/integration/${authorizeToken}`
      : authorizeToken;

    // Log authorize success
    await logHandshake(supabase, {
      environment: env,
      stage: "authorize",
      external_key: externalKey,
      request_id: requestId,
      ok: true,
      http_status: result.status,
      message: `Autorização iniciada (${env})`,
      payload: {
        redirect_url: redirectUrl,
        bootstrap: isBootstrap,
        callback_url: callbackUrl,
      },
      headers: safeHeaders,
    });

    await logAppmax(supabase, "info", `Autorização iniciada (${env})`, {
      external_key: externalKey,
      bootstrap: isBootstrap,
    });

    return jsonResponse({ redirect_url: redirectUrl, bootstrap: isBootstrap, environment: env });
  } catch (err: any) {
    await logHandshake(supabase, {
      environment: "unknown",
      stage: "authorize",
      external_key: null,
      request_id: requestId,
      ok: false,
      http_status: 500,
      message: `Erro em appmax-authorize: ${err.message}`,
      headers: safeHeaders,
      error_stack: err.stack || null,
    });
    await logAppmax(supabase, "error", `Erro em appmax-authorize: ${err.message}`);
    return errorResponse(err.message);
  }
});
