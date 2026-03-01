/**
 * Reconciliação: ajusta status do pedido com base no Stripe.
 * Caso de uso: "pagou mas order não atualizou" (webhook perdido/atrasado).
 * POST body: { order_id: string }
 * Resposta: { ok, order_id, previous_status, new_status, payment_synced }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", message: "Use Authorization: Bearer <service_role_key> or admin token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  console.log(`[${correlationId}] reconcile_order called`);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: stripeProvider } = await supabase
    .from("integrations_checkout_providers")
    .select("config")
    .eq("provider", "stripe")
    .maybeSingle();
  const stripeConfig = (stripeProvider?.config || {}) as Record<string, unknown>;
  const secretKey = (stripeConfig.secret_key as string)?.trim() || Deno.env.get("STRIPE_SECRET_KEY") || "";

  const stripe = new Stripe(secretKey, {
    apiVersion: "2025-08-27.basil",
  });

  let body: { order_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "JSON inválido", correlation_id: correlationId }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const orderId = body.order_id;
  if (!orderId) {
    return new Response(
      JSON.stringify({ error: "order_id obrigatório", correlation_id: correlationId }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status, transaction_id, provider")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    return new Response(
      JSON.stringify({ error: "Pedido não encontrado", correlation_id: correlationId }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (order.provider !== "stripe" || !order.transaction_id) {
    return new Response(
      JSON.stringify({
        ok: false,
        order_id: orderId,
        reason: "Pedido não é Stripe ou sem transaction_id",
        correlation_id: correlationId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const piId = order.transaction_id;
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.retrieve(piId);
  } catch (e) {
    console.error(`[${correlationId}] Stripe retrieve failed:`, e);
    return new Response(
      JSON.stringify({ error: "Falha ao consultar Stripe", correlation_id: correlationId }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const previousStatus = order.status;
  if (pi.status === "succeeded") {
    await supabase
      .from("orders")
      .update({
        status: "paid",
        last_webhook_event: "reconcile_order",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    const { data: existingPayment } = await supabase
      .from("payments")
      .select("id")
      .eq("provider", "stripe")
      .eq("transaction_id", piId)
      .maybeSingle();

    let paymentSynced = !!existingPayment;
    if (!existingPayment) {
      await supabase.from("payments").insert({
        order_id: orderId,
        provider: "stripe",
        gateway: "stripe",
        amount: pi.amount / 100,
        status: "approved",
        payment_method: pi.payment_method_types?.[0] || "card",
        transaction_id: piId,
        installments: Number(pi.metadata?.installments) || 1,
        raw: pi as unknown as Record<string, unknown>,
      });
      paymentSynced = true;
    }

    console.log(`[${correlationId}] Reconcile: order ${orderId} ${previousStatus} -> paid`);
    return new Response(
      JSON.stringify({
        ok: true,
        order_id: orderId,
        previous_status: previousStatus,
        new_status: "paid",
        payment_synced: paymentSynced,
        correlation_id: correlationId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      ok: false,
      order_id: orderId,
      previous_status: previousStatus,
      stripe_status: pi.status,
      message: "Stripe não está com status succeeded",
      correlation_id: correlationId,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
