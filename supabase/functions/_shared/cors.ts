const ALLOWED_ORIGINS = [
  "https://vanessalima.lovable.app",
  "https://vanessalimashoes.com.br",
  "https://www.vanessalimashoes.com.br",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:54321",
  "http://127.0.0.1:54321",
];

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/.*\.lovable\.app$/,
  /^https:\/\/.*\.lovableproject\.com$/,
  /^https:\/\/.*\.vercel\.app$/,
  /^https:\/\/.*\.netlify\.app$/,
];

/** Origens extras via env (ex.: CORS_ALLOWED_ORIGINS=https://meu-app.com ou * para permitir qualquer origem) */
function getExtraOrigins(): string[] {
  const raw = Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "";
  const trimmed = raw.trim();
  if (trimmed === "*") return ["*"];
  return trimmed.split(",").map((o) => o.trim()).filter(Boolean);
}

export const getCorsHeaders = (origin: string | null) => {
  let allowedOrigin = "";
  const extra = getExtraOrigins();

  if (extra.includes("*")) {
    allowedOrigin = origin || "*";
  } else if (origin) {
    if (ALLOWED_ORIGINS.includes(origin) || extra.includes(origin)) {
      allowedOrigin = origin;
    } else if (ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))) {
      allowedOrigin = origin;
    }
  }

  return {
    "Access-Control-Allow-Origin": allowedOrigin || ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET, PUT, DELETE",
  };
};
