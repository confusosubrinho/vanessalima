import { fetchWithTimeout } from "./fetchWithTimeout.ts";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/**
 * fetch com retry automático em caso de rate-limit (429).
 * Tenta até 3 vezes com backoff progressivo (1.5s, 3s, 4.5s).
 */
export async function fetchWithRateLimit(url: string, options: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetchWithTimeout(url, options);
    if (res.status === 429) {
      // Consume response body to prevent resource leak in Deno
      await res.body?.cancel().catch(() => {});
      const waitMs = (attempt + 1) * 1500;
      console.log(`[bling] Rate limited (429), waiting ${waitMs}ms before retry (attempt ${attempt + 1}/3)...`);
      await sleep(waitMs);
      continue;
    }
    return res;
  }
  return fetchWithTimeout(url, options);
}
