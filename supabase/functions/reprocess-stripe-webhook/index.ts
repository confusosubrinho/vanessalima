/**
 * PR6: Reprocessar um evento Stripe que falhou (stripe_webhook_events.error_message preenchido).
 * POST { event_id: string } com Authorization Bearer (admin/service).
 * Busca o evento na API Stripe e reexecuta a lógica do stripe-webhook; atualiza a linha com processed_at e error_message.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonRes(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonRes({ error: "Unauthorized. Use Bearer token." }, 401);
  }

  let body: { event_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: "JSON inválido" }, 400);
  }
  const eventId = body?.event_id;
  if (!eventId || typeof eventId !== "string") {
    return jsonRes({ error: "event_id obrigatório" }, 400);
  }

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
  if (!secretKey) {
    return jsonRes({ error: "Stripe não configurado" }, 502);
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });

  let event: Stripe.Event;
  try {
    event = await stripe.events.retrieve(eventId);
  } catch (e) {
    console.error("Stripe events.retrieve failed:", e);
    return jsonRes({ error: "Evento não encontrado no Stripe ou erro de API" }, 404);
  }

  const { data: existingRow } = await supabase
    .from("stripe_webhook_events")
    .select("event_id, error_message")
    .eq("event_id", eventId)
    .maybeSingle();

  if (!existingRow) {
    return jsonRes({ error: "Evento não está registrado em stripe_webhook_events" }, 404);
  }

  // Helpers (espelho do stripe-webhook)
  async function updateOrderByPI(piId: string, data: Record<string, unknown>) {
    const { error } = await supabase
      .from("orders")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("transaction_id", piId);
    if (error) console.error(`Failed to update order (PI ${piId}):`, error.message);
    return error;
  }
  async function updateOrderByCharge(chargeId: string, data: Record<string, unknown>) {
    const { error } = await supabase
      .from("orders")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("stripe_charge_id", chargeId);
    if (error) console.error(`Failed to update order (charge ${chargeId}):`, error.message);
    return error;
  }
  async function restoreStock(orderId: string) {
    const { data: items } = await supabase
      .from("order_items")
      .select("product_variant_id, quantity")
      .eq("order_id", orderId);
    for (const item of items || []) {
      if (item.product_variant_id) {
        await supabase.rpc("increment_stock", {
          p_variant_id: item.product_variant_id,
          p_quantity: item.quantity,
        });
      }
    }
  }
  async function findOrderIdByPI(piId: string): Promise<string | null> {
    const { data } = await supabase
      .from("orders")
      .select("id")
      .eq("transaction_id", piId)
      .maybeSingle();
    return data?.id ?? null;
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.order_id;
        const piId = pi.id;
        if (orderId) {
          await supabase.from("orders").update({
            status: "paid",
            transaction_id: piId,
            last_webhook_event: "payment_intent.succeeded",
            payment_method: pi.payment_method_types?.[0] || "card",
            provider: "stripe",
            gateway: "stripe",
            updated_at: new Date().toISOString(),
          }).eq("id", orderId);
          const latestCharge = pi.latest_charge;
          if (latestCharge && typeof latestCharge === "string") {
            await supabase.from("orders").update({ stripe_charge_id: latestCharge }).eq("id", orderId);
          }
          const { data: existingPayment } = await supabase
            .from("payments")
            .select("id")
            .eq("provider", "stripe")
            .eq("transaction_id", piId)
            .maybeSingle();
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
          }
          const { data: order } = await supabase.from("orders").select("customer_email, total_amount, shipping_name").eq("id", orderId).maybeSingle();
          if (order?.customer_email) {
            const email = order.customer_email.toLowerCase();
            const { data: existing } = await supabase.from("customers").select("id, total_orders, total_spent").eq("email", email).maybeSingle();
            if (existing) {
              await supabase.from("customers").update({
                total_orders: (existing.total_orders || 0) + 1,
                total_spent: (existing.total_spent || 0) + (order.total_amount || 0),
              }).eq("id", existing.id);
              await supabase.from("orders").update({ customer_id: existing.id }).eq("id", orderId);
            } else {
              const { data: newC } = await supabase.from("customers").insert({
                email,
                full_name: order.shipping_name || "Cliente",
                total_orders: 1,
                total_spent: order.total_amount || 0,
              }).select("id").single();
              if (newC) await supabase.from("orders").update({ customer_id: newC.id }).eq("id", orderId);
            }
          }
          const couponCode = pi.metadata?.coupon_code;
          if (couponCode) {
            const { data: coupon } = await supabase.from("coupons").select("id").eq("code", couponCode.toUpperCase()).maybeSingle();
            if (coupon) await supabase.rpc("increment_coupon_uses", { p_coupon_id: coupon.id });
          }
        } else {
          const existingOrderId = await findOrderIdByPI(pi.id);
          if (existingOrderId) await updateOrderByPI(pi.id, { status: "paid", last_webhook_event: "payment_intent.succeeded" });
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const targetOrderId = pi.metadata?.order_id || (await findOrderIdByPI(pi.id));
        const lastError = pi.last_payment_error?.message || "Pagamento falhou";
        if (targetOrderId) {
          await supabase.from("orders").update({
            status: "failed",
            notes: `STRIPE FALHOU: ${lastError}`,
            last_webhook_event: "payment_intent.payment_failed",
            updated_at: new Date().toISOString(),
          }).eq("id", targetOrderId);
          await restoreStock(targetOrderId);
        }
        break;
      }
      case "payment_intent.canceled": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const targetOrderId = pi.metadata?.order_id || (await findOrderIdByPI(pi.id));
        if (targetOrderId) {
          await supabase.from("orders").update({
            status: "cancelled",
            notes: "Cancelado via Stripe",
            last_webhook_event: "payment_intent.canceled",
            updated_at: new Date().toISOString(),
          }).eq("id", targetOrderId);
          await restoreStock(targetOrderId);
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const chargeId = charge.id;
        const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
        let err = await updateOrderByCharge(chargeId, { status: "refunded", last_webhook_event: "charge.refunded" });
        if (err && piId) err = await updateOrderByPI(piId, { status: "refunded", last_webhook_event: "charge.refunded" });
        if (piId) await supabase.from("payments").update({ status: "refunded" }).eq("transaction_id", piId);
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const chargeId = typeof dispute.charge === "string" ? dispute.charge : (dispute.charge as Stripe.Charge)?.id;
        const piId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : null;
        if (chargeId) {
          let e = await updateOrderByCharge(chargeId, { status: "disputed", notes: `Disputa aberta: ${dispute.reason || "unknown"}`, last_webhook_event: "charge.dispute.created" });
          if (e && piId) await updateOrderByPI(piId, { status: "disputed", notes: `Disputa aberta: ${dispute.reason || "unknown"}`, last_webhook_event: "charge.dispute.created" });
        }
        break;
      }
      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;
        const chargeId = typeof dispute.charge === "string" ? dispute.charge : (dispute.charge as Stripe.Charge)?.id;
        const piId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : null;
        const won = dispute.status === "won";
        const newStatus = won ? "paid" : "disputed";
        const note = won ? "Disputa encerrada: ganhou — fundos restituídos" : `Disputa encerrada: ${dispute.status}`;
        if (chargeId) {
          let e = await updateOrderByCharge(chargeId, { status: newStatus, notes: note, last_webhook_event: "charge.dispute.closed" });
          if (e && piId) await updateOrderByPI(piId, { status: newStatus, notes: note, last_webhook_event: "charge.dispute.closed" });
        }
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Record<string, unknown>;
        const orderId = session.metadata?.order_id as string | undefined;
        const piId = typeof session.payment_intent === "string" ? session.payment_intent : null;
        if (orderId) {
          const updateData: Record<string, unknown> = {
            customer_email: (session.customer_details as Record<string, unknown>)?.email ?? null,
            last_webhook_event: "checkout.session.completed",
            external_reference: session.id,
            updated_at: new Date().toISOString(),
          };
          const shipping = (session.shipping_details || session.customer_details) as Record<string, unknown> | undefined;
          if (shipping?.address) {
            const addr = shipping.address as Record<string, unknown>;
            updateData.shipping_name = shipping.name || (session.customer_details as Record<string, unknown>)?.name || "Cliente";
            updateData.shipping_address = [addr.line1, addr.line2].filter(Boolean).join(", ") || "N/A";
            updateData.shipping_city = addr.city || "N/A";
            updateData.shipping_state = addr.state || "XX";
            updateData.shipping_zip = ((addr.postal_code as string) || "").replace(/\D/g, "") || "00000000";
          }
          if (piId) updateData.transaction_id = piId;
          await supabase.from("orders").update(updateData).eq("id", orderId);
        }
        break;
      }
      default:
        console.log(`Unhandled event type on reprocess: ${event.type}`);
    }

    await supabase
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString(), error_message: null })
      .eq("event_id", eventId);

    console.log(`Reprocess OK: ${eventId} (${event.type})`);
    return jsonRes({ ok: true, event_id: eventId, event_type: event.type }, 200);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Reprocess error for ${eventId}:`, msg);
    await supabase
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString(), error_message: msg })
      .eq("event_id", eventId);
    return jsonRes({ error: msg, event_id: eventId }, 500);
  }
});
