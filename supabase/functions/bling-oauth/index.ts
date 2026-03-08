import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getValidTokenSafe } from "../_shared/blingTokenRefresh.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ─── Handle OAuth callback from Bling (public — needed for redirect) ───
    if (action === "callback" || url.searchParams.has("code")) {
      const code = url.searchParams.get("code");

      if (!code) {
        return new Response("Código de autorização não recebido", { status: 400 });
      }

      const { data: settings } = await supabase
        .from("store_settings")
        .select("id, bling_client_id, bling_client_secret")
        .limit(1)
        .maybeSingle();

      if (!settings?.bling_client_id || !settings?.bling_client_secret) {
        return new Response("Client ID e Secret do Bling não configurados", { status: 400 });
      }

      const basicAuth = btoa(`${settings.bling_client_id}:${settings.bling_client_secret}`);

      const tokenResponse = await fetch("https://api.bling.com.br/Api/v3/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
          Accept: "application/json",
        },
        body: new URLSearchParams({ grant_type: "authorization_code", code }),
      });

      const tokenData = await tokenResponse.json();
      console.log("Bling token response:", JSON.stringify(tokenData));

      if (!tokenResponse.ok || !tokenData.access_token) {
        console.error("Bling token error:", JSON.stringify(tokenData));
        return new Response(
          `<html><body><h2>Erro na autorização do Bling</h2><p>${tokenData.error_description || tokenData.error || "Erro desconhecido"}</p><script>setTimeout(()=>window.close(),5000)</script></body></html>`,
          { status: 400, headers: { "Content-Type": "text/html" } }
        );
      }

      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 21600) * 1000).toISOString();

      await supabase
        .from("store_settings")
        .update({
          bling_access_token: tokenData.access_token,
          bling_refresh_token: tokenData.refresh_token,
          bling_token_expires_at: expiresAt,
        } as any)
        .eq("id", settings.id);

      return new Response(
        `<html>
          <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0fdf4">
            <div style="text-align:center">
              <h2 style="color:#16a34a">✅ Bling conectado com sucesso!</h2>
              <p>Você pode fechar esta janela.</p>
              <script>
                if(window.opener){window.opener.postMessage('bling_connected','*')}
                setTimeout(()=>window.close(),3000)
              </script>
            </div>
          </body>
        </html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // ─── POST actions require admin JWT ───
    if (req.method === "POST") {
      // Validate admin auth
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Token inválido" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = user.id;
      const { data: adminCheck } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (!adminCheck) {
        const { data: memberCheck } = await supabase
          .from("admin_members")
          .select("role")
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle();
        if (!memberCheck) {
          return new Response(JSON.stringify({ error: "Acesso negado" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const body = await req.json();

      // ─── Generate authorization URL ───
      if (body.action === "get_auth_url") {
        const { data: settings } = await supabase
          .from("store_settings")
          .select("bling_client_id")
          .limit(1)
          .maybeSingle();

        if (!settings?.bling_client_id) {
          return new Response(
            JSON.stringify({ error: "Configure o Client ID do Bling primeiro" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const callbackUrl = `${supabaseUrl}/functions/v1/bling-oauth`;
        const state = crypto.randomUUID();
        const authUrl = `https://bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${settings.bling_client_id}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}`;

        return new Response(
          JSON.stringify({ auth_url: authUrl, callback_url: callbackUrl }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ─── Refresh token (uses shared optimistic locking) ───
      if (body.action === "refresh_token") {
        try {
          const newToken = await getValidTokenSafe(supabase);
          // Read updated expiry
          const { data: updated } = await supabase
            .from("store_settings")
            .select("bling_token_expires_at")
            .limit(1)
            .maybeSingle();

          return new Response(
            JSON.stringify({ success: true, expires_at: updated?.bling_token_expires_at }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // ─── Check connection status ───
      if (body.action === "check_status") {
        const { data: settings } = await supabase
          .from("store_settings")
          .select("bling_access_token, bling_token_expires_at")
          .limit(1)
          .maybeSingle();

        const isConnected = !!settings?.bling_access_token;
        const isExpired = settings?.bling_token_expires_at
          ? new Date(settings.bling_token_expires_at as string) < new Date()
          : true;

        return new Response(
          JSON.stringify({ connected: isConnected, expired: isExpired }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ─── Disconnect Bling ───
      if (body.action === "disconnect") {
        await supabase
          .from("store_settings")
          .update({
            bling_access_token: null,
            bling_refresh_token: null,
            bling_token_expires_at: null,
          } as any)
          .not("id", "is", null);

        return new Response(
          JSON.stringify({ success: true, message: "Bling desconectado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Bling OAuth error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
