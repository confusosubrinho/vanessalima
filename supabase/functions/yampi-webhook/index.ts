import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const payload = await req.json();
    const event = payload?.event || payload?.type || "unknown";
    const resourceData = payload?.resource || payload?.data || payload;

    // Find local order by external_reference
    const externalRef =
      resourceData?.payment_link_id?.toString() ||
      resourceData?.metadata?.local_order_id ||
      resourceData?.id?.toString() ||
      "";

    let order = null;
    if (externalRef) {
      const { data } = await supabase
        .from("orders")
        .select("id, status, provider")
        .or(`external_reference.eq.${externalRef},id.eq.${externalRef}`)
        .maybeSingle();
      order = data;
    }

    if (!order) {
      // Try metadata
      const localOrderId = resourceData?.metadata?.local_order_id;
      if (localOrderId) {
        const { data } = await supabase.from("orders").select("id, status, provider").eq("id", localOrderId).maybeSingle();
        order = data;
      }
    }

    if (!order) {
      return new Response(JSON.stringify({ ok: false, reason: "order_not_found" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Map Yampi event to local status
    const statusMap: Record<string, string> = {
      "payment.approved": "processing",
      "payment.paid": "processing",
      "order.paid": "processing",
      "payment.cancelled": "cancelled",
      "payment.refused": "cancelled",
      "order.cancelled": "cancelled",
      "payment.refunded": "cancelled",
      "order.refunded": "cancelled",
    };

    const newStatus = statusMap[event];
    const paymentMethod = resourceData?.payment_method || resourceData?.payment?.method || null;
    const gateway = resourceData?.gateway || resourceData?.payment?.gateway || null;
    const installments = resourceData?.installments || resourceData?.payment?.installments || 1;
    const transactionId = resourceData?.transaction_id || resourceData?.payment?.transaction_id || null;

    // Update order
    const updateData: Record<string, unknown> = {};
    if (newStatus) updateData.status = newStatus;
    if (paymentMethod) updateData.payment_method = paymentMethod;
    if (gateway) updateData.gateway = gateway;
    if (installments) updateData.installments = installments;
    if (transactionId) updateData.transaction_id = transactionId;

    if (Object.keys(updateData).length) {
      await supabase.from("orders").update(updateData).eq("id", order.id);
    }

    // Insert payment record
    await supabase.from("payments").insert({
      order_id: order.id,
      provider: "yampi",
      status: newStatus || event,
      payment_method: paymentMethod,
      gateway,
      transaction_id: transactionId,
      installments,
      amount: resourceData?.amount || resourceData?.total || 0,
      raw: payload,
    });

    // Stock management
    const { data: providerConfig } = await supabase
      .from("integrations_checkout_providers")
      .select("config")
      .eq("provider", "yampi")
      .maybeSingle();

    const stockMode = (providerConfig?.config as Record<string, unknown>)?.stock_mode as string || "reserve";

    if (newStatus === "processing" && stockMode === "reserve") {
      // Debit reserved stock
      const { data: movements } = await supabase
        .from("inventory_movements")
        .select("variant_id, quantity")
        .eq("order_id", order.id)
        .eq("type", "reserve");

      for (const mov of movements || []) {
        await supabase.rpc("decrement_stock", { p_variant_id: mov.variant_id, p_quantity: mov.quantity });
        await supabase.from("inventory_movements").insert({
          variant_id: mov.variant_id,
          order_id: order.id,
          type: "debit",
          quantity: mov.quantity,
        });
      }
    }

    if (["cancelled"].includes(newStatus || "")) {
      const { data: movements } = await supabase
        .from("inventory_movements")
        .select("variant_id, quantity, type")
        .eq("order_id", order.id)
        .in("type", ["debit", "reserve"]);

      for (const mov of movements || []) {
        const alreadyReleased = await supabase
          .from("inventory_movements")
          .select("id")
          .eq("order_id", order.id)
          .eq("variant_id", mov.variant_id)
          .in("type", ["release", "refund"])
          .maybeSingle();

        if (!alreadyReleased?.data) {
          const releaseType = mov.type === "debit" ? "refund" : "release";
          await supabase.rpc("increment_stock", { p_variant_id: mov.variant_id, p_quantity: mov.quantity });
          await supabase.from("inventory_movements").insert({
            variant_id: mov.variant_id,
            order_id: order.id,
            type: releaseType,
            quantity: mov.quantity,
          });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("yampi-webhook error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
