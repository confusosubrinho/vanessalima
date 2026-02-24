/**
 * fetch com timeout para chamadas HTTP externas (recomendado 25–30 s).
 * Evita que requisições travem indefinidamente.
 */
const DEFAULT_TIMEOUT_MS = 25_000;

export function fetchWithTimeout(
  url: string | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    ...init,
    signal: controller.signal,
  }).finally(() => clearTimeout(id));
}
