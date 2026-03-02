/**
 * PR1: Request ID + timeout para chamadas de checkout.
 * PR4: Suporte ao checkout-router (uma entrada, shape unificado).
 */
import { supabase } from "@/integrations/supabase/client";

/** Exportado para testes (PR7). */
export const DEFAULT_CHECKOUT_TIMEOUT_MS = 20000;

export function generateRequestId(): string {
  return crypto.randomUUID();
}

export type InvokeCheckoutOptions = {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
};

/** Shape unificado de resposta do checkout-router (PR4): sempre success e opcionalmente error no top level. */
export type CheckoutRouterResponse<T = Record<string, unknown>> = T & {
  success: boolean;
  error?: string;
};

/**
 * Invoca o checkout-router com route + payload. Resposta unificada com success e error.
 * Use route: "resolve" | "create_gateway_session" | "stripe_intent" | "process_payment".
 */
export async function invokeCheckoutRouter<T = Record<string, unknown>>(
  route: string,
  payload: Record<string, unknown>,
  requestId?: string | null,
  timeoutMs: number = DEFAULT_CHECKOUT_TIMEOUT_MS
): Promise<{ data: CheckoutRouterResponse<T> | null; error: Error | null }> {
  return invokeCheckoutFunction<CheckoutRouterResponse<T>>(
    "checkout-router",
    { body: { ...payload, route } },
    requestId,
    timeoutMs
  );
}

/**
 * Invoca uma Edge Function de checkout com timeout e request_id.
 * Em caso de timeout, rejeita com Error("Não conseguimos concluir. Tente novamente.").
 */
export async function invokeCheckoutFunction<T = unknown>(
  functionName: string,
  options: InvokeCheckoutOptions,
  requestId?: string | null,
  timeoutMs: number = DEFAULT_CHECKOUT_TIMEOUT_MS
): Promise<{ data: T; error: Error | null }> {
  const rid = requestId ?? generateRequestId();
  const body = options.body ?? {};
  const bodyWithRequestId = { ...body, request_id: rid };
  const headers: Record<string, string> = {
    ...options.headers,
    "x-request-id": rid,
  };

  const invokePromise = supabase.functions.invoke(functionName, {
    body: bodyWithRequestId,
    headers,
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error("Não conseguimos concluir. Tente novamente."));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([invokePromise, timeoutPromise]);
    const err = result.error
      ? new Error(result.error.message || "Erro ao processar")
      : result.data?.error != null
        ? new Error(
            typeof result.data.error === "string"
              ? result.data.error
              : JSON.stringify(result.data.error)
          )
        : null;
    return { data: result.data as T, error: err };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Não conseguimos concluir. Tente novamente.";
    return { data: null as T, error: new Error(msg) };
  }
}
