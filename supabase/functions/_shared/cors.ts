const ALLOWED_ORIGINS = [
  "https://vanessalima.lovable.app",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:54321",
  "http://127.0.0.1:54321",
];

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/.*\.lovable\.app$/,
  /^https:\/\/.*\.lovableproject\.com$/,
];

export const getCorsHeaders = (origin: string | null) => {
  let allowedOrigin = "";

  if (origin) {
    if (ALLOWED_ORIGINS.includes(origin)) {
      allowedOrigin = origin;
    } else if (ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))) {
      allowedOrigin = origin;
    }
  }

  // Fallback to production domain if origin is null or not allowed
  // However, for Edge Functions, if we want to deny access, we should probably not return the header or return a non-matching one.
  // But usually returning the requested origin if valid is the way.

  return {
    "Access-Control-Allow-Origin": allowedOrigin || ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET, PUT, DELETE",
  };
};
