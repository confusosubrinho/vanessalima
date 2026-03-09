import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    let webhookSecret: string | undefined;
    const { data: row } = await supabase.from("integrations_checkout_providers").select("config").eq("provider", "yampi").maybeSingle();
    const config = (row as { config?: { webhook_secret?: string } } | null)?.config;
    webhookSecret = config?.webhook_secret ?? Deno.env.get("YAMPI_WEBHOOK_SECRET") ?? undefined;
    if (!webhookSecret) {
      console.error("[yampi-webhook] Webhook secret não configurado (nem em Configurar Yampi nem YAMPI_WEBHOOK_SECRET) — rejeitando request");
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
    const cancelledEvents = ["payment.cancelled", "payment.refused", "order.cancelled"];
    const refundedEvents = ["payment.refunded", "order.refunded"];
    const statusUpdateEvents = ["order.status_update"];
    const shippedEvents = ["order.shipped", "order.sent", "shipment.created"];
    const deliveredEvents = ["order.delivered", "shipment.delivered"];

    // order.status.updated: Yampi pode enviar status assim — normalizar para evento correto
    const statusValue = (resourceData?.status || resourceData?.order_status || "").toString().toLowerCase();
    let effectiveEvent = event;
    if (event === "order.status.updated") {
      if (["paid", "approved", "payment_approved"].includes(statusValue)) effectiveEvent = "order.paid";
      else if (["cancelled", "canceled", "refused"].includes(statusValue)) effectiveEvent = "order.cancelled";
      else if (["refunded"].includes(statusValue)) effectiveEvent = "order.refunded";
      else if (["shipped", "sent", "sending"].includes(statusValue)) effectiveEvent = "order.shipped";
      else if (["delivered"].includes(statusValue)) effectiveEvent = "order.delivered";
      else if (["processing", "in_production", "in_separation", "ready_for_shipping", "invoiced"].includes(statusValue)) {
        console.log("[yampi-webhook] order.status.updated with intermediate status:", statusValue, "— routing to status_update handler");
        effectiveEvent = "order.status_update";
      }
    }

    // ===== PAYMENT APPROVED -> UPDATE EXISTING (by session) OR CREATE ORDER =====
    if (approvedEvents.includes(effectiveEvent)) {
      const yampiOrderId = resourceData?.order_id?.toString() || resourceData?.id?.toString() || null;
      const sessionId = resourceData?.metadata?.session_id || null;

      // Idempotency: check order_events hash for approved event
      const approvedHash = `approved-${yampiOrderId || "unknown"}-${transactionId || yampiOrderId || Date.now()}`;
      const { data: existingEvent } = await supabase
        .from("order_events")
        .select("id")
        .eq("event_hash", approvedHash)
        .maybeSingle();

      if (existingEvent) {
        console.log("[yampi-webhook] Approved event already processed (hash), skipping:", approvedHash);
        return jsonOk({ ok: true, duplicate: true, hash: approvedHash });
      }

      // Record the event hash early to prevent race conditions
      await supabase.from("order_events").insert({
        event_type: "yampi_approved",
        event_hash: approvedHash,
        payload: { yampi_order_id: yampiOrderId, transaction_id: transactionId },
      });

      // #5 Idempotency: check if order already exists by external_reference
      if (yampiOrderId) {
        const { data: existingOrder } = await supabase
          .from("orders")
          .select("id, order_number, status")
          .eq("external_reference", yampiOrderId)
          .maybeSingle();

        if (existingOrder) {
          // Bug fix #4: If order already processing/shipped/delivered, skip re-processing
          if (["processing", "shipped", "delivered"].includes(existingOrder.status)) {
            console.log("[yampi-webhook] Order already exists with status", existingOrder.status, "— skipping re-processing:", existingOrder.id);
            return jsonOk({ ok: true, order_id: existingOrder.id, duplicate: true, status: existingOrder.status });
          }
          console.log("[yampi-webhook] Order already exists, skipping:", existingOrder.id);
          return jsonOk({ ok: true, order_id: existingOrder.id, duplicate: true });
        }
      }

      // Unificar com pedido criado no checkout start (evita duplicar e depois cancelar o errado)
      if (sessionId) {
        const { data: existingBySession } = await supabase
          .from("orders")
          .select("id, order_number, status")
          .eq("checkout_session_id", sessionId)
          .maybeSingle();

        if (existingBySession) {
          // Bug fix #4: If order already fully processed, skip re-processing payment/stock
          if (["processing", "shipped", "delivered"].includes(existingBySession.status)) {
            console.log("[yampi-webhook] Order already processed with status", existingBySession.status, "— skipping re-processing:", existingBySession.id);
            return jsonOk({ ok: true, order_id: existingBySession.id, duplicate: true, status: existingBySession.status });
          }
          // Bug fix: unwrap customer.data wrapper (Yampi API may wrap customer in .data)
          const rawCustomer = resourceData?.customer || resourceData?.buyer || {};
          const customer = rawCustomer?.data || rawCustomer;
          const customerEmail = customer?.email || resourceData?.email || null;
          // Bug fix: correct ternary precedence for customerName
          const customerName = customer?.name
            || (customer?.first_name ? `${customer.first_name} ${customer?.last_name || ""}`.trim() : null)
            || resourceData?.customer_name
            || "Cliente Yampi";
          const customerPhone = customer?.phone?.full_number || customer?.phone || null;
          const customerCpf = customer?.cpf || customer?.document || null;
          const shipping = resourceData?.shipping_address || resourceData?.address || customer?.address || {};
          const shippingCost = resourceData?.shipping_cost || resourceData?.value_shipment || 0;
          const discountAmount = resourceData?.discount || resourceData?.value_discount || 0;
          let subtotalOrder = totalAmount - shippingCost + discountAmount;
          if (subtotalOrder <= 0) subtotalOrder = totalAmount;
          const trackingCode = resourceData?.tracking_code || resourceData?.tracking?.code || null;

          await supabase.from("orders").update({
            subtotal: subtotalOrder,
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
            payment_status: "approved",
            installments,
            transaction_id: transactionId,
            tracking_code: trackingCode,
            status: "processing",
            external_reference: yampiOrderId,
          } as Record<string, unknown>).eq("id", existingBySession.id);

          // Convert existing reserves to debits, or create new debits
          const { data: existingItems } = await supabase.from("order_items").select("id, product_variant_id, quantity").eq("order_id", existingBySession.id);
          for (const row of existingItems || []) {
            if (!row.product_variant_id) continue;
            const { data: alreadyDebit } = await supabase.from("inventory_movements").select("id").eq("order_id", existingBySession.id).eq("variant_id", row.product_variant_id).eq("type", "debit").maybeSingle();
            if (!alreadyDebit) {
              // Check if there's already a reserve — if so, convert to debit (no need to decrement again)
              const { data: existingReserve } = await supabase.from("inventory_movements").select("id").eq("order_id", existingBySession.id).eq("variant_id", row.product_variant_id).eq("type", "reserve").maybeSingle();
              if (existingReserve) {
                // Convert reserve to debit
                await supabase.from("inventory_movements").update({ type: "debit" }).eq("id", existingReserve.id);
              } else {
                // No reserve exists — decrement stock now
                const stockResult = await supabase.rpc("decrement_stock", { p_variant_id: row.product_variant_id, p_quantity: row.quantity });
                const stockData = stockResult.data as { success: boolean; error?: string } | null;
                if (stockData && !stockData.success) {
                  console.warn(`[yampi-webhook] decrement_stock failed for variant ${row.product_variant_id}: ${stockData.error} — skipping inventory_movement`);
                } else {
                  await supabase.from("inventory_movements").insert({ variant_id: row.product_variant_id, order_id: existingBySession.id, type: "debit", quantity: row.quantity });
                }
              }
            }
          }

          // Idempotency: skip if payment with same transaction_id already exists
          const existingPaymentCheck = transactionId
            ? await supabase.from("payments").select("id").eq("order_id", existingBySession.id).eq("transaction_id", transactionId).maybeSingle()
            : { data: null };
          if (!existingPaymentCheck.data) {
            await supabase.from("payments").insert({
              order_id: existingBySession.id,
              provider: "yampi",
              status: "approved",
              payment_method: paymentMethod,
              gateway,
              transaction_id: transactionId,
              installments,
              amount: totalAmount,
              raw: payload,
            });
          }
          await supabase.from("abandoned_carts").update({ recovered: true, recovered_at: new Date().toISOString() }).eq("session_id", sessionId);
          if (customerEmail) {
            const { data: existingCustomer } = await supabase.from("customers").select("id, total_orders, total_spent").eq("email", customerEmail).maybeSingle();
            if (existingCustomer) {
              await supabase.from("customers").update({
                full_name: customerName,
                phone: customerPhone,
                total_orders: (existingCustomer.total_orders || 0) + 1,
                total_spent: (existingCustomer.total_spent || 0) + totalAmount,
              }).eq("id", existingCustomer.id);
            } else {
              await supabase.from("customers").insert({ email: customerEmail, full_name: customerName, phone: customerPhone, total_orders: 1, total_spent: totalAmount });
            }
          }
          // Link email automation log to active automation
          const { data: activeAutomation } = await supabase.from("email_automations")
            .select("id").eq("trigger_event", "order_confirmed").eq("is_active", true).limit(1).maybeSingle();
          await supabase.from("email_automation_logs").insert({
            recipient_email: customerEmail || "unknown",
            recipient_name: customerName,
            status: "pending",
            automation_id: activeAutomation?.id || null,
          });

          // Auto-push order to Bling
          try {
            const { autoPushOrderToBling } = await import("../_shared/blingStockPush.ts");
            const blingResult = await autoPushOrderToBling(supabase, existingBySession.id);
            console.log(`[yampi-webhook] Bling auto-push for order ${existingBySession.id}:`, JSON.stringify(blingResult));
          } catch (blingErr: any) {
            console.warn(`[yampi-webhook] Bling auto-push failed (non-blocking): ${blingErr.message}`);
          }

          console.log("[yampi-webhook] Order updated by session_id (paid):", existingBySession.id);
          return jsonOk({ ok: true, order_id: existingBySession.id, order_number: existingBySession.order_number, updated: true });
        }
      }

      // Bug fix: unwrap customer.data wrapper (Yampi API may wrap customer in .data)
      const rawCustomer = resourceData?.customer || resourceData?.buyer || {};
      const customer = rawCustomer?.data || rawCustomer;
      const customerEmail = customer?.email || resourceData?.email || null;
      // Bug fix: correct ternary precedence for customerName
      const customerName = customer?.name
        || (customer?.first_name ? `${customer.first_name} ${customer?.last_name || ""}`.trim() : null)
        || resourceData?.customer_name
        || "Cliente Yampi";
      const customerPhone = customer?.phone?.full_number || customer?.phone || null;
      const customerCpf = customer?.cpf || customer?.document || null;

      const shipping = resourceData?.shipping_address || resourceData?.address || customer?.address || {};
      const shippingCost = resourceData?.shipping_cost || resourceData?.value_shipment || 0;
      const discountAmount = resourceData?.discount || resourceData?.value_discount || 0;
      const yampiItems = resourceData?.items || resourceData?.products || resourceData?.skus || [];
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

      // Fix #6: Extract shipping_method from approved payload
      const shippingOptionRaw = resourceData?.shipping_option || {};
      const shippingOptionData = shippingOptionRaw?.data || shippingOptionRaw;
      const shippingMethodFromPayload =
        (resourceData?.shipping_option_name as string) ||
        (shippingOptionData?.name as string) ||
        (resourceData?.delivery_option?.name as string) ||
        (resourceData?.shipping_method as string) ||
        null;

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
          payment_status: "approved",
          installments,
          transaction_id: transactionId,
          tracking_code: trackingCode,
          shipping_method: shippingMethodFromPayload,
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
        const item = yampiItem as Record<string, unknown>;
        const rawSkuId =
          item.sku_id ??
          (item.sku as Record<string, unknown>)?.id ??
          (item.product as Record<string, unknown>)?.sku_id ??
          ((item.product as Record<string, unknown>)?.skus as Record<string, unknown>[])?.[0]?.id ??
          item.id ??
          item.yampi_sku_id;
        const skuId = rawSkuId != null && rawSkuId !== "" ? Number(rawSkuId) : null;
        const quantity = Number(item?.quantity) || 1;
        const unitPrice = Number(item?.price || item?.price_sale || item?.unit_price) || 0;
        const itemName = item?.name || item?.product_name || "Produto";
        const itemSku = (item?.sku as string) || (item?.sku_code as string) || (item?.code as string) || ((item?.sku as Record<string, unknown>)?.sku as string) || null;
        const itemImage = (item?.image as Record<string, unknown>) || (item?.product as Record<string, unknown>)?.image as Record<string, unknown> || {};
        const itemImageUrl = (itemImage?.url as string) || (itemImage?.src as string) || (item?.image_url as string) || null;

        let localVariant = null;
        if (skuId != null && !Number.isNaN(skuId)) {
          const { data: v } = await supabase
            .from("product_variants")
            .select("id, product_id, size, color, sku")
            .eq("yampi_sku_id", skuId)
            .maybeSingle();
          localVariant = v;
        }
        if (!localVariant && itemSku && String(itemSku).trim()) {
          const { data: v } = await supabase
            .from("product_variants")
            .select("id, product_id, size, color, sku")
            .eq("sku", String(itemSku).trim())
            .maybeSingle();
          localVariant = v;
        }

        let productName = itemName;
        let productId = localVariant?.product_id || null;
        if (productId) {
          const { data: p } = await supabase.from("products").select("name").eq("id", productId).maybeSingle();
          if (p) productName = p.name;
        }

        let imageSnapshot: string | null = itemImageUrl || null;
        if (productId && !imageSnapshot) {
          const { data: img } = await supabase
            .from("product_images")
            .select("url")
            .eq("product_id", productId)
            .eq("is_primary", true)
            .limit(1)
            .maybeSingle();
          imageSnapshot = img?.url || null;
        }
        if (!imageSnapshot && itemImageUrl) imageSnapshot = itemImageUrl;

        const variantDisplay = localVariant ? [localVariant.size, localVariant.color].filter(Boolean).join(" / ") : "";
        const skuDisplay = itemSku || (localVariant?.sku as string) || "";
        const variantInfo = [variantDisplay, skuDisplay].filter(Boolean).join(" • ") || (itemSku || "");

        await supabase.from("order_items").insert({
          order_id: order.id,
          product_id: productId,
          product_variant_id: localVariant?.id || null,
          product_name: productName,
          variant_info: variantInfo || null,
          quantity,
          unit_price: unitPrice,
          total_price: unitPrice * quantity,
          title_snapshot: productName,
          image_snapshot: imageSnapshot,
          sku_snapshot: itemSku || (localVariant?.sku as string) || null,
          yampi_sku_id: skuId != null ? skuId : null,
        });

        if (localVariant?.id) {
          const stockResult = await supabase.rpc("decrement_stock", { p_variant_id: localVariant.id, p_quantity: quantity });
          const stockData = stockResult.data as { success: boolean; error?: string } | null;
          if (stockData && !stockData.success) {
            console.warn(`[yampi-webhook] decrement_stock failed for variant ${localVariant.id}: ${stockData.error} — skipping inventory_movement`);
          } else {
            await supabase.from("inventory_movements").insert({
              variant_id: localVariant.id,
              order_id: order.id,
              type: "debit",
              quantity,
            });
          }
        }
      }

      // Insert payment record (with idempotency check)
      const existingPaymentCheck2 = transactionId
        ? await supabase.from("payments").select("id").eq("order_id", order.id).eq("transaction_id", transactionId).maybeSingle()
        : { data: null };
      if (!existingPaymentCheck2.data) {
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
      }

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
      // Link email automation log to active automation
      const { data: activeAutomation2 } = await supabase.from("email_automations")
        .select("id").eq("trigger_event", "order_confirmed").eq("is_active", true).limit(1).maybeSingle();
      await supabase.from("email_automation_logs").insert({
        recipient_email: customerEmail || "unknown",
        recipient_name: customerName,
        status: "pending",
        automation_id: activeAutomation2?.id || null,
      }).then(() => {
        console.log("[yampi-webhook] Email automation log created for order", order.id);
      });

      // Auto-push order to Bling
      try {
        const { autoPushOrderToBling } = await import("../_shared/blingStockPush.ts");
        const blingResult = await autoPushOrderToBling(supabase, order.id);
        console.log(`[yampi-webhook] Bling auto-push for order ${order.id}:`, JSON.stringify(blingResult));
      } catch (blingErr: any) {
        console.warn(`[yampi-webhook] Bling auto-push failed (non-blocking): ${blingErr.message}`);
      }

      return jsonOk({ ok: true, order_id: order.id, order_number: order.order_number });
    }

    // ===== STATUS UPDATE (intermediate statuses: processing, in_production, in_separation, ready_for_shipping) =====
    if (statusUpdateEvents.includes(effectiveEvent)) {
      const externalRef = resourceData?.order_id?.toString() || resourceData?.id?.toString() || "";
      const sessionId = resourceData?.metadata?.session_id || null;

      const statusHash = `status-update-${externalRef || sessionId}-${statusValue}`;
      const { data: existingEvent } = await supabase.from("order_events").select("id").eq("event_hash", statusHash).maybeSingle();
      if (existingEvent) {
        console.log("[yampi-webhook] Duplicate status update event, skipping:", statusHash);
        return jsonOk({ ok: true, event, duplicate: true });
      }

      // Map Yampi intermediate status to local status
      const intermediateStatusMap: Record<string, string> = {
        processing: "processing",
        in_production: "processing",
        in_separation: "processing",
        ready_for_shipping: "processing",
        invoiced: "processing",
      };
      const newLocalStatus = intermediateStatusMap[statusValue] || "processing";

      let existingOrder: { id: string; status: string } | null = null;
      if (externalRef) {
        const { data } = await supabase.from("orders").select("id, status").eq("external_reference", externalRef).maybeSingle();
        existingOrder = data;
      }
      if (!existingOrder && sessionId) {
        const { data } = await supabase.from("orders").select("id, status").eq("checkout_session_id", sessionId).maybeSingle();
        existingOrder = data;
      }

      if (existingOrder) {
        // Prevent status regression: don't overwrite shipped/delivered with processing
        if (["shipped", "delivered"].includes(existingOrder.status)) {
          console.log("[yampi-webhook] Ignoring status update: order already", existingOrder.status, existingOrder.id);
          await supabase.from("order_events").insert({ order_id: existingOrder.id, event_type: `status_update_${statusValue}`, event_hash: statusHash, payload });
          return jsonOk({ ok: true, event, action: "ignored_already_advanced" });
        }

        // Only update status, do NOT re-process payment or stock
        await supabase.from("orders").update({ status: newLocalStatus }).eq("id", existingOrder.id);
        await supabase.from("order_events").insert({ order_id: existingOrder.id, event_type: `status_update_${statusValue}`, event_hash: statusHash, payload });
        console.log("[yampi-webhook] Order status updated:", existingOrder.id, statusValue, "→", newLocalStatus);
      }
      return jsonOk({ ok: true, event, yampi_status: statusValue, local_status: newLocalStatus });
    }

    // ===== REFUNDED EVENTS (separate from cancelled — may be partial) =====
    if (refundedEvents.includes(effectiveEvent)) {
      const externalRef = resourceData?.order_id?.toString() || resourceData?.id?.toString() || "";
      const sessionId = resourceData?.metadata?.session_id || null;

      const refundHash = `refund-${externalRef || sessionId}-${transactionId || Date.now()}`;
      const { data: existingEvent } = await supabase.from("order_events").select("id").eq("event_hash", refundHash).maybeSingle();
      if (existingEvent) {
        console.log("[yampi-webhook] Duplicate refund event, skipping:", refundHash);
        return jsonOk({ ok: true, event, duplicate: true });
      }

      let existingOrder: { id: string; status: string } | null = null;
      if (externalRef) {
        const { data } = await supabase.from("orders").select("id, status").eq("external_reference", externalRef).maybeSingle();
        existingOrder = data;
      }
      if (!existingOrder && sessionId) {
        const { data } = await supabase.from("orders").select("id, status").eq("checkout_session_id", sessionId).maybeSingle();
        existingOrder = data;
      }

      if (existingOrder) {
        // Update payment status to refunded but keep order status as-is (partial refund scenario)
        // Only cancel if order is still pending
        if (existingOrder.status === "pending") {
          await supabase.from("orders").update({ status: "cancelled", payment_status: "refunded" } as Record<string, unknown>).eq("id", existingOrder.id);
        } else {
          await supabase.from("orders").update({ payment_status: "refunded" } as Record<string, unknown>).eq("id", existingOrder.id);
        }

        // Fix #3: Restore stock if order had already debited inventory (processing or later)
        if (["processing", "shipped", "delivered"].includes(existingOrder.status)) {
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
          console.log("[yampi-webhook] Stock restored for refunded order:", existingOrder.id);
        }

        // Update existing payment record
        const { data: existingPayment } = await supabase
          .from("payments").select("id").eq("order_id", existingOrder.id).maybeSingle();
        if (existingPayment) {
          await supabase.from("payments")
            .update({ status: "refunded", raw: payload })
            .eq("id", existingPayment.id);
        } else {
          await supabase.from("payments").insert({
            order_id: existingOrder.id,
            provider: "yampi",
            status: "refunded",
            payment_method: paymentMethod,
            gateway,
            transaction_id: transactionId,
            installments,
            amount: totalAmount,
            raw: payload,
          });
        }

        await supabase.from("order_events").insert({ order_id: existingOrder.id, event_type: "refund", event_hash: refundHash, payload });
        console.log("[yampi-webhook] Order refunded:", existingOrder.id, "order_status:", existingOrder.status);
      }
      return jsonOk({ ok: true, event: effectiveEvent });
    }

    // ===== #10 SHIPPED EVENTS =====
    if (shippedEvents.includes(effectiveEvent)) {
      const externalRef = resourceData?.order_id?.toString() || resourceData?.id?.toString() || "";
      const sessionId = resourceData?.metadata?.session_id || null;
      const trackingCode = resourceData?.tracking_code || resourceData?.tracking?.code || resourceData?.shipment?.tracking_code || null;
      const eventShippingCost = resourceData?.shipping_cost || resourceData?.value_shipment || null;

      // Idempotency: hash check
      const shippedHash = `shipped-${externalRef || sessionId}-${trackingCode || "notrack"}`;
      const { data: existingEvent } = await supabase.from("order_events").select("id").eq("event_hash", shippedHash).maybeSingle();
      if (existingEvent) {
        console.log("[yampi-webhook] Duplicate shipped event, skipping:", shippedHash);
        return jsonOk({ ok: true, event, duplicate: true });
      }

      let existingOrder: { id: string; status: string } | null = null;
      if (externalRef) {
        const { data } = await supabase.from("orders").select("id, status").eq("external_reference", externalRef).maybeSingle();
        existingOrder = data;
      }
      if (!existingOrder && sessionId) {
        const { data } = await supabase.from("orders").select("id, status").eq("checkout_session_id", sessionId).maybeSingle();
        existingOrder = data;
      }

      if (existingOrder) {
        // Y27: Prevent status regression — don't overwrite "delivered" with "shipped"
        if (existingOrder.status === "delivered") {
          console.log("[yampi-webhook] Ignoring shipped event: order already delivered", existingOrder.id);
          await supabase.from("order_events").insert({ order_id: existingOrder.id, event_type: effectiveEvent, event_hash: shippedHash, payload });
          return jsonOk({ ok: true, event, action: "ignored_already_delivered" });
        }
        const updateData: Record<string, unknown> = { status: "shipped", payment_status: "approved" };
        if (trackingCode) updateData.tracking_code = trackingCode;
        if (eventShippingCost != null && Number(eventShippingCost) > 0) updateData.shipping_cost = Number(eventShippingCost);
        await supabase.from("orders").update(updateData).eq("id", existingOrder.id);
        await supabase.from("order_events").insert({ order_id: existingOrder.id, event_type: effectiveEvent, event_hash: shippedHash, payload });
        console.log("[yampi-webhook] Order shipped:", existingOrder.id, trackingCode);
      }
      return jsonOk({ ok: true, event });
    }

    // ===== #10 DELIVERED EVENTS =====
    if (deliveredEvents.includes(effectiveEvent)) {
      const externalRef = resourceData?.order_id?.toString() || resourceData?.id?.toString() || "";
      const sessionId = resourceData?.metadata?.session_id || null;

      const deliveredHash = `delivered-${externalRef || sessionId}`;
      const { data: existingEvent } = await supabase.from("order_events").select("id").eq("event_hash", deliveredHash).maybeSingle();
      if (existingEvent) {
        console.log("[yampi-webhook] Duplicate delivered event, skipping:", deliveredHash);
        return jsonOk({ ok: true, event, duplicate: true });
      }

      let existingOrder: { id: string } | null = null;
      if (externalRef) {
        const { data } = await supabase.from("orders").select("id").eq("external_reference", externalRef).maybeSingle();
        existingOrder = data;
      }
      if (!existingOrder && sessionId) {
        const { data } = await supabase.from("orders").select("id").eq("checkout_session_id", sessionId).maybeSingle();
        existingOrder = data;
      }

      if (existingOrder) {
        await supabase.from("orders").update({ status: "delivered", payment_status: "approved" } as Record<string, unknown>).eq("id", existingOrder.id);
        await supabase.from("order_events").insert({ order_id: existingOrder.id, event_type: effectiveEvent, event_hash: deliveredHash, payload });
        console.log("[yampi-webhook] Order delivered:", existingOrder.id);
      }
      return jsonOk({ ok: true, event });
    }

    // ===== CANCELLED/REFUSED EVENTS =====
    if (cancelledEvents.includes(effectiveEvent)) {
      const externalRef =
        resourceData?.payment_link_id?.toString() ||
        resourceData?.order_id?.toString() ||
        resourceData?.id?.toString() ||
        "";
      const sessionId = resourceData?.metadata?.session_id || null;

      const cancelHash = `cancel-${externalRef || sessionId}-${effectiveEvent}`;
      const { data: existingEvent } = await supabase.from("order_events").select("id").eq("event_hash", cancelHash).maybeSingle();
      if (existingEvent) {
        console.log("[yampi-webhook] Duplicate cancel event, skipping:", cancelHash);
        return jsonOk({ ok: true, event, duplicate: true });
      }

      let existingOrder: { id: string; status: string } | null = null;
      if (externalRef) {
        const { data } = await supabase.from("orders").select("id, status").eq("external_reference", externalRef).maybeSingle();
        existingOrder = data;
      }
      if (!existingOrder && sessionId) {
        const { data } = await supabase.from("orders").select("id, status").eq("checkout_session_id", sessionId).maybeSingle();
        existingOrder = data;
      }

      if (existingOrder && existingOrder.status !== "cancelled") {
        // Não cancelar pedido já pago/enviado/entregue (evita evento de recusa anterior sobrescrever pagamento aprovado)
        if (["paid", "shipped", "delivered"].includes(existingOrder.status)) {
          console.log("[yampi-webhook] Ignorando cancelamento: pedido já está", existingOrder.status, existingOrder.id);
          return jsonOk({ ok: true, event: effectiveEvent, action: "ignored_already_fulfilled" });
        }
        // Fix #2: Also update payment_status on cancellation
        const cancelledPaymentStatusForOrder = event.includes("refused") ? "refused"
          : event.includes("chargeback") ? "chargeback"
          : "cancelled";
        await supabase.from("orders").update({ status: "cancelled", payment_status: cancelledPaymentStatusForOrder } as Record<string, unknown>).eq("id", existingOrder.id);

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

        // Normalize cancelled payment status instead of raw event string
        const cancelledPaymentStatus = event.includes("refused") ? "refused"
          : event.includes("chargeback") ? "chargeback"
          : "cancelled";

        const { data: existingPayment } = await supabase
          .from("payments").select("id").eq("order_id", existingOrder.id).maybeSingle();
        if (existingPayment) {
          await supabase.from("payments")
            .update({ status: cancelledPaymentStatus, raw: payload })
            .eq("id", existingPayment.id);
        } else {
          await supabase.from("payments").insert({
            order_id: existingOrder.id,
            provider: "yampi",
            status: cancelledPaymentStatus,
            payment_method: paymentMethod,
            gateway,
            transaction_id: transactionId,
            installments,
            amount: totalAmount,
            raw: payload,
          });
        }
      }
      if (existingOrder) {
        await supabase.from("order_events").insert({ order_id: existingOrder.id, event_type: effectiveEvent, event_hash: cancelHash, payload });

        // Y30: Insert email automation log for cancellation
        // Fix: unwrap customer.data wrapper (Yampi API may wrap customer in .data)
        const rawCancelCustomer = resourceData?.customer || resourceData?.buyer || {};
        const cancelCustomer = (rawCancelCustomer as Record<string, unknown>)?.data || rawCancelCustomer;
        const customerEmail = (cancelCustomer as Record<string, unknown>)?.email || resourceData?.email || null;
        const customerName = (cancelCustomer as Record<string, unknown>)?.name
          || ((cancelCustomer as Record<string, unknown>)?.first_name ? `${(cancelCustomer as Record<string, unknown>).first_name} ${(cancelCustomer as Record<string, unknown>)?.last_name || ""}`.trim() : null)
          || resourceData?.customer_name || "Cliente";
        const { data: cancelAutomation } = await supabase.from("email_automations")
          .select("id").eq("trigger_event", "order_cancelled").eq("is_active", true).limit(1).maybeSingle();
        if (customerEmail) {
          await supabase.from("email_automation_logs").insert({
            recipient_email: customerEmail,
            recipient_name: customerName,
            status: "pending",
            automation_id: cancelAutomation?.id || null,
          });
        }
      }
      return jsonOk({ ok: true, event: effectiveEvent });
    }

    console.log("[yampi-webhook] Unhandled event:", event, effectiveEvent !== event ? `(effective: ${effectiveEvent})` : "");
    return jsonOk({ ok: true, event, action: "ignored" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("yampi-webhook error:", msg, stack);

    // Log failure to error_logs for debugging
    try {
      await supabase.from("error_logs").insert({
        error_type: "yampi-webhook",
        error_message: `Webhook processing failed: ${msg}`,
        error_stack: stack || null,
        page_url: req.url,
        severity: "error",
      });
    } catch (_) { /* best-effort */ }

    return jsonOk({ ok: false, error: msg });
  }
});

function jsonOk(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
