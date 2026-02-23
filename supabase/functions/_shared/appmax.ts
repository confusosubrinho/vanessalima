/**
 * Shared Appmax helpers — multi-environment, token cache, encryption, retry.
 * Used by appmax-authorize, appmax-healthcheck, appmax-get-app-token, appmax-webhook.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AppmaxSettings {
  id: string;
  environment: string;
  app_id: string | null;
  client_id: string | null;
  client_secret: string | null;
  client_secret_encrypted: string | null;
  callback_url: string | null;
  healthcheck_url: string | null;
  base_auth_url: string | null;
  base_api_url: string | null;
  base_portal_url: string | null;
  is_active: boolean;
}

export interface AppmaxTokenCache {
  environment: string;
  access_token_encrypted: string | null;
  expires_at: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Supabase client ────────────────────────────────────────────────────────────

export function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

// ── Logging (masked) ───────────────────────────────────────────────────────────

export function maskSecret(value: string | null | undefined): string {
  if (!value) return "***";
  if (value.length <= 4) return "****";
  return "•".repeat(value.length - 4) + value.slice(-4);
}

export async function logAppmax(
  supabase: any,
  level: string,
  message: string,
  meta?: Record<string, unknown>,
  requestId?: string
) {
  try {
    const safeMeta: Record<string, unknown> = {};
    if (meta) {
      for (const [k, v] of Object.entries(meta)) {
        if (/secret|token|password|key/i.test(k) && typeof v === "string") {
          safeMeta[k] = maskSecret(v);
        } else {
          safeMeta[k] = v;
        }
      }
    }
    if (requestId) safeMeta.request_id = requestId;

    await supabase
      .from("appmax_logs")
      .insert({ level, scope: "appmax", message, meta: safeMeta });
  } catch (_) {
    // never fail on logging
  }
}

// ── Encryption helpers (AES-GCM with APP_ENC_KEY) ──────────────────────────────

function getEncKey(): Uint8Array {
  const b64 = Deno.env.get("APP_ENC_KEY");
  if (!b64) throw new Error("APP_ENC_KEY não configurado");
  // Decode base64 to raw bytes
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (raw.length !== 32) {
    throw new Error(`APP_ENC_KEY deve ter 32 bytes (recebido ${raw.length})`);
  }
  return raw;
}

async function importKey(): Promise<CryptoKey> {
  const rawKey = getEncKey();
  return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt plaintext → base64 string (iv:ciphertext) */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  const cipher = new Uint8Array(cipherBuf);
  // Concat iv + cipher and base64
  const combined = new Uint8Array(iv.length + cipher.length);
  combined.set(iv);
  combined.set(cipher, iv.length);
  return btoa(String.fromCharCode(...combined));
}

/** Decrypt base64 string (iv:ciphertext) → plaintext */
export async function decrypt(encrypted: string): Promise<string> {
  const key = await importKey();
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipher
  );
  return new TextDecoder().decode(plainBuf);
}

// ── Settings helpers ───────────────────────────────────────────────────────────

