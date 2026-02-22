import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function logAppmax(
  supabase: any,
  level: string,
  message: string,
  meta?: Record<string, unknown>
) {
  try {
    await supabase
      .from("appmax_logs")
      .insert({ level, scope: "appmax", message, meta: meta ?? {} });
  } catch (_) {}
}

async function getAppToken(supabase: any): Promise<string> {
  const clientId = Deno.env.get("APPMAX_CLIENT_ID")!;
  const clientSecret = Deno.env.get("APPMAX_CLIENT_SECRET")!;
  const authBaseUrl = "https://auth.sandboxappmax.com.br";

  const res = await fetch(`${authBaseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    await logAppmax(supabase, "error", "Falha ao obter app token para authorize", {
      status: res.status,
      error: data.error || data.message,
    });
    throw new Error("Falha ao obter token do aplicativo");
  }
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(
    authHeader.replace("Bearer ", "")
  );
  if (claimsErr || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: claimsData.claims.sub,
    _role: "admin",
  });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const externalKey = body.external_key;
    if (!externalKey) throw new Error("external_key é obrigatório");

    // Try to get app_id: first from appmax_settings, then from env
    const { data: settings } = await supabase
      .from("appmax_settings")
      .select("app_id, callback_url")
      .eq("environment", "sandbox")
      .maybeSingle();

    const appId = settings?.app_id || Deno.env.get("APPMAX_APP_ID");
    const isBootstrap = !appId;

    const callbackUrl = settings?.callback_url || Deno.env.get("APPMAX_CALLBACK_URL") || "https://vanessalima.lovable.app/admin/integrations/appmax/callback";
    const apiBaseUrl = "https://api.sandboxappmax.com.br";
    const adminBaseUrl = "https://breakingcode.sandboxappmax.com.br";

    // Check if already connected
    const { data: existing } = await supabase
      .from("appmax_installations")
      .select("id, status")
      .eq("external_key", externalKey)
      .eq("environment", "sandbox")
      .maybeSingle();

    if (existing?.status === "connected") {
      return new Response(
        JSON.stringify({ error: "Já conectado. Desconecte antes de reconectar.", status: "already_connected" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get app token
    const accessToken = await getAppToken(supabase);

    // Build authorize payload
    const callbackWithKey = `${callbackUrl}?external_key=${encodeURIComponent(externalKey)}`;

    const authorizePayload: Record<string, string> = {
      external_key: externalKey,
      url_callback: callbackWithKey,
    };

    // If we have an app_id, include it; otherwise let bootstrap mode work
    if (appId) {
      authorizePayload.app_id = appId;
    }

    await logAppmax(supabase, "info", "Chamando /app/authorize", {
      ...authorizePayload,
      bootstrap: isBootstrap,
    });

    const authorizeRes = await fetch(`${apiBaseUrl}/app/authorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(authorizePayload),
    });

    const authorizeData = await authorizeRes.json();

    if (!authorizeRes.ok) {
      await logAppmax(supabase, "error", "Falha em /app/authorize", {
        status: authorizeRes.status,
        response: authorizeData,
        bootstrap: isBootstrap,
      });
      throw new Error(authorizeData.message || JSON.stringify(authorizeData) || "Falha ao autorizar aplicativo");
    }

    // Extract token/hash
    const authorizeToken =
      authorizeData.token ||
      authorizeData.hash ||
      authorizeData.data?.token ||
      authorizeData.data?.hash;

    if (!authorizeToken) {
      await logAppmax(supabase, "error", "Token/hash de autorização não retornado", {
        response: authorizeData,
      });
      throw new Error("Token de autorização não retornado pela Appmax");
    }

    // Upsert installation
    const upsertData = {
      external_key: externalKey,
      environment: "sandbox",
      app_id: appId || "bootstrap-pending",
      authorize_token: authorizeToken,
      status: "pending",
      last_error: null,
    };

    if (existing?.id) {
      await supabase
        .from("appmax_installations")
        .update(upsertData)
        .eq("id", existing.id);
    } else {
      await supabase.from("appmax_installations").insert(upsertData);
    }

    await logAppmax(supabase, "info", "Autorização iniciada com sucesso", {
      external_key: externalKey,
      authorize_token: authorizeToken,
      bootstrap: isBootstrap,
    });

    const redirectUrl = `${adminBaseUrl}/appstore/integration/${authorizeToken}`;

    return new Response(
      JSON.stringify({ redirect_url: redirectUrl, bootstrap: isBootstrap }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    await logAppmax(supabase, "error", `Erro em appmax-authorize: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
