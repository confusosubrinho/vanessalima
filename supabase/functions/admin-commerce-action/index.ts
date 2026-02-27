/**
 * P1-3: Ações admin para commerce (liberar reservas, reconciliar pendentes).
 * Requer Authorization: Bearer <user_jwt>. Verifica is_admin() antes de executar.
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

  const userJwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!userJwt) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });
  const { data: isAdmin } = await supabaseUser.rpc("is_admin");
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const action = body?.action;

  if (action === "release_reservations") {
    const TTL_MIN = 15;
    const cutoff = new Date(Date.now() - TTL_MIN * 60 * 1000).toISOString();
    const { data: orders } = await supabase
      .from("orders")
      .select("id, provider, transaction_id")
      .eq("status", "pending")
      .lt("created_at", cutoff);
    const released: string[] = [];
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" }) : null;
    for (const order of orders || []) {
      const { data: items } = await supabase
        .from("order_items")
        .select("product_variant_id, quantity")
        .eq("order_id", order.id);
      for (const item of items || []) {
        if (item.product_variant_id && item.quantity) {
          await supabase.rpc("increment_stock", { p_variant_id: item.product_variant_id, p_quantity: item.quantity });
        }
      }
      if (order.provider === "stripe" && order.transaction_id && stripe) {
        try {
          await stripe.paymentIntents.cancel(order.transaction_id);
        } catch (_) {}
      }
      await supabase.from("orders").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", order.id);
      released.push(order.id);
    }
    return new Response(
      JSON.stringify({ ok: true, action: "release_reservations", released: released.length, order_ids: released }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (action === "reconcile_stale") {
    const hours = 2;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data: orders } = await supabase
      .from("orders")
      .select("id")
      .eq("status", "pending")
      .not("transaction_id", "is", null)
      .lt("created_at", cutoff);
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
    let reconciled = 0;
    for (const o of orders || []) {
      const { data: order } = await supabase.from("orders").select("transaction_id").eq("id", o.id).single();
      if (!order?.transaction_id) continue;
      try {
        const pi = await stripe.paymentIntents.retrieve(order.transaction_id);
        if (pi.status === "succeeded") {
          await supabase.from("orders").update({ status: "paid", updated_at: new Date().toISOString() }).eq("id", o.id);
          const { data: ex } = await supabase.from("payments").select("id").eq("provider", "stripe").eq("transaction_id", order.transaction_id).maybeSingle();
          if (!ex) {
            await supabase.from("payments").insert({
              order_id: o.id,
              provider: "stripe",
              gateway: "stripe",
              amount: pi.amount / 100,
              status: "approved",
              transaction_id: order.transaction_id,
            });
          }
          reconciled++;
        }
      } catch (_) {}
    }
    return new Response(
      JSON.stringify({ ok: true, action: "reconcile_stale", reconciled }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // --- SOMENTE AMBIENTE DE TESTE: excluir pedido, restaurar estoque, registrar em order_events ---
  if (action === "delete_order_test") {
    const orderId = (body as Record<string, unknown>)?.order_id as string | undefined;
    if (!orderId) {
      return new Response(JSON.stringify({ error: "order_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, order_number, status")
      .eq("id", orderId)
      .single();
    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "Pedido não encontrado." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: items } = await supabase
      .from("order_items")
      .select("product_variant_id, quantity")
      .eq("order_id", orderId);
    for (const item of items || []) {
      if (item.product_variant_id && item.quantity) {
        await supabase.rpc("increment_stock", { p_variant_id: item.product_variant_id, p_quantity: item.quantity });
      }
    }
    await supabase.from("payments").delete().eq("order_id", orderId);
    await supabase.from("order_items").delete().eq("order_id", orderId);
    const { error: deleteOrderError } = await supabase.from("orders").delete().eq("id", orderId);
    if (deleteOrderError) {
      return new Response(JSON.stringify({ error: deleteOrderError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const eventHash = `admin_delete_test_${orderId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await supabase.from("order_events").insert({
      order_id: null,
      event_type: "admin_delete_test",
      event_hash: eventHash,
      payload: {
        order_id: orderId,
        order_number: order.order_number,
        status_before: order.status,
        deleted_at: new Date().toISOString(),
        reason: "modo teste",
      },
    }).then(() => {}).catch(() => {});
    return new Response(
      JSON.stringify({ ok: true, action: "delete_order_test", order_number: order.order_number }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ error: "Ação inválida. Use action: release_reservations, reconcile_stale ou delete_order_test" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
