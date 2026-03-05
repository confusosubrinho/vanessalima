/**
 * yampi-import-order: Busca um pedido na API Yampi por número/ID e importa no banco local.
 * Requer autenticação de admin (JWT).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  // ── Auth: require admin ──
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

  // ── Parse body ──
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonRes({ ok: false, error: "JSON inválido" }, 400);
  }

  const yampiOrderId = String(body.yampi_order_id || body.yampi_order_number || "").trim();
  if (!yampiOrderId) {
    return jsonRes({ ok: false, error: "Informe yampi_order_id ou yampi_order_number" }, 400);
  }

  // ── Load Yampi credentials from integrations_checkout_providers ──
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
    return jsonRes({ ok: false, error: "Credenciais Yampi incompletas (alias, user_token, user_secret_key)" }, 400);
  }

  // ── Check if already imported ──
  const { data: existing } = await supabase
    .from("orders")
    .select("id, order_number")
    .eq("external_reference", yampiOrderId)
    .maybeSingle();

  if (existing) {
    return jsonRes({ ok: false, error: `Pedido já importado: ${existing.order_number}`, order_id: existing.id, order_number: existing.order_number }, 409);
  }

  // ── Fetch from Yampi API ──
  const baseUrl = `https://api.dooki.com.br/v2/${alias}`;
  const searchUrl = `${baseUrl}/orders?include=items,customer,shipping_address,transactions&q=${encodeURIComponent(yampiOrderId)}&limit=5`;

  let yampiOrder: Record<string, unknown> | null = null;

  try {
    const res = await fetch(searchUrl, {
      headers: {
        "User-Token": userToken,
        "User-Secret-Key": userSecretKey,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[yampi-import] API error:", res.status, errText);
      return jsonRes({ ok: false, error: `Yampi API retornou ${res.status}` }, 502);
    }

    const json = await res.json();
    const orders = json?.data || [];

    // Match by ID or number
    yampiOrder = orders.find((o: Record<string, unknown>) =>
      String(o.id) === yampiOrderId || String(o.number) === yampiOrderId
    ) || orders[0] || null;
  } catch (err) {
    console.error("[yampi-import] Fetch error:", err);
    return jsonRes({ ok: false, error: "Erro ao conectar com a API Yampi" }, 502);
  }

  if (!yampiOrder) {
    return jsonRes({ ok: false, error: `Pedido ${yampiOrderId} não encontrado na Yampi` }, 404);
  }

  // ── Normalize Yampi data ──
  const yId = String(yampiOrder.id || yampiOrderId);
  const yampiOrderNumber = (yampiOrder.number != null ? String(yampiOrder.number) : null) || (yampiOrder.order_number != null ? String(yampiOrder.order_number) : null) || null;
  const customer = (yampiOrder.customer as Record<string, unknown>) || {};
  const customerData = (customer.data as Record<string, unknown>) || customer;
  const customerEmail = (customerData.email as string) || null;
  const firstName = (customerData.first_name as string) || "";
  const lastName = (customerData.last_name as string) || "";
  const customerName = `${firstName} ${lastName}`.trim() || "Cliente Yampi";
  const customerPhone = ((customerData.phone as Record<string, unknown>)?.full_number as string) || (customerData.phone as string) || null;
  const customerCpf = (customerData.cpf as string) || (customerData.cnpj as string) || null;

  const shippingAddr = (yampiOrder.shipping_address as Record<string, unknown>) ||
    ((yampiOrder.shipping_address as Record<string, unknown>)?.data as Record<string, unknown>) || {};
  const addr = (shippingAddr.data as Record<string, unknown>) || shippingAddr;
  const street = String(addr.street || addr.address || addr.address_line1 || addr.line1 || "").trim();
  const number = String(addr.number || addr.address_number || "").trim();
  const neighborhood = String(addr.neighborhood || addr.district || addr.bairro || "").trim();
  const complement = String(addr.complement || addr.address_line2 || addr.line2 || "").trim();
  const city = String(addr.city || addr.city_name || shippingAddr.city || "").trim();
  const state = String(addr.state || addr.state_short || addr.uf || shippingAddr.state || "").trim();
  const zip = String(addr.zipcode || addr.zip || addr.postal_code || shippingAddr.zipcode || shippingAddr.zip || "").trim();
  const addressParts = [street, number].filter(Boolean);
  const shippingAddressLine = addressParts.length ? addressParts.join(", ") + (neighborhood ? ` - ${neighborhood}` : "") + (complement ? ` - ${complement}` : "") : (street || (shippingAddr.street as string) || (shippingAddr.address as string) || "");

  const shippingCost = Number(yampiOrder.value_shipment || yampiOrder.shipping_cost || 0);
  const discountAmount = Number(yampiOrder.value_discount || yampiOrder.discount || 0);
  const totalAmount = Number(yampiOrder.value_total || yampiOrder.total || 0);
  let subtotal = totalAmount - shippingCost + discountAmount;
  if (subtotal <= 0) subtotal = totalAmount;

  const yampiItems = ((yampiOrder.items as Record<string, unknown>)?.data as unknown[]) ||
    (yampiOrder.items as unknown[]) || [];

  // Helper: extrai o ID do SKU do item (API pode vir em sku_id, sku.id, product.sku_id, etc.)
  function getSkuIdFromYampiItem(item: Record<string, unknown>): number | null {
    const raw =
      item.sku_id ??
      (item.sku as Record<string, unknown>)?.id ??
      (item.product as Record<string, unknown>)?.sku_id ??
      ((item.product as Record<string, unknown>)?.skus as Record<string, unknown>[])?.[0]?.id ??
      item.id;
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  }

  const transactions = ((yampiOrder.transactions as Record<string, unknown>)?.data as unknown[]) ||
    (yampiOrder.transactions as unknown[]) || [];
  const firstTx = (transactions[0] as Record<string, unknown>) || {};
  const paymentMethod =
    (firstTx.payment_method as string) ||
    (firstTx.payment_method_name as string) ||
    (firstTx.method as string) ||
    (firstTx.type as string) ||
    (yampiOrder.payment_method as string) ||
    (yampiOrder.payment_method_name as string) ||
    null;
  const gateway = (firstTx.gateway as string) || (yampiOrder.gateway as string) || null;
  const installments = Number(firstTx.installments || yampiOrder.installments || 1);
  const transactionId = (firstTx.transaction_id as string) || (yampiOrder.transaction_id as string) || null;
  const trackingCode = (yampiOrder.tracking_code as string) || null;

  const shippingOption = (yampiOrder.shipping_option as Record<string, unknown>) || {};
  const shippingOptionData = (shippingOption.data as Record<string, unknown>) || shippingOption;
  const shippingMethodName =
    (yampiOrder.shipping_option_name as string) ||
    (shippingOption.name as string) ||
    (shippingOptionData.name as string) ||
    ((yampiOrder.delivery_option as Record<string, unknown>)?.name as string) ||
    (yampiOrder.shipping_method as string) ||
    (yampiOrder.delivery_method as string) ||
    (yampiOrder.shipping_option_name as string) ||
    null;

  // Map yampi status to local status
  const yampiStatus = String((yampiOrder.status as any)?.data?.alias || yampiOrder.status_alias || yampiOrder.status || "");
  let localStatus: string = "processing";
  if (["paid", "approved", "payment_approved"].includes(yampiStatus)) localStatus = "processing";
  else if (["shipped", "sent"].includes(yampiStatus)) localStatus = "shipped";
  else if (["delivered"].includes(yampiStatus)) localStatus = "delivered";
  else if (["cancelled", "refused", "refunded"].includes(yampiStatus)) localStatus = "cancelled";
  else if (["pending", "waiting_payment"].includes(yampiStatus)) localStatus = "pending";

  const paymentStatusMap: Record<string, string> = {
    paid: "approved", approved: "approved", payment_approved: "approved",
    pending: "pending", waiting_payment: "pending",
    cancelled: "failed", refused: "failed", refunded: "refunded",
  };
  const txStatus = (firstTx.status as string)?.toLowerCase() || yampiStatus;
  const paymentStatus = paymentStatusMap[txStatus] || paymentStatusMap[yampiStatus] || (localStatus === "pending" ? "pending" : localStatus === "cancelled" ? "failed" : "approved");

  const yampiOrderDate = (yampiOrder.created_at as string) || (yampiOrder.date as string) || (yampiOrder.order_date as string) || (yampiOrder.updated_at as string) || null;
  const yampiCreatedAt = yampiOrderDate ? new Date(yampiOrderDate).toISOString() : null;

  // ── Create order ──
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      order_number: "TEMP",
      subtotal,
      total_amount: totalAmount,
      shipping_cost: shippingCost,
      discount_amount: discountAmount,
      shipping_name: customerName,
      shipping_address: shippingAddressLine,
      shipping_city: city,
      shipping_state: state,
      shipping_zip: zip,
      shipping_phone: customerPhone,
      customer_email: customerEmail,
      customer_cpf: customerCpf,
      provider: "yampi",
      gateway,
      payment_method: paymentMethod,
      installments,
      transaction_id: transactionId,
      tracking_code: trackingCode,
      shipping_method: shippingMethodName,
      payment_status: paymentStatus,
      status: localStatus,
      external_reference: yId,
      yampi_created_at: yampiCreatedAt,
      yampi_order_number: yampiOrderNumber,
      notes: yampiOrderNumber
        ? `Importado da Yampi (Nº ${yampiOrderNumber}, ID ${yId})`
        : `Importado manualmente da Yampi (ID ${yId})`,
    } as Record<string, unknown>)
    .select("id, order_number")
    .single();

  if (orderErr || !order) {
    console.error("[yampi-import] Insert error:", orderErr?.message);
    return jsonRes({ ok: false, error: orderErr?.message || "Erro ao criar pedido" }, 500);
  }

  // ── Insert items + debit stock ──
  let itemsMatched = 0;
  let itemsWithoutMatch = 0;
  let itemsStockDebited = 0;

  for (const rawItem of yampiItems) {
    const yampiItem = rawItem as Record<string, unknown>;
    const skuId = getSkuIdFromYampiItem(yampiItem);
    const quantity = Number(yampiItem.quantity || 1);
    const unitPrice = Number(yampiItem.price || yampiItem.price_sale || yampiItem.unit_price || 0);
    const yampiProduct = (yampiItem.product as Record<string, unknown>) || {};
    const itemName = (yampiItem.name as string) || (yampiItem.product_name as string) || (yampiProduct.name as string) || "Produto";
    const itemSku = (yampiItem.sku as string) || (yampiItem.sku_code as string) || (yampiItem.code as string) || ((yampiItem.sku as Record<string, unknown>)?.sku as string) || null;
    const yampiItemImage = (yampiItem.image as Record<string, unknown>) || (yampiProduct.image as Record<string, unknown>) || {};
    const itemImageUrl = (yampiItemImage.url as string) || (yampiItemImage.src as string) || (yampiItem.image_url as string) || null;

    let localVariant: Record<string, unknown> | null = null;
    if (skuId != null) {
      const { data: v } = await supabase
        .from("product_variants")
        .select("id, product_id, size, color, sku")
        .eq("yampi_sku_id", skuId)
        .maybeSingle();
      localVariant = v;
    }
    // Fallback: vincular pelo código SKU quando não houver yampi_sku_id na variante
    if (!localVariant && itemSku && String(itemSku).trim()) {
      const { data: v } = await supabase
        .from("product_variants")
        .select("id, product_id, size, color, sku")
        .eq("sku", String(itemSku).trim())
        .maybeSingle();
      localVariant = v;
    }

    if (localVariant) itemsMatched += 1;
    else itemsWithoutMatch += 1;

    let productName = itemName;
    let productId = (localVariant?.product_id as string) || null;
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
    const variantInfo = [variantDisplay, skuDisplay].filter(Boolean).join(" • ") || (itemSku || null);

    await supabase.from("order_items").insert({
      order_id: order.id,
      product_id: productId,
      product_variant_id: (localVariant?.id as string) || null,
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

    if (localVariant?.id && localStatus !== "cancelled") {
      await supabase.rpc("decrement_stock", { p_variant_id: localVariant.id, p_quantity: quantity });
      await supabase.from("inventory_movements").insert({
        variant_id: localVariant.id,
        order_id: order.id,
        type: "debit",
        quantity,
      });
      itemsStockDebited += 1;
    }
  }

  // ── Insert payment record ──
  if (["processing", "shipped", "delivered"].includes(localStatus)) {
    await supabase.from("payments").insert({
      order_id: order.id,
      provider: "yampi",
      status: "approved",
      payment_method: paymentMethod,
      gateway,
      transaction_id: transactionId,
      installments,
      amount: totalAmount,
    });
  }

  // ── Upsert customer ──
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

  console.log(`[yampi-import] Order imported: ${order.id} (${order.order_number}) from Yampi ID ${yId}`);

  return jsonRes({
    ok: true,
    order_id: order.id,
    order_number: order.order_number,
    status: localStatus,
    items_count: yampiItems.length,
    items_matched: itemsMatched,
    items_without_match: itemsWithoutMatch,
    items_stock_debited: itemsStockDebited,
  });
});
