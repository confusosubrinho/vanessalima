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

    console.log("[yampi-webhook] Event:", event, "Resource keys:", Object.keys(resourceData || {}));

    const paymentMethod = resourceData?.payment_method || resourceData?.payment?.method || null;
    const gateway = resourceData?.gateway || resourceData?.payment?.gateway || null;
    const installments = resourceData?.installments || resourceData?.payment?.installments || 1;
    const transactionId = resourceData?.transaction_id || resourceData?.payment?.transaction_id || null;
    const totalAmount = resourceData?.amount || resourceData?.total || resourceData?.value_total || 0;

    // Payment approved events -> CREATE order
    const approvedEvents = ["payment.approved", "payment.paid", "order.paid"];
    const cancelledEvents = ["payment.cancelled", "payment.refused", "order.cancelled", "payment.refunded", "order.refunded"];

    if (approvedEvents.includes(event)) {
      // Extract customer info from payload
      const customer = resourceData?.customer || resourceData?.buyer || {};
      const customerEmail = customer?.email || resourceData?.email || null;
      const customerName = customer?.name || customer?.first_name 
        ? `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim()
        : resourceData?.customer_name || "Cliente Yampi";
      const customerPhone = customer?.phone?.full_number || customer?.phone || null;
      const customerCpf = customer?.cpf || customer?.document || null;

      // Extract shipping info
      const shipping = resourceData?.shipping_address || resourceData?.address || customer?.address || {};
      const shippingCost = resourceData?.shipping_cost || resourceData?.value_shipment || 0;
      const discountAmount = resourceData?.discount || resourceData?.value_discount || 0;

      // Extract items from payload
      const yampiItems = resourceData?.items || resourceData?.products || resourceData?.skus || [];

      // Extract session_id from metadata to link abandoned cart
      const sessionId = resourceData?.metadata?.session_id || null;

      // Extract external references
      const yampiOrderId = resourceData?.order_id?.toString() || resourceData?.id?.toString() || null;
      const yampiOrderNumber = resourceData?.number?.toString() || resourceData?.order_number?.toString() || yampiOrderId || "";

      // Calculate subtotal from items or use total
      let subtotal = totalAmount - shippingCost + discountAmount;
      if (subtotal <= 0) subtotal = totalAmount;

      // Create the order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          order_number: "TEMP",
          subtotal,
          total_amount: totalAmount,
          shipping_cost: shippingCost,
          discount_amount: discountAmount,
          shipping_name: customerName,
          shipping_address: shipping?.street || shipping?.address || "",
          shipping_city: shipping?.city || "",
          shipping_state: shipping?.state || "",
          shipping_zip: shipping?.zipcode || shipping?.zip || "",
          shipping_phone: customerPhone,
          customer_email: customerEmail,
          customer_cpf: customerCpf,
          provider: "yampi",
          gateway,
          payment_method: paymentMethod,
          installments,
          transaction_id: transactionId,
          status: "processing",
          external_reference: yampiOrderId,
          appmax_order_id: null,
        } as Record<string, unknown>)
        .select("id, order_number")
        .single();

      if (orderError || !order) {
        console.error("[yampi-webhook] Error creating order:", orderError?.message);
        return new Response(JSON.stringify({ ok: false, error: orderError?.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      console.log("[yampi-webhook] Order created:", order.id, order.order_number);

      // Insert order items and debit stock
      for (const yampiItem of yampiItems) {
        const skuId = yampiItem?.sku_id || yampiItem?.id || yampiItem?.yampi_sku_id;
        const quantity = yampiItem?.quantity || 1;
        const unitPrice = yampiItem?.price || yampiItem?.price_sale || yampiItem?.unit_price || 0;
        const itemName = yampiItem?.name || yampiItem?.product_name || "Produto";

        // Map yampi_sku_id to local variant
        let localVariant = null;
        if (skuId) {
          const { data: v } = await supabase
            .from("product_variants")
            .select("id, product_id, size, color")
            .eq("yampi_sku_id", skuId)
            .maybeSingle();
          localVariant = v;
        }

        // Get product name if we have local variant
        let productName = itemName;
        let productId = localVariant?.product_id || null;
        if (productId) {
          const { data: p } = await supabase.from("products").select("name").eq("id", productId).maybeSingle();
          if (p) productName = p.name;
        }

        // Get primary image
        let imageSnapshot: string | null = null;
        if (productId) {
          const { data: img } = await supabase
            .from("product_images")
            .select("url")
            .eq("product_id", productId)
            .eq("is_primary", true)
            .limit(1)
            .maybeSingle();
          imageSnapshot = img?.url || null;
        }

        await supabase.from("order_items").insert({
          order_id: order.id,
          product_id: productId,
          product_variant_id: localVariant?.id || null,
          product_name: productName,
          variant_info: localVariant ? [localVariant.size, localVariant.color].filter(Boolean).join(" / ") : "",
          quantity,
          unit_price: unitPrice,
          total_price: unitPrice * quantity,
          title_snapshot: productName,
          image_snapshot: imageSnapshot,
        });

        // Debit stock
        if (localVariant?.id) {
          await supabase.rpc("decrement_stock", { p_variant_id: localVariant.id, p_quantity: quantity });
          await supabase.from("inventory_movements").insert({
            variant_id: localVariant.id,
            order_id: order.id,
            type: "debit",
            quantity,
          });
        }
      }

      // Insert payment record
      await supabase.from("payments").insert({
        order_id: order.id,
        provider: "yampi",
        status: "approved",
        payment_method: paymentMethod,
        gateway,
        transaction_id: transactionId,
        installments,
        amount: totalAmount,
        raw: payload,
      });

      // Mark abandoned cart as recovered
      if (sessionId) {
        await supabase
          .from("abandoned_carts")
          .update({ recovered: true, recovered_at: new Date().toISOString() })
          .eq("session_id", sessionId);
      }

      return new Response(JSON.stringify({ ok: true, order_id: order.id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Cancelled/refused events -> handle existing orders (if any from other flows)
    if (cancelledEvents.includes(event)) {
      const externalRef =
        resourceData?.payment_link_id?.toString() ||
        resourceData?.order_id?.toString() ||
        resourceData?.id?.toString() ||
        "";

      if (externalRef) {
        const { data: existingOrder } = await supabase
          .from("orders")
          .select("id, status")
          .eq("external_reference", externalRef)
          .maybeSingle();

        if (existingOrder && existingOrder.status !== "cancelled") {
          await supabase.from("orders").update({ status: "cancelled" }).eq("id", existingOrder.id);

          // Restore stock
          const { data: movements } = await supabase
            .from("inventory_movements")
            .select("variant_id, quantity, type")
            .eq("order_id", existingOrder.id)
            .in("type", ["debit", "reserve"]);

          for (const mov of movements || []) {
            const { data: alreadyReleased } = await supabase
              .from("inventory_movements")
              .select("id")
              .eq("order_id", existingOrder.id)
              .eq("variant_id", mov.variant_id)
              .in("type", ["release", "refund"])
              .maybeSingle();

            if (!alreadyReleased) {
              const releaseType = mov.type === "debit" ? "refund" : "release";
              await supabase.rpc("increment_stock", { p_variant_id: mov.variant_id, p_quantity: mov.quantity });
              await supabase.from("inventory_movements").insert({
                variant_id: mov.variant_id,
                order_id: existingOrder.id,
                type: releaseType,
                quantity: mov.quantity,
              });
            }
          }

          // Insert payment record for cancellation
          await supabase.from("payments").insert({
            order_id: existingOrder.id,
            provider: "yampi",
            status: event,
            payment_method: paymentMethod,
            gateway,
            transaction_id: transactionId,
            installments,
            amount: totalAmount,
            raw: payload,
          });
        }
      }

      return new Response(JSON.stringify({ ok: true, event }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Unknown event - just log
    console.log("[yampi-webhook] Unhandled event:", event);
    return new Response(JSON.stringify({ ok: true, event, action: "ignored" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("yampi-webhook error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