/** Get settings for the active environment (is_active=true) */
export async function getActiveSettings(
  supabase: any
): Promise<AppmaxSettings | null> {
  const { data } = await supabase
    .from("appmax_settings")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

/** Get settings for a specific environment */
export async function getSettingsByEnv(
  supabase: any,
  env: string
): Promise<AppmaxSettings | null> {
  const { data } = await supabase
    .from("appmax_settings")
    .select("*")
    .eq("environment", env)
    .maybeSingle();
  return data;
}

/** Get the decrypted client_secret for a settings row */
export async function getClientSecret(
  settings: AppmaxSettings
): Promise<string> {
  // Prefer encrypted; fallback to plaintext (migration period)
  if (settings.client_secret_encrypted) {
    try {
      return await decrypt(settings.client_secret_encrypted);
    } catch {
      // If decryption fails, it might be stored in plaintext during migration
      return settings.client_secret_encrypted;
    }
  }
  if (settings.client_secret) return settings.client_secret;
  throw new Error("client_secret não configurado para este ambiente");
}

// ── Token cache with encryption ────────────────────────────────────────────────

/**
 * Get a valid OAuth app token for the given environment.
 * Uses cache (appmax_tokens_cache) with encryption.
 * Falls back to requesting a new token if cache is expired/missing.
 */
export async function getAppToken(
  supabase: any,
  settings: AppmaxSettings
): Promise<string> {
  const env = settings.environment;

  // 1. Check cache
  const { data: cached } = await supabase
    .from("appmax_tokens_cache")
    .select("*")
    .eq("environment", env)
    .maybeSingle();

  if (cached?.access_token_encrypted && cached?.expires_at) {
    const expiresAt = new Date(cached.expires_at);
    const buffer = 5 * 60 * 1000; // 5 min buffer
    if (expiresAt.getTime() - buffer > Date.now()) {
      try {
        const token = await decrypt(cached.access_token_encrypted);
        return token;
      } catch {
        // Cache corrupted, fetch new token
      }
    }
  }

  // 2. Fetch new token
  const clientId = settings.client_id || Deno.env.get("APPMAX_CLIENT_ID");
  const clientSecret = await getClientSecret(settings).catch(
    () => Deno.env.get("APPMAX_CLIENT_SECRET") || ""
  );
  const authUrl = settings.base_auth_url;

  if (!clientId || !clientSecret || !authUrl) {
    throw new Error(
      `Configuração incompleta para ambiente ${env}: client_id, client_secret ou base_auth_url ausente`
    );
  }

  let lastError: Error | null = null;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const tokenUrl = `${authUrl}/oauth2/token`;
      console.log(`[getAppToken] Attempt ${attempt}: POST ${tokenUrl} with client_id=${maskSecret(clientId)}`);
      
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });

      const rawText = await res.text();
      console.log(`[getAppToken] Response status=${res.status}, body length=${rawText.length}, preview=${rawText.slice(0, 200)}`);

      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          `Resposta não-JSON do servidor de autenticação (${env}): HTTP ${res.status} — ${rawText.slice(0, 300)}`
        );
      }

      if (res.ok && data.access_token) {
        // Cache the token encrypted
        const encryptedToken = await encrypt(data.access_token);
        const expiresAt = new Date(
          Date.now() + (data.expires_in || 3600) * 1000
        ).toISOString();

        await supabase.from("appmax_tokens_cache").upsert(
          {
            environment: env,
            access_token_encrypted: encryptedToken,
            expires_at: expiresAt,
          },
          { onConflict: "environment" }
        );

        await logAppmax(supabase, "info", `Token obtido (${env})`, {
          expires_in: data.expires_in,
          attempt,
        });

        return data.access_token;
      }

      // Retryable status codes
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(
          `HTTP ${res.status}: ${data.message || data.error || "Unknown"}`
        );
        const backoff = Math.pow(2, attempt) * 500;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      // Non-retryable error
      throw new Error(
        `Falha ao obter token (${env}): ${data.message || data.error_description || data.error || res.status}`
      );
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 500;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  throw lastError || new Error(`Falha ao obter token após ${maxRetries} tentativas`);
}

// ── Generic Appmax API request with retry ──────────────────────────────────────

interface AppmaxRequestOptions {
  method?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export async function appmaxRequest(
  supabase: any,
  settings: AppmaxSettings,
  path: string,
  options: AppmaxRequestOptions = {}
): Promise<{ ok: boolean; status: number; data: any }> {
  const token = await getAppToken(supabase, settings);
  const baseUrl = settings.base_api_url;
  if (!baseUrl) throw new Error("base_api_url não configurado");

  const url = `${baseUrl}${path.startsWith("/") ? path : "/" + path}`;
  const method = options.method || "POST";

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const data = await res.json();

      if (res.ok) {
        return { ok: true, status: res.status, data };
      }

      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}`);
        const backoff = Math.pow(2, attempt) * 500;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      return { ok: false, status: res.status, data };
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 500;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  throw lastError || new Error("Falha na requisição após retries");
}

// ── Auth check helper ──────────────────────────────────────────────────────────

export async function requireAdmin(
  req: Request,
  supabase: any
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } =
    await userClient.auth.getClaims(token);

  if (claimsErr || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = claimsData.claims.sub as string;

  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });

  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return { userId };
}

// ── JSON error response helper ─────────────────────────────────────────────────

export function errorResponse(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Handshake diagnostic logger ────────────────────────────────────────────────

/** Mask any value that looks like a secret */
function maskPayloadSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (/secret|token|password|key|authorization/i.test(k) && typeof v === "string") {
      masked[k] = maskSecret(v);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      masked[k] = maskPayloadSecrets(v as Record<string, unknown>);
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

/** Extract useful headers from request */
function extractSafeHeaders(req: Request): Record<string, string> {
  const useful = ["user-agent", "content-type", "origin", "x-forwarded-for", "referer"];
  const result: Record<string, string> = {};
  for (const h of useful) {
    const val = req.headers.get(h);
    if (val) result[h] = val;
  }
  return result;
}

export interface HandshakeLogEntry {
  environment: string;
  stage: string;
  external_key?: string | null;
  request_id?: string | null;
  ok: boolean;
  http_status?: number | null;
  message: string;
  payload?: Record<string, unknown> | null;
  headers?: Record<string, string> | null;
  error_stack?: string | null;
}

export async function logHandshake(supabase: any, entry: HandshakeLogEntry) {
  try {
    const safePayload = entry.payload ? maskPayloadSecrets(entry.payload) : null;
    await supabase.from("appmax_handshake_logs").insert({
      environment: entry.environment,
      stage: entry.stage,
      external_key: entry.external_key || null,
      request_id: entry.request_id || null,
      ok: entry.ok,
      http_status: entry.http_status || null,
      message: entry.message,
      payload: safePayload,
      headers: entry.headers || null,
      error_stack: entry.error_stack || null,
    });
  } catch (_) {
    // never fail on logging
  }
}

export { extractSafeHeaders, maskPayloadSecrets };
