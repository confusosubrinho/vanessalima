import { fetchWithTimeout } from "./fetchWithTimeout.ts";

const BLING_TOKEN_URL = "https://api.bling.com.br/Api/v3/oauth/token";

/**
 * Obtém um token Bling válido com optimistic locking para evitar race conditions.
 * Se o refresh_token já foi consumido por outra instância, re-lê o token atualizado.
 */
export async function getValidTokenSafe(supabase: any): Promise<string> {
  const { data: settings, error } = await supabase
    .from("store_settings")
    .select("id, bling_client_id, bling_client_secret, bling_access_token, bling_refresh_token, bling_token_expires_at")
    .limit(1)
    .maybeSingle();

  if (error || !settings) throw new Error("Configurações não encontradas");
  if (!settings.bling_access_token) throw new Error("Bling não conectado. Autorize primeiro nas Integrações.");

  const expiresAt = settings.bling_token_expires_at ? new Date(settings.bling_token_expires_at) : new Date(0);
  const isExpired = expiresAt.getTime() - 300000 < Date.now();

  if (isExpired && settings.bling_refresh_token) {
    const oldRefreshToken = settings.bling_refresh_token;
    const basicAuth = btoa(`${settings.bling_client_id}:${settings.bling_client_secret}`);

    const tokenResponse = await fetchWithTimeout(BLING_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: oldRefreshToken }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      // Token refresh failed — maybe another process already refreshed it
      // Re-read settings to check
      const { data: freshSettings } = await supabase
        .from("store_settings")
        .select("bling_access_token, bling_refresh_token, bling_token_expires_at")
        .limit(1)
        .maybeSingle();

      if (freshSettings && freshSettings.bling_refresh_token !== oldRefreshToken) {
        // Another process already refreshed — use the new token
        console.log("[bling-token] Refresh failed but another process already refreshed, using new token");
        const freshExpiry = freshSettings.bling_token_expires_at ? new Date(freshSettings.bling_token_expires_at) : new Date(0);
        if (freshExpiry.getTime() > Date.now()) {
          return freshSettings.bling_access_token;
        }
      }

      throw new Error("Token do Bling expirado. Reconecte o Bling.");
    }

    // Optimistic lock: only update if refresh_token hasn't changed since we read it
    const { data: updateResult, error: updateError } = await supabase
      .from("store_settings")
      .update({
        bling_access_token: tokenData.access_token,
        bling_refresh_token: tokenData.refresh_token,
        bling_token_expires_at: new Date(Date.now() + (tokenData.expires_in || 21600) * 1000).toISOString(),
      } as any)
      .eq("id", settings.id)
      .eq("bling_refresh_token", oldRefreshToken)
      .select("id");

    if (updateError) {
      console.warn("[bling-token] Update failed (likely race condition), token still valid for this request");
    } else if (!updateResult || updateResult.length === 0) {
      // Optimistic lock failed — another process already refreshed the token
      // Re-read to get the latest token persisted by the other process
      console.log("[bling-token] Optimistic lock missed (0 rows updated), re-reading latest token");
      const { data: latestSettings } = await supabase
        .from("store_settings")
        .select("bling_access_token, bling_token_expires_at")
        .limit(1)
        .maybeSingle();
      if (latestSettings?.bling_access_token) {
        const latestExpiry = latestSettings.bling_token_expires_at ? new Date(latestSettings.bling_token_expires_at) : new Date(0);
        if (latestExpiry.getTime() > Date.now()) {
          return latestSettings.bling_access_token;
        }
      }
    }

    return tokenData.access_token;
  }

  return settings.bling_access_token;
}
