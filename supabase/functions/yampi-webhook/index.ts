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
    // Webhook security: validate shared secret in query string (?token=...)
    const url = new URL(req.url);
    const webhookSecret = Deno.env.get("YAMPI_WEBHOOK_SECRET");

    if (!webhookSecret) {
      console.error("[yampi-webhook] YAMPI_WEBHOOK_SECRET não configurado — rejeitando request");
      return new Response("Webhook secret not configured", { status: 500, headers: corsHeaders });
    }

    const incomingToken = url.searchParams.get("token");
    if (!incomingToken || incomingToken !== webhookSecret) {
      console.warn("[yampi-webhook] Webhook token inválido recebido");
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const payload = await req.json();
    const event = payload?.event || payload?.type || "unknown";
    const resourceData = payload?.resource || payload?.data || payload;

    console.log("[yampi-webhook] Event:", event, "Resource keys:", Object.keys(resourceData || {}));

    const paymentMethod = resourceData?.payment_method || resourceData?.payment?.method || null;
    const gateway = resourceData?.gateway || resourceData?.payment?.gateway || null;
    const installments = resourceData?.installments || resourceData?.payment?.installments || 1;
    const transactionId = resourceData?.transaction_id || resourceData?.payment?.transaction_id || null;
    const totalAmount = resourceData?.amount || resourceData?.total || resourceData?.value_total || 0;

    const approvedEvents = ["payment.approved", "payment.paid", "order.paid"];
    const cancelledEvents = ["payment.cancelled", "payment.refused", "order.cancelled", "payment.refunded", "order.refunded"];
    const shippedEvents = ["order.shipped", "order.sent", "shipment.created"];
    const deliveredEvents = ["order.delivered", "shipment.delivered"];

    // ===== PAYMENT APPROVED -> CREATE ORDER =====
    if (approvedEvents.includes(event)) {
      const yampiOrderId = resourceData?.order_id?.toString() || resourceData?.id?.toString() || null;

      // #5 Idempotency: check if order already exists
      if (yampiOrderId) {
        const { data: existingOrder } = await supabase
          .from("orders")
          .select("id, order_number")
          .eq("external_reference", yampiOrderId)
          .maybeSingle();

        if (existingOrder) {
          console.log("[yampi-webhook] Order already exists, skipping:", existingOrder.id);
          return jsonOk({ ok: true, order_id: existingOrder.id, duplicate: true });
        }
      }

      const customer = resourceData?.customer || resourceData?.buyer || {};
      const customerEmail = customer?.email || resourceData?.email || null;
      const customerName = customer?.name || customer?.first_name
        ? `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim()
        : resourceData?.customer_name || "Cliente Yampi";
      const customerPhone = customer?.phone?.full_number || customer?.phone || null;
      const customerCpf = customer?.cpf || customer?.document || null;

      const shipping = resourceData?.shipping_address || resourceData?.address || customer?.address || {};
      const shippingCost = resourceData?.shipping_cost || resourceData?.value_shipment || 0;
      const discountAmount = resourceData?.discount || resourceData?.value_discount || 0;
      const yampiItems = resourceData?.items || resourceData?.products || resourceData?.skus || [];
      const sessionId = resourceData?.metadata?.session_id || null;
      const yampiOrderNumber = resourceData?.number?.toString() || resourceData?.order_number?.toString() || yampiOrderId || "";
      const trackingCode = resourceData?.tracking_code || resourceData?.tracking?.code || null;

      let subtotal = totalAmount - shippingCost + discountAmount;
      if (subtotal <= 0) subtotal = totalAmount;

      // #2 Fetch UTMs from abandoned cart
      let utmData: Record<string, string | null> = {};
      if (sessionId) {
        const { data: cart } = await supabase
          .from("abandoned_carts")
          .select("utm_source, utm_medium, utm_campaign, utm_term, utm_content, page_url")
          .eq("session_id", sessionId)
          .maybeSingle();
        if (cart) {
          utmData = {
            utm_source: cart.utm_source,
            utm_medium: cart.utm_medium,
            utm_campaign: cart.utm_campaign,
            utm_term: cart.utm_term,
            utm_content: cart.utm_content,
            landing_page: cart.page_url,
          };
        }
      }

      // Create the order with UTM data
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
          tracking_code: trackingCode,
          status: "processing",
          external_reference: yampiOrderId,
          checkout_session_id: sessionId,
          appmax_order_id: null,
          // #2 UTM attribution
          utm_source: utmData.utm_source || null,
          utm_medium: utmData.utm_medium || null,
          utm_campaign: utmData.utm_campaign || null,
          utm_term: utmData.utm_term || null,
          utm_content: utmData.utm_content || null,
          landing_page: utmData.landing_page || null,
          referrer: null,
        } as Record<string, unknown>)
        .select("id, order_number")
        .single();

      if (orderError || !order) {
        console.error("[yampi-webhook] Error creating order:", orderError?.message);
        return jsonOk({ ok: false, error: orderError?.message });
      }

      console.log("[yampi-webhook] Order created:", order.id, order.order_number);

      // Insert order items and debit stock
      for (const yampiItem of yampiItems) {
        const skuId = yampiItem?.sku_id || yampiItem?.id || yampiItem?.yampi_sku_id;
        const quantity = yampiItem?.quantity || 1;
        const unitPrice = yampiItem?.price || yampiItem?.price_sale || yampiItem?.unit_price || 0;
        const itemName = yampiItem?.name || yampiItem?.product_name || "Produto";

        let localVariant = null;
        if (skuId) {
          const { data: v } = await supabase
            .from("product_variants")
            .select("id, product_id, size, color")
            .eq("yampi_sku_id", skuId)
            .maybeSingle();
          localVariant = v;
        }

        let productName = itemName;
        let productId = localVariant?.product_id || null;
        if (productId) {
          const { data: p } = await supabase.from("products").select("name").eq("id", productId).maybeSingle();
          if (p) productName = p.name;
        }

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

      // #3 Upsert customer
      if (customerEmail) {
        const { data: existingCustomer } = await supabase
          .from("customers")
          .select("id, total_orders, total_spent")
          .eq("email", customerEmail)
          .maybeSingle();

        if (existingCustomer) {
          await supabase.from("customers").update({
            full_name: customerName,
            phone: customerPhone,
            total_orders: (existingCustomer.total_orders || 0) + 1,
            total_spent: (existingCustomer.total_spent || 0) + totalAmount,
          }).eq("id", existingCustomer.id);
        } else {
          await supabase.from("customers").insert({
            email: customerEmail,
            full_name: customerName,
            phone: customerPhone,
            total_orders: 1,
            total_spent: totalAmount,
          });
        }
      }

      // #4 Log email automation trigger
      await supabase.from("email_automation_logs").insert({
        recipient_email: customerEmail || "unknown",
        recipient_name: customerName,
        status: "pending",
      }).then(() => {
        console.log("[yampi-webhook] Email automation log created for order", order.id);
      });

      return jsonOk({ ok: true, order_id: order.id, order_number: order.order_number });
    }

    // ===== #10 SHIPPED EVENTS =====
    if (shippedEvents.includes(event)) {
      const externalRef = resourceData?.order_id?.toString() || resourceData?.id?.toString() || "";
      const trackingCode = resourceData?.tracking_code || resourceData?.tracking?.code || resourceData?.shipment?.tracking_code || null;

      if (externalRef) {
        const { data: existingOrder } = await supabase
          .from("orders")
          .select("id, status")
          .eq("external_reference", externalRef)
          .maybeSingle();

        if (existingOrder) {
          const updateData: Record<string, unknown> = { status: "shipped" };
          if (trackingCode) updateData.tracking_code = trackingCode;
          await supabase.from("orders").update(updateData).eq("id", existingOrder.id);
          console.log("[yampi-webhook] Order shipped:", existingOrder.id, trackingCode);
        }
      }
      return jsonOk({ ok: true, event });
    }

    // ===== #10 DELIVERED EVENTS =====
    if (deliveredEvents.includes(event)) {
      const externalRef = resourceData?.order_id?.toString() || resourceData?.id?.toString() || "";
      if (externalRef) {
        const { data: existingOrder } = await supabase
          .from("orders")
          .select("id")
          .eq("external_reference", externalRef)
          .maybeSingle();

        if (existingOrder) {
          await supabase.from("orders").update({ status: "delivered" }).eq("id", existingOrder.id);
          console.log("[yampi-webhook] Order delivered:", existingOrder.id);
        }
      }
      return jsonOk({ ok: true, event });
    }

    // ===== CANCELLED/REFUSED EVENTS =====
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
      return jsonOk({ ok: true, event });
    }

    console.log("[yampi-webhook] Unhandled event:", event);
    return jsonOk({ ok: true, event, action: "ignored" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("yampi-webhook error:", msg);
    return jsonOk({ ok: false, error: msg });
  }
});

function jsonOk(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
