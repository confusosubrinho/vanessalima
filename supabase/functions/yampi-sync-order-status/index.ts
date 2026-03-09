/**
 * yampi-sync-order-status: Sincroniza status e dados de um pedido Yampi com o pedido local.
 * Busca o pedido na API Yampi pelo external_reference e atualiza status, pagamento, rastreio, método de envio e data da compra.
 * Requer autenticação de admin (JWT).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonRes(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonRes({ ok: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return jsonRes({ ok: false, error: "Não autenticado" }, 401);

  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return jsonRes({ ok: false, error: "Token inválido" }, 401);

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return jsonRes({ ok: false, error: "Permissão negada" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonRes({ ok: false, error: "JSON inválido" }, 400);
  }

  const orderId = (body.order_id as string)?.trim();
  if (!orderId) return jsonRes({ ok: false, error: "Informe order_id (UUID do pedido local)" }, 400);

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, order_number, external_reference, yampi_order_number, provider")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return jsonRes({ ok: false, error: "Pedido não encontrado" }, 404);
  }
  if (order.provider !== "yampi" || !order.external_reference) {
    return jsonRes({ ok: false, error: "Pedido não é da Yampi ou não possui ID externo" }, 400);
  }

  const { data: yampiProvider } = await supabase
    .from("integrations_checkout_providers")
    .select("config, is_active")
    .eq("provider", "yampi")
    .maybeSingle();

  if (!yampiProvider || !yampiProvider.is_active) {
    return jsonRes({ ok: false, error: "Integração Yampi não está ativa" }, 400);
  }

  const config = yampiProvider.config as Record<string, unknown>;
  const alias = config?.alias as string;
  const userToken = config?.user_token as string;
  const userSecretKey = config?.user_secret_key as string;
  if (!alias || !userToken || !userSecretKey) {
    return jsonRes({ ok: false, error: "Credenciais Yampi incompletas" }, 400);
  }

  const baseUrl = `https://api.dooki.com.br/v2/${alias}`;
  const includeQuery = "include=items,customer,shipping_address,transactions";
  const headers = {
    "User-Token": userToken,
    "User-Secret-Key": userSecretKey,
    Accept: "application/json",
  };

  // --- Lookup helpers ---
  async function fetchById(id: string): Promise<Record<string, unknown> | null> {
    const url = `${baseUrl}/orders/${id}?${includeQuery}`;
    console.log(`[yampi-sync] GET ${url}`);
    try {
      const res = await fetchWithTimeout(url, { headers });
      console.log(`[yampi-sync] GET /orders/${id} → ${res.status}`);
      if (!res.ok) return null;
      const json = await res.json();
      return (json?.data as Record<string, unknown>) || null;
    } catch (e) {
      console.error(`[yampi-sync] fetchById(${id}) error:`, e);
      return null;
    }
  }

  async function fetchByNumber(num: string): Promise<Record<string, unknown> | null> {
    const url = `${baseUrl}/orders?${includeQuery}&number=${encodeURIComponent(num)}&limit=1`;
    console.log(`[yampi-sync] GET ${url}`);
    try {
      const res = await fetchWithTimeout(url, { headers });
      console.log(`[yampi-sync] GET /orders?number=${num} → ${res.status}`);
      if (!res.ok) return null;
      const json = await res.json();
      return (json?.data?.[0] as Record<string, unknown>) || null;
    } catch (e) {
      console.error(`[yampi-sync] fetchByNumber(${num}) error:`, e);
      return null;
    }
  }

  async function fetchBySearch(q: string): Promise<Record<string, unknown> | null> {
    const url = `${baseUrl}/orders?${includeQuery}&q=${encodeURIComponent(q)}&limit=5`;
    console.log(`[yampi-sync] GET ${url}`);
    try {
      const res = await fetchWithTimeout(url, { headers });
      if (!res.ok) return null;
      const json = await res.json();
      const orders = json?.data || [];
      return orders.find((o: Record<string, unknown>) =>
        String(o.id) === q || String(o.number) === q
      ) || orders[0] || null;
    } catch (e) {
      console.error(`[yampi-sync] fetchBySearch(${q}) error:`, e);
      return null;
    }
  }

  let yampiOrder: Record<string, unknown> | null = null;
  const extRef = order.external_reference;
  const yampiNum = order.yampi_order_number;

  try {
    // 1) GET direto por external_reference (pode ser ID Yampi)
    yampiOrder = await fetchById(extRef);

    // 2) GET direto por yampi_order_number (se diferente)
    if (!yampiOrder && yampiNum && yampiNum !== extRef) {
      yampiOrder = await fetchById(yampiNum);
    }

    // 3) Busca por number=external_reference (filtro exato)
    if (!yampiOrder) {
      yampiOrder = await fetchByNumber(extRef);
    }

    // 4) Busca por number=yampi_order_number
    if (!yampiOrder && yampiNum && yampiNum !== extRef) {
      yampiOrder = await fetchByNumber(yampiNum);
    }

    // 5) Fallback: search genérico (último recurso)
    if (!yampiOrder) {
      yampiOrder = await fetchBySearch(extRef);
    }
  } catch (err) {
    console.error("[yampi-sync] Fetch error:", err);
    return jsonRes({ ok: false, error: "Erro ao conectar com a API Yampi" }, 502);
  }

  console.log(`[yampi-sync] Lookup result for order ${order.order_number}: found=${!!yampiOrder}, yampi_id=${yampiOrder?.id ?? "null"}`);

  if (!yampiOrder) {
    return jsonRes({
      ok: false,
      error: "Pedido não encontrado na Yampi",
      hint: "Se importou pelo ID interno, tente importar de novo pelo número do pedido (ex.: 1491772375818422) que aparece no painel da Yampi.",
    }, 404);
  }

  const yampiStatus = String((yampiOrder.status as any)?.data?.alias || yampiOrder.status_alias || yampiOrder.status || "");
  let localStatus: string = "processing";
  if (["paid", "approved", "payment_approved", "processing", "in_production", "in_separation", "ready_for_shipping", "invoiced"].includes(yampiStatus)) localStatus = "processing";
  else if (["shipped", "sent"].includes(yampiStatus)) localStatus = "shipped";
  else if (["delivered"].includes(yampiStatus)) localStatus = "delivered";
  else if (["cancelled", "refused"].includes(yampiStatus)) localStatus = "cancelled";
  else if (["refunded"].includes(yampiStatus)) localStatus = "cancelled";
  else if (["pending", "waiting_payment"].includes(yampiStatus)) localStatus = "pending";

  const paymentStatusMap: Record<string, string> = {
    paid: "approved", approved: "approved", payment_approved: "approved",
    processing: "approved", in_production: "approved", in_separation: "approved",
    ready_for_shipping: "approved", invoiced: "approved",
    pending: "pending", waiting_payment: "pending",
    cancelled: "failed", refused: "failed", refunded: "refunded",
  };
  // --- Debug: log payload structure ---
  console.log("[yampi-sync] Yampi payload keys:", Object.keys(yampiOrder));
  console.log("[yampi-sync] transactions raw:", JSON.stringify(yampiOrder.transactions).slice(0, 800));
  console.log("[yampi-sync] items raw:", JSON.stringify(yampiOrder.items).slice(0, 800));
  console.log("[yampi-sync] shipping_option:", JSON.stringify(yampiOrder.shipping_option));
  console.log("[yampi-sync] shipments:", JSON.stringify(yampiOrder.shipments).slice(0, 500));

  const transactions = ((yampiOrder.transactions as Record<string, unknown>)?.data as unknown[]) || (yampiOrder.transactions as unknown[]) || [];
  const firstTx = (transactions[0] as Record<string, unknown>) || {};
  console.log("[yampi-sync] firstTx keys:", Object.keys(firstTx));
  const txStatus = (firstTx.status as string)?.toLowerCase() || yampiStatus;
  const paymentStatus = paymentStatusMap[txStatus] || paymentStatusMap[yampiStatus] || (localStatus === "pending" ? "pending" : localStatus === "cancelled" ? "failed" : "approved");

  const trackingCode = (yampiOrder.tracking_code as string) || null;

  // --- Expanded shipping method extraction ---
  const shipmentsData = ((yampiOrder.shipments as Record<string, unknown>)?.data as unknown[]) || [];
  const firstShipment = (shipmentsData[0] as Record<string, unknown>) || {};
  const shippingOption = (yampiOrder.shipping_option as Record<string, unknown>) || {};
  const shippingMethodName = (firstShipment.service_name as string) ||
    (firstShipment.name as string) ||
    (yampiOrder.shipping_option_name as string) ||
    (shippingOption.name as string) ||
    ((yampiOrder.delivery_option as Record<string, unknown>)?.name as string) ||
    (yampiOrder.shipping_method as string) ||
    null;
  console.log("[yampi-sync] Resolved shippingMethodName:", shippingMethodName);

  // --- Date parsing (handles Yampi object format {date, timezone_type, timezone}) ---
  const yampiOrderDateRaw = yampiOrder.created_at || yampiOrder.date || yampiOrder.order_date || yampiOrder.updated_at || null;
  let yampiCreatedAt: string | null = null;
  if (yampiOrderDateRaw) {
    let dateStr: string | null = null;
    if (typeof yampiOrderDateRaw === "object" && (yampiOrderDateRaw as Record<string, unknown>)?.date) {
      dateStr = (yampiOrderDateRaw as Record<string, unknown>).date as string;
    } else if (typeof yampiOrderDateRaw === "string") {
      dateStr = yampiOrderDateRaw;
    }
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) yampiCreatedAt = d.toISOString();
      else console.warn("[yampi-sync] Invalid date ignored:", dateStr);
    }
  }
  const yampiOrderNumber = (yampiOrder.number != null ? String(yampiOrder.number) : null) || (yampiOrder.order_number != null ? String(yampiOrder.order_number) : null) || null;

  // Fetch current order status to detect transitions
  const { data: currentOrder } = await supabase
    .from("orders")
    .select("status")
    .eq("id", order.id)
    .single();
  const oldStatus = currentOrder?.status;

  // If transitioning to cancelled, use RPC to restore stock
  if (localStatus === "cancelled" && oldStatus !== "cancelled") {
    const { data: rpcResult, error: rpcErr } = await supabase.rpc("cancel_order_return_stock", { p_order_id: order.id });
    if (rpcErr) {
      console.error("[yampi-sync] cancel_order_return_stock error:", rpcErr.message);
      return jsonRes({ ok: false, error: rpcErr.message || "Erro ao cancelar e devolver estoque" }, 500);
    }
    // Update remaining fields that RPC doesn't set
    await supabase.from("orders").update({
      payment_status: paymentStatus,
      tracking_code: trackingCode,
      shipping_method: shippingMethodName,
      yampi_created_at: yampiCreatedAt,
      yampi_order_number: yampiOrderNumber,
    }).eq("id", order.id);
  } else {
    // Extract transaction details (expanded fallbacks for Yampi nested structures)
    const txPaymentMethodObj = firstTx.payment_method || firstTx.payment;
    const txPaymentMethod = (typeof txPaymentMethodObj === "object" && txPaymentMethodObj !== null
      ? ((txPaymentMethodObj as Record<string, unknown>).name as string) || ((txPaymentMethodObj as Record<string, unknown>).label as string)
      : (txPaymentMethodObj as string))
      || (typeof yampiOrder.payment_method === "object" && yampiOrder.payment_method !== null
        ? ((yampiOrder.payment_method as Record<string, unknown>).name as string)
        : (yampiOrder.payment_method as string))
      || null;

    const txGatewayObj = firstTx.gateway;
    const txGateway = (typeof txGatewayObj === "object" && txGatewayObj !== null
      ? ((txGatewayObj as Record<string, unknown>).name as string)
      : (txGatewayObj as string))
      || (typeof yampiOrder.gateway === "object" && yampiOrder.gateway !== null
        ? ((yampiOrder.gateway as Record<string, unknown>).name as string)
        : (yampiOrder.gateway as string))
      || null;

    const txInstallments = firstTx.installments ? Number(firstTx.installments) : (yampiOrder.installments ? Number(yampiOrder.installments) : null);
    const txTransactionId = (firstTx.transaction_id as string) || (firstTx.tid as string) || (yampiOrder.transaction_id as string) || null;
    const txShippingCost = yampiOrder.value_shipment != null ? Number(yampiOrder.value_shipment) : (yampiOrder.shipping_cost != null ? Number(yampiOrder.shipping_cost) : null);

    console.log("[yampi-sync] Resolved payment_method:", txPaymentMethod, "| gateway:", txGateway, "| shipping_method:", shippingMethodName);

    // --- Extract customer data ---
    const customerRaw = yampiOrder.customer as Record<string, unknown> | undefined;
    const customer = (customerRaw?.data as Record<string, unknown>) || customerRaw || {};
    const customerName = (customer.name as string) || `${(customer.first_name as string) || ""} ${(customer.last_name as string) || ""}`.trim() || null;
    const customerEmail = (customer.email as string) || null;
    const customerCpf = (customer.cpf as string) || (customer.document as string) || null;
    const customerPhoneObj = customer.phone as Record<string, unknown> | string | undefined;
    const customerPhone = typeof customerPhoneObj === "string" ? customerPhoneObj : (customerPhoneObj?.full_number as string) || null;

    // --- Extract shipping address ---
    const shippingAddrRaw = yampiOrder.shipping_address as Record<string, unknown> | undefined;
    const shippingAddr = (shippingAddrRaw?.data as Record<string, unknown>) || shippingAddrRaw || (customer.address as Record<string, unknown>) || {};
    const shippingStreet = (shippingAddr.street as string) || (shippingAddr.address as string) || null;
    const shippingNumber = (shippingAddr.number as string) || "";
    const shippingComplement = (shippingAddr.complement as string) || "";
    const shippingNeighborhood = (shippingAddr.neighborhood as string) || "";
    const fullAddress = [shippingStreet, shippingNumber, shippingComplement, shippingNeighborhood].filter(Boolean).join(", ") || null;
    const shippingCity = (shippingAddr.city as string) || null;
    const shippingState = (shippingAddr.state as string) || (shippingAddr.uf as string) || null;
    const shippingZip = (shippingAddr.zipcode as string) || (shippingAddr.zip_code as string) || (shippingAddr.cep as string) || null;

    // --- Extract financial values ---
    const subtotal = yampiOrder.value_products != null ? Number(yampiOrder.value_products) : (yampiOrder.subtotal != null ? Number(yampiOrder.subtotal) : null);
    const totalAmount = yampiOrder.value_total != null ? Number(yampiOrder.value_total) : (yampiOrder.total != null ? Number(yampiOrder.total) : null);
    const discountAmount = yampiOrder.value_discount != null ? Number(yampiOrder.value_discount) : (yampiOrder.discount != null ? Number(yampiOrder.discount) : null);

    const updatePayload: Record<string, unknown> = {
      status: localStatus,
      payment_status: paymentStatus,
      tracking_code: trackingCode,
      shipping_method: shippingMethodName,
      yampi_created_at: yampiCreatedAt,
      yampi_order_number: yampiOrderNumber,
    };

    // Transaction fields (avoid overwriting with null)
    if (txPaymentMethod) updatePayload.payment_method = txPaymentMethod;
    if (txGateway) updatePayload.gateway = txGateway;
    if (txInstallments) updatePayload.installments = txInstallments;
    if (txTransactionId) updatePayload.transaction_id = txTransactionId;
    if (txShippingCost != null) updatePayload.shipping_cost = txShippingCost;

    // Customer fields
    if (customerEmail) updatePayload.customer_email = customerEmail;
    if (customerCpf) updatePayload.customer_cpf = customerCpf;

    // Shipping address fields
    if (customerName) updatePayload.shipping_name = customerName;
    if (fullAddress) updatePayload.shipping_address = fullAddress;
    if (shippingCity) updatePayload.shipping_city = shippingCity;
    if (shippingState) updatePayload.shipping_state = shippingState;
    if (shippingZip) updatePayload.shipping_zip = shippingZip;
    if (customerPhone) updatePayload.shipping_phone = customerPhone;

    // Financial fields
    if (subtotal != null && subtotal > 0) updatePayload.subtotal = subtotal;
    if (totalAmount != null && totalAmount > 0) updatePayload.total_amount = totalAmount;
    if (discountAmount != null) updatePayload.discount_amount = discountAmount;

    // Coupon
    const couponCode = (yampiOrder.coupon_code as string) || (yampiOrder.coupon as string) || null;
    if (couponCode) updatePayload.coupon_code = couponCode;

    const { error: updateErr } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", order.id);

    if (updateErr) {
      console.error("[yampi-sync] Update error:", updateErr?.message);
      return jsonRes({ ok: false, error: updateErr?.message || "Erro ao atualizar pedido" }, 500);
    }

    // --- Enrich order_items from Yampi items ---
    const yampiItemsRaw = yampiOrder.items as Record<string, unknown> | unknown[] | undefined;
    const yampiItems = (Array.isArray(yampiItemsRaw) ? yampiItemsRaw : (yampiItemsRaw?.data as unknown[])) || [];
    if (yampiItems.length > 0) {
      // Fetch existing order items
      const { data: existingItems } = await supabase
        .from("order_items")
        .select("id, yampi_sku_id, product_name")
        .eq("order_id", order.id);

      for (const rawItem of yampiItems) {
        const item = rawItem as Record<string, unknown>;
        const skuData = (item.sku as Record<string, unknown>)?.data as Record<string, unknown> || item.sku as Record<string, unknown> || {};
        const productData = (item.product as Record<string, unknown>)?.data as Record<string, unknown> || item.product as Record<string, unknown> || {};

        const yampiSkuId = item.sku_id ? Number(item.sku_id) : (skuData.id ? Number(skuData.id) : null);
        const productName = (productData.name as string) || (item.name as string) || (item.product_name as string) || null;
        const variantInfo = [skuData.size, skuData.color].filter(Boolean).join(" / ") ||
          (item.variant_name as string) || (skuData.title as string) || null;
        const skuSnapshot = (skuData.sku as string) || (item.sku as string) || null;
        const imageUrl = (skuData.image_url as string) ||
          ((productData.images as Record<string, unknown>)?.data as unknown[])?.[0] &&
          (((productData.images as Record<string, unknown>)?.data as Record<string, unknown>[])?.[0]?.url as string) ||
          (productData.image_url as string) || null;
        const unitPrice = item.price != null ? Number(item.price) : (item.unit_price != null ? Number(item.unit_price) : null);
        const qty = item.quantity ? Number(item.quantity) : 1;
        const totalPrice = item.total != null ? Number(item.total) : (unitPrice != null ? unitPrice * qty : null);

        // Match by yampi_sku_id first, then by position
        let matchedItem = existingItems?.find((ei) => ei.yampi_sku_id && yampiSkuId && ei.yampi_sku_id === yampiSkuId);

        const itemUpdate: Record<string, unknown> = {};
        if (productName) itemUpdate.product_name = productName;
        if (variantInfo) itemUpdate.variant_info = variantInfo;
        if (typeof skuSnapshot === "string" && skuSnapshot) itemUpdate.sku_snapshot = skuSnapshot;
        if (imageUrl) itemUpdate.image_snapshot = imageUrl;
        if (unitPrice != null) itemUpdate.unit_price = unitPrice;
        if (totalPrice != null) itemUpdate.total_price = totalPrice;
        if (qty) itemUpdate.quantity = qty;
        if (yampiSkuId) itemUpdate.yampi_sku_id = yampiSkuId;

        if (Object.keys(itemUpdate).length > 0 && matchedItem) {
          await supabase.from("order_items").update(itemUpdate).eq("id", matchedItem.id);
          console.log(`[yampi-sync] Updated order_item ${matchedItem.id} with Yampi data`);
        } else if (Object.keys(itemUpdate).length > 0 && !matchedItem && existingItems && existingItems.length === 0) {
          // No existing items - insert new ones
          await supabase.from("order_items").insert({
            order_id: order.id,
            product_name: productName || "Produto Yampi",
            quantity: qty,
            unit_price: unitPrice || 0,
            total_price: totalPrice || 0,
            variant_info: variantInfo,
            sku_snapshot: typeof skuSnapshot === "string" ? skuSnapshot : null,
            image_snapshot: imageUrl,
            yampi_sku_id: yampiSkuId,
          });
          console.log(`[yampi-sync] Inserted new order_item for sku_id ${yampiSkuId}`);
        }
      }
    }

    // --- Upsert payment record ---
    if (txTransactionId || txPaymentMethod) {
      const paymentData = {
        order_id: order.id,
        provider: "yampi",
        status: paymentStatus === "approved" ? "succeeded" : paymentStatus,
        payment_method: txPaymentMethod || null,
        gateway: txGateway || null,
        installments: txInstallments || 1,
        transaction_id: txTransactionId || null,
        amount: totalAmount || (subtotal || 0) + (txShippingCost || 0),
      };

      // Check if payment already exists for this order
      const { data: existingPayment } = await supabase
        .from("payments")
        .select("id")
        .eq("order_id", order.id)
        .eq("provider", "yampi")
        .maybeSingle();

      if (existingPayment) {
        await supabase.from("payments").update(paymentData).eq("id", existingPayment.id);
        console.log(`[yampi-sync] Updated payment ${existingPayment.id}`);
      } else {
        await supabase.from("payments").insert(paymentData);
        console.log(`[yampi-sync] Inserted new payment for order ${order.id}`);
      }
    }
  }

  console.log(`[yampi-sync] Order ${order.order_number} synced: status=${localStatus}, payment_status=${paymentStatus}`);
  return jsonRes({
    ok: true,
    order_id: order.id,
    order_number: order.order_number,
    status: localStatus,
    payment_status: paymentStatus,
    yampi_created_at: yampiCreatedAt,
    yampi_order_number: yampiOrderNumber,
  });
});
