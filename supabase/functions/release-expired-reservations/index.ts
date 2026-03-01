/**
 * P0-2: Release expired reservations (TTL 15 min).
 * Finds orders with status=pending and created_at older than 15 minutes,
 * restores stock, cancels Stripe PaymentIntent if any, sets order to cancelled.
 * Call with Authorization: Bearer SUPABASE_SERVICE_ROLE_KEY or from admin.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESERVATION_TTL_MINUTES = 15;

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
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
  const stripeKey = (stripeConfig.secret_key as string)?.trim() || Deno.env.get("STRIPE_SECRET_KEY");
  const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" }) : null;

  const cutoff = new Date(Date.now() - RESERVATION_TTL_MINUTES * 60 * 1000).toISOString();

  const { data: orders, error: listError } = await supabase
    .from("orders")
    .select("id, provider, transaction_id")
    .eq("status", "pending")
    .lt("created_at", cutoff);

  if (listError) {
    console.error("release_expired_reservations list error:", listError);
    return new Response(
      JSON.stringify({ error: listError.message, released: 0, order_ids: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const orderList = orders || [];
  const released: string[] = [];

  for (const order of orderList) {
    const { data: items } = await supabase
      .from("order_items")
      .select("product_variant_id, quantity")
      .eq("order_id", order.id);

    for (const item of items || []) {
      if (item.product_variant_id && item.quantity) {
        await supabase.rpc("increment_stock", {
          p_variant_id: item.product_variant_id,
          p_quantity: item.quantity,
        });
      }
    }

    if (order.provider === "stripe" && order.transaction_id && stripe) {
      try {
        await stripe.paymentIntents.cancel(order.transaction_id);
      } catch (e) {
        console.warn("Stripe cancel PI failed:", order.transaction_id, e);
      }
    }

    await supabase
      .from("orders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", order.id);

    released.push(order.id);
  }

  return new Response(
    JSON.stringify({
      released: released.length,
      order_ids: released,
      cutoff: cutoff,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
