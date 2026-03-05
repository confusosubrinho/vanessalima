/**
 * E2E helper: chamar Edge Functions com request_id para rastreabilidade.
 */
const baseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

export function invokeEdgeFunction(
  name: string,
  body: Record<string, unknown>,
  requestId?: string | null
): Promise<Response> {
  const url = baseUrl();
  const key = serviceRoleKey();
  if (!url || !key) throw new Error('E2E: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórios');
  const rid = requestId ?? 'e2e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  const endpoint = url.replace(/\/$/, '') + '/functions/v1/' + name;
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'x-request-id': rid,
    },
    body: JSON.stringify({ ...body, request_id: rid }),
  });
}

export async function invokeCheckoutRouter(
  body: Record<string, unknown>,
  requestId?: string | null
): Promise<{ status: number; data: unknown }> {
  const res = await invokeEdgeFunction('checkout-router', body, requestId);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function invokeResolve(requestId?: string | null): Promise<{ status: number; data: unknown }> {
  const res = await invokeEdgeFunction('checkout-create-session', { action: 'resolve' }, requestId);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
