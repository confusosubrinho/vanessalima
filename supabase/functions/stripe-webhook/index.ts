import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature || !webhookSecret) {
    return new Response(JSON.stringify({ error: "Missing signature or webhook secret" }), { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.order_id;
        if (!orderId) break;

        // Update order status
        await supabase.from("orders").update({
          status: "processing",
          transaction_id: pi.id,
          last_webhook_event: "payment_intent.succeeded",
        }).eq("id", orderId);

        // Insert payment record
        await supabase.from("payments").insert({
          order_id: orderId,
          provider: "stripe",
          gateway: "stripe",
          amount: pi.amount / 100,
          status: "approved",
          payment_method: pi.payment_method_types?.[0] || "card",
          transaction_id: pi.id,
          installments: Number(pi.metadata?.installments) || 1,
          raw: pi as any,
        });

        // Update customer stats
        const { data: order } = await supabase
          .from("orders")
          .select("customer_email, total_amount, shipping_name")
          .eq("id", orderId)
          .maybeSingle();

        if (order?.customer_email) {
          const { data: existing } = await supabase
            .from("customers")
            .select("id, total_orders, total_spent")
            .eq("email", order.customer_email.toLowerCase())
            .maybeSingle();

          if (existing) {
            await supabase.from("customers").update({
              total_orders: (existing.total_orders || 0) + 1,
              total_spent: (existing.total_spent || 0) + (order.total_amount || 0),
            }).eq("id", existing.id);
            await supabase.from("orders").update({ customer_id: existing.id }).eq("id", orderId);
          } else {
            const { data: newC } = await supabase.from("customers").insert({
              email: order.customer_email.toLowerCase(),
              full_name: order.shipping_name || "Cliente",
              total_orders: 1,
              total_spent: order.total_amount || 0,
            }).select("id").single();
            if (newC) await supabase.from("orders").update({ customer_id: newC.id }).eq("id", orderId);
          }
        }

        // Increment coupon uses
        const couponCode = pi.metadata?.coupon_code;
        if (couponCode) {
          const { data: coupon } = await supabase
            .from("coupons")
            .select("id")
            .eq("code", couponCode.toUpperCase())
            .maybeSingle();
          if (coupon) {
            await supabase.rpc("increment_coupon_uses", { p_coupon_id: coupon.id });
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.order_id;
        if (!orderId) break;

        const lastError = pi.last_payment_error?.message || "Pagamento falhou";

        await supabase.from("orders").update({
          status: "cancelled",
          notes: `STRIPE FALHOU: ${lastError}`,
          last_webhook_event: "payment_intent.payment_failed",
        }).eq("id", orderId);

        // Restore stock
        const { data: orderItems } = await supabase
          .from("order_items")
          .select("product_variant_id, quantity")
          .eq("order_id", orderId);

        for (const item of (orderItems || [])) {
          if (item.product_variant_id) {
            await supabase.rpc("increment_stock", {
              p_variant_id: item.product_variant_id,
              p_quantity: item.quantity,
            });
          }
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Webhook processing error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
