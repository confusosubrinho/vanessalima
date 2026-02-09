import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BLING_TOKEN_URL = "https://bling.com.br/Api/v3/oauth/token";

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

    // ─── Handle OAuth callback from Bling ───
    if (action === "callback" || url.searchParams.has("code")) {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code) {
        return new Response("Código de autorização não recebido", { status: 400 });
      }

      // Get client credentials from store_settings
      const { data: settings } = await supabase
        .from("store_settings")
        .select("id, bling_client_id, bling_client_secret")
        .limit(1)
        .maybeSingle();

      if (!settings?.bling_client_id || !settings?.bling_client_secret) {
        return new Response("Client ID e Secret do Bling não configurados", { status: 400 });
      }

      // Exchange authorization code for tokens
      const basicAuth = btoa(`${settings.bling_client_id}:${settings.bling_client_secret}`);

      const tokenResponse = await fetch(BLING_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
        }),
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

      // Calculate token expiry
      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 21600) * 1000).toISOString();

      // Save tokens to store_settings
      const { error: updateError } = await supabase
        .from("store_settings")
        .update({
          bling_access_token: tokenData.access_token,
          bling_refresh_token: tokenData.refresh_token,
          bling_token_expires_at: expiresAt,
        } as any)
        .eq("id", settings.id);

      if (updateError) {
        console.error("Error saving Bling tokens:", updateError);
      }

      // Return success page that closes the popup
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

    // ─── Generate authorization URL ───
    if (req.method === "POST") {
      const body = await req.json();

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

        // The callback URL is this same edge function
        const callbackUrl = `${supabaseUrl}/functions/v1/bling-oauth`;
        const state = crypto.randomUUID();

        const authUrl = `https://bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${settings.bling_client_id}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}`;

        return new Response(
          JSON.stringify({ auth_url: authUrl, callback_url: callbackUrl }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ─── Refresh token ───
      if (body.action === "refresh_token") {
        const { data: settings } = await supabase
          .from("store_settings")
          .select("id, bling_client_id, bling_client_secret, bling_refresh_token")
          .limit(1)
          .maybeSingle();

        if (!settings?.bling_refresh_token) {
          return new Response(
            JSON.stringify({ error: "Refresh token não encontrado. Reconecte o Bling." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const basicAuth = btoa(`${settings.bling_client_id}:${settings.bling_client_secret}`);

        const tokenResponse = await fetch(BLING_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${basicAuth}`,
            Accept: "application/json",
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: settings.bling_refresh_token,
          }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok || !tokenData.access_token) {
          return new Response(
            JSON.stringify({ error: "Falha ao renovar token", details: tokenData }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
          JSON.stringify({ success: true, expires_at: expiresAt }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
