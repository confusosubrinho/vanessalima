/**
 * yampi-import-order: Busca um pedido na API Yampi por número/ID e importa no banco local.
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
  const userToken2 = config?.user_token as string;
  const userSecretKey2 = config?.user_secret_key as string;

  if (!alias || !userToken2 || !userSecretKey2) {
    return jsonRes({ ok: false, error: "Credenciais Yampi incompletas (alias, user_token, user_secret_key)" }, 400);
  }

  // Support batch import (up to 10)
  const yampiOrderIds: string[] = [];
  if (Array.isArray(body.yampi_order_ids)) {
    for (const id of (body.yampi_order_ids as unknown[]).slice(0, 10)) {
      const s = String(id || "").trim();
      if (s) yampiOrderIds.push(s);
    }
  }
  const singleId = String(body.yampi_order_id || body.yampi_order_number || "").trim();
  if (singleId && !yampiOrderIds.includes(singleId)) yampiOrderIds.push(singleId);

  if (!yampiOrderIds.length) {
    return jsonRes({ ok: false, error: "Informe yampi_order_id, yampi_order_number ou yampi_order_ids[]" }, 400);
  }

  // If batch, process each and return results array
  if (yampiOrderIds.length > 1) {
    const results: Record<string, unknown>[] = [];
    for (const yid of yampiOrderIds) {
      try {
        const result = await importSingleOrder(supabase, yid, alias, userToken2, userSecretKey2);
        results.push(result);
      } catch (err: unknown) {
        results.push({ ok: false, yampi_order_id: yid, error: err instanceof Error ? err.message : "Erro" });
      }
    }
    return jsonRes({ ok: true, batch: true, results });
  }

  const yampiOrderId = yampiOrderIds[0];

  // ── Check if already imported (by external_reference or checkout_session_id) ──
  const { data: existingByRef } = await supabase
    .from("orders")
    .select("id, order_number")
    .eq("external_reference", yampiOrderId)
    .maybeSingle();

  if (existingByRef) {
    return jsonRes({ ok: false, error: `Pedido já importado: ${existingByRef.order_number}`, order_id: existingByRef.id, order_number: existingByRef.order_number }, 409);
  }

  // Also check checkout_session_id (pre-created by checkout-router)
  const { data: existingBySession } = await supabase
    .from("orders")
    .select("id, order_number")
    .eq("checkout_session_id", yampiOrderId)
    .maybeSingle();

  if (existingBySession) {
    return jsonRes({ ok: false, error: `Pedido já existe (pré-criado pelo checkout): ${existingBySession.order_number}`, order_id: existingBySession.id, order_number: existingBySession.order_number }, 409);
  }

  // ── Fetch from Yampi API ──
  const baseUrl = `https://api.dooki.com.br/v2/${alias}`;
  const searchUrl = `${baseUrl}/orders?include=items,customer,shipping_address,transactions&q=${encodeURIComponent(yampiOrderId)}&limit=5`;

  let yampiOrder: Record<string, unknown> | null = null;

  try {
    // Y44: Use fetchWithTimeout to prevent indefinite hangs
    const res = await fetchWithTimeout(searchUrl, {
      headers: {
        "User-Token": userToken2,
        "User-Secret-Key": userSecretKey2,
        Accept: "application/json",
      },
    }, 25_000);

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
  // Fix #3: Prioritize 'name' field over first_name/last_name (consistent with webhook and batch)
  const customerName = (customerData.name as string)?.trim()
    || ((customerData.first_name as string) ? `${(customerData.first_name as string).trim()} ${((customerData.last_name as string) || "").trim()}`.trim() : null)
    || "Cliente Yampi";
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
  if (["paid", "approved", "payment_approved", "processing", "in_production", "in_separation", "ready_for_shipping", "invoiced"].includes(yampiStatus)) localStatus = "processing";
  else if (["shipped", "sent"].includes(yampiStatus)) localStatus = "shipped";
  else if (["delivered"].includes(yampiStatus)) localStatus = "delivered";
  else if (["cancelled", "refused", "refunded"].includes(yampiStatus)) localStatus = "cancelled";
  else if (["pending", "waiting_payment"].includes(yampiStatus)) localStatus = "pending";

  const paymentStatusMap: Record<string, string> = {
    paid: "approved", approved: "approved", payment_approved: "approved",
    processing: "approved", in_production: "approved", in_separation: "approved",
    ready_for_shipping: "approved", invoiced: "approved",
    pending: "pending", waiting_payment: "pending",
    cancelled: "failed", refused: "failed", refunded: "refunded",
  };
  const txStatus = (firstTx.status as string)?.toLowerCase() || yampiStatus;
  const paymentStatus = paymentStatusMap[txStatus] || paymentStatusMap[yampiStatus] || (localStatus === "pending" ? "pending" : localStatus === "cancelled" ? "failed" : "approved");

  const yampiOrderDate = (yampiOrder.created_at as string) || (yampiOrder.date as string) || (yampiOrder.order_date as string) || (yampiOrder.updated_at as string) || null;
  const yampiCreatedAt = yampiOrderDate ? new Date(yampiOrderDate).toISOString() : null;

  // Y48: Extract coupon code from Yampi order
  const couponData = (yampiOrder.coupon as Record<string, unknown>) || {};
  const couponDataInner = (couponData.data as Record<string, unknown>) || couponData;
  const couponCode = (couponDataInner.code as string) || (yampiOrder.coupon_code as string) || null;

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
      coupon_code: couponCode,
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

  // Y48: Increment coupon uses_count if order had a coupon
  if (couponCode && localStatus !== "cancelled") {
    const { data: coupon } = await supabase
      .from("coupons")
      .select("id")
      .eq("code", couponCode.toUpperCase())
      .maybeSingle();
    if (coupon?.id) {
      await supabase.rpc("increment_coupon_uses", { p_coupon_id: coupon.id });
    }
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
    const isGenericName = (n: unknown): boolean => {
      if (!n || typeof n !== "string") return true;
      const lower = n.trim().toLowerCase();
      return lower === "produto" || lower === "produto yampi" || lower === "";
    };
    const rawImportName = (yampiItem.name as string) || (yampiItem.product_name as string) || (yampiProduct.name as string) || null;
    let itemName = isGenericName(rawImportName) ? "Produto" : rawImportName!;
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
      // Always prefer local product name (clean parent name) over Yampi variant title
      if (p?.name) productName = p.name;
    }
    // Only fall back to SKU title if no local product was found and name is still generic
    if (!productId && isGenericName(productName)) {
      const skuData = ((yampiItem.sku as Record<string, unknown>)?.data as Record<string, unknown>) || (yampiItem.sku as Record<string, unknown>) || {};
      const skuTitle = skuData.title as string;
      if (!isGenericName(skuTitle)) productName = skuTitle!;
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
      const stockResult = await supabase.rpc("decrement_stock", { p_variant_id: localVariant.id, p_quantity: quantity });
      const stockData = stockResult.data as { success: boolean; error?: string } | null;
      if (stockData && !stockData.success) {
        console.warn(`[yampi-import] decrement_stock failed for variant ${localVariant.id}: ${stockData.error} — skipping inventory_movement`);
      } else {
        await supabase.from("inventory_movements").insert({
          variant_id: localVariant.id,
          order_id: order.id,
          type: "debit",
          quantity,
        });
        itemsStockDebited += 1;
      }
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

  // Y28: Insert email automation log for single-order import
  if (customerEmail && ["processing", "shipped", "delivered"].includes(localStatus)) {
    const { data: activeAutomation } = await supabase.from("email_automations")
      .select("id").eq("trigger_event", "order_confirmed").eq("is_active", true).limit(1).maybeSingle();
    await supabase.from("email_automation_logs").insert({
      recipient_email: customerEmail,
      recipient_name: customerName,
      status: "pending",
      automation_id: activeAutomation?.id || null,
    });
  }

  // Y29: Insert order_event for traceability
  await supabase.from("order_events").insert({
    order_id: order.id,
    event_type: "yampi_imported",
    event_hash: `import-single-${yId}-${order.id}`,
    payload: { yampi_order_id: yId, yampi_order_number: yampiOrderNumber, source: "single" },
  });

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

// ── Helper for batch import ──
async function importSingleOrder(
  supabase: ReturnType<typeof createClient>,
  yampiOrderId: string,
  alias: string,
  userToken: string,
  userSecretKey: string,
): Promise<Record<string, unknown>> {
  // Check duplicates
  const { data: existingByRef } = await supabase.from("orders").select("id, order_number").eq("external_reference", yampiOrderId).maybeSingle();
  if (existingByRef) return { ok: false, yampi_order_id: yampiOrderId, error: `Já importado: ${existingByRef.order_number}`, order_id: existingByRef.id };

  const { data: existingBySession } = await supabase.from("orders").select("id, order_number").eq("checkout_session_id", yampiOrderId).maybeSingle();
  if (existingBySession) return { ok: false, yampi_order_id: yampiOrderId, error: `Já existe (checkout): ${existingBySession.order_number}`, order_id: existingBySession.id };

  const baseUrl = `https://api.dooki.com.br/v2/${alias}`;
  // Y44: Use fetchWithTimeout for batch import to prevent indefinite hangs
  const res = await fetchWithTimeout(`${baseUrl}/orders?include=items,customer,shipping_address,transactions&q=${encodeURIComponent(yampiOrderId)}&limit=5`, {
    headers: { "User-Token": userToken, "User-Secret-Key": userSecretKey, Accept: "application/json" },
  }, 25_000);
  if (!res.ok) return { ok: false, yampi_order_id: yampiOrderId, error: `Yampi API ${res.status}` };

  const json = await res.json();
  const orders = json?.data || [];
  const yampiOrder = orders.find((o: Record<string, unknown>) => String(o.id) === yampiOrderId || String(o.number) === yampiOrderId) || orders[0] || null;
  if (!yampiOrder) return { ok: false, yampi_order_id: yampiOrderId, error: "Não encontrado na Yampi" };

  const yId = String(yampiOrder.id || yampiOrderId);
  const yampiOrderNumber = yampiOrder.number != null ? String(yampiOrder.number) : null;
  const customer = (yampiOrder.customer as Record<string, unknown>) || {};
  const customerData = (customer.data as Record<string, unknown>) || customer;
  const customerEmail = (customerData.email as string) || null;
  const customerName = (customerData.name as string)
    || ((customerData.first_name as string) ? `${customerData.first_name} ${customerData.last_name || ""}`.trim() : null)
    || "Cliente Yampi";
  const customerPhone = ((customerData.phone as Record<string, unknown>)?.full_number as string) || (customerData.phone as string) || null;
  const customerCpf = (customerData.cpf as string) || (customerData.cnpj as string) || null;

  const shippingAddr = (yampiOrder.shipping_address as Record<string, unknown>) || {};
  const addr = (shippingAddr.data as Record<string, unknown>) || shippingAddr;
  const street = String(addr.street || addr.address || addr.address_line1 || addr.line1 || "").trim();
  const number = String(addr.number || addr.address_number || "").trim();
  const neighborhood = String(addr.neighborhood || addr.district || addr.bairro || "").trim();
  const complement = String(addr.complement || addr.address_line2 || addr.line2 || "").trim();
  const city = String(addr.city || addr.city_name || shippingAddr.city || "").trim();
  const state = String(addr.state || addr.state_short || addr.uf || shippingAddr.state || "").trim();
  const zip = String(addr.zipcode || addr.zip || addr.postal_code || shippingAddr.zipcode || shippingAddr.zip || "").trim();

  const shippingCost = Number(yampiOrder.value_shipment || yampiOrder.shipping_cost || 0);
  const discountAmount = Number(yampiOrder.value_discount || yampiOrder.discount || 0);
  const totalAmount = Number(yampiOrder.value_total || yampiOrder.total || 0);
  let subtotal = totalAmount - shippingCost + discountAmount;
  if (subtotal <= 0) subtotal = totalAmount;

  const yampiStatus = String((yampiOrder.status as any)?.data?.alias || yampiOrder.status_alias || yampiOrder.status || "");
  let localStatus = "processing";
  if (["paid", "approved", "payment_approved", "processing", "in_production", "in_separation", "ready_for_shipping", "invoiced"].includes(yampiStatus)) localStatus = "processing";
  else if (["shipped", "sent"].includes(yampiStatus)) localStatus = "shipped";
  else if (["delivered"].includes(yampiStatus)) localStatus = "delivered";
  else if (["cancelled", "refused", "refunded"].includes(yampiStatus)) localStatus = "cancelled";
  else if (["pending", "waiting_payment"].includes(yampiStatus)) localStatus = "pending";

  const transactions = ((yampiOrder.transactions as Record<string, unknown>)?.data as unknown[]) || (yampiOrder.transactions as unknown[]) || [];
  const firstTx = (transactions[0] as Record<string, unknown>) || {};
  const paymentMethod = (firstTx.payment_method as string) || (yampiOrder.payment_method as string) || null;
  const gateway = (firstTx.gateway as string) || (yampiOrder.gateway as string) || null;
  const installments = Number(firstTx.installments || yampiOrder.installments || 1);
  const transactionId = (firstTx.transaction_id as string) || (yampiOrder.transaction_id as string) || null;

  // Y48: Extract coupon code from Yampi order (batch)
  const couponData = (yampiOrder.coupon as Record<string, unknown>) || {};
  const couponDataInner = (couponData.data as Record<string, unknown>) || couponData;
  const couponCode = (couponDataInner.code as string) || (yampiOrder.coupon_code as string) || null;

  const { data: order, error: orderErr } = await supabase.from("orders").insert({
    order_number: "TEMP", subtotal, total_amount: totalAmount, shipping_cost: shippingCost, discount_amount: discountAmount,
    shipping_name: customerName,
    shipping_address: [street, number].filter(Boolean).join(", ") + (neighborhood ? ` - ${neighborhood}` : "") + (complement ? ` - ${complement}` : "") || street,
    shipping_city: city, shipping_state: state, shipping_zip: zip,
    shipping_phone: customerPhone, customer_email: customerEmail, customer_cpf: customerCpf,
    provider: "yampi", gateway, payment_method: paymentMethod, installments, transaction_id: transactionId,
    status: localStatus, external_reference: yId, yampi_order_number: yampiOrderNumber,
    payment_status: yampiStatus === "refunded" ? "refunded" : (localStatus === "cancelled" ? "failed" : (localStatus === "pending" ? "pending" : "approved")),
    tracking_code: (yampiOrder.tracking_code as string) || null,
    shipping_method: (yampiOrder.shipping_option_name as string) || ((yampiOrder.shipping_option as Record<string, unknown>)?.name as string) || (((yampiOrder.shipping_option as Record<string, unknown>)?.data as Record<string, unknown>)?.name as string) || ((yampiOrder.delivery_option as Record<string, unknown>)?.name as string) || null,
    yampi_created_at: (yampiOrder.created_at as string) ? new Date(yampiOrder.created_at as string).toISOString() : null,
    coupon_code: couponCode,
    notes: `Importado batch da Yampi (ID ${yId})`,
  } as Record<string, unknown>).select("id, order_number").single();

  if (orderErr || !order) return { ok: false, yampi_order_id: yampiOrderId, error: orderErr?.message || "Erro insert" };

  // Y48: Increment coupon uses_count if order had a coupon (batch)
  if (couponCode && localStatus !== "cancelled") {
    const { data: coupon } = await supabase
      .from("coupons")
      .select("id")
      .eq("code", couponCode.toUpperCase())
      .maybeSingle();
    if (coupon?.id) {
      await supabase.rpc("increment_coupon_uses", { p_coupon_id: coupon.id });
    }
  }

  // Insert items
  const yampiItems = ((yampiOrder.items as Record<string, unknown>)?.data as unknown[]) || (yampiOrder.items as unknown[]) || [];
  for (const rawItem of yampiItems) {
    const item = rawItem as Record<string, unknown>;
    const quantity = Number(item.quantity || 1);
    const unitPrice = Number(item.price || item.price_sale || 0);
    const itemName = (item.name as string) || "Produto";
    const skuId = item.sku_id != null ? Number(item.sku_id) : null;

    let localVariant: Record<string, unknown> | null = null;
    if (skuId) {
      const { data: v } = await supabase.from("product_variants").select("id, product_id, size, color, sku").eq("yampi_sku_id", skuId).maybeSingle();
      localVariant = v;
    }
    // Fallback: match by SKU code
    const itemSku = (item.sku as string) || (item.sku_code as string) || (item.code as string) || ((item.sku as Record<string, unknown>)?.sku as string) || null;
    if (!localVariant && itemSku && String(itemSku).trim()) {
      const { data: v } = await supabase.from("product_variants").select("id, product_id, size, color, sku").eq("sku", String(itemSku).trim()).maybeSingle();
      localVariant = v;
    }

    // Resolve product name and image for snapshots
    let productName = itemName;
    let productId = (localVariant?.product_id as string) || null;
    if (productId) {
      const { data: p } = await supabase.from("products").select("name").eq("id", productId).maybeSingle();
      if (p) productName = p.name;
    }

    let imageSnapshot: string | null = null;
    const yampiItemImage = (item.image as Record<string, unknown>) || ((item.product as Record<string, unknown>)?.image as Record<string, unknown>) || {};
    const itemImageUrl = (yampiItemImage.url as string) || (yampiItemImage.src as string) || (item.image_url as string) || null;
    if (productId) {
      const { data: img } = await supabase.from("product_images").select("url").eq("product_id", productId).eq("is_primary", true).limit(1).maybeSingle();
      imageSnapshot = img?.url || null;
    }
    if (!imageSnapshot && itemImageUrl) imageSnapshot = itemImageUrl;

    const variantDisplay = localVariant ? [localVariant.size, localVariant.color].filter(Boolean).join(" / ") : "";
    const skuDisplay = itemSku || (localVariant?.sku as string) || "";
    const variantInfo = [variantDisplay, skuDisplay].filter(Boolean).join(" • ") || (itemSku || null);

    await supabase.from("order_items").insert({
      order_id: order.id, product_id: productId,
      product_variant_id: (localVariant?.id as string) || null, product_name: productName,
      variant_info: variantInfo,
      quantity, unit_price: unitPrice, total_price: unitPrice * quantity,
      title_snapshot: productName,
      image_snapshot: imageSnapshot,
      sku_snapshot: itemSku || (localVariant?.sku as string) || null,
      yampi_sku_id: skuId,
    });

    if (localVariant?.id && localStatus !== "cancelled") {
      const stockResult = await supabase.rpc("decrement_stock", { p_variant_id: localVariant.id, p_quantity: quantity });
      const stockData = stockResult.data as { success: boolean; error?: string } | null;
      if (stockData && !stockData.success) {
        console.warn(`[yampi-import-batch] decrement_stock failed for variant ${localVariant.id}: ${stockData.error} — skipping inventory_movement`);
      } else {
        await supabase.from("inventory_movements").insert({ variant_id: localVariant.id, order_id: order.id, type: "debit", quantity });
      }
    }
  }

  if (["processing", "shipped", "delivered"].includes(localStatus)) {
    await supabase.from("payments").insert({ order_id: order.id, provider: "yampi", status: "approved", payment_method: paymentMethod, gateway, transaction_id: transactionId, installments, amount: totalAmount });
  }

  if (customerEmail) {
    const { data: existingCustomer } = await supabase.from("customers").select("id, total_orders, total_spent").eq("email", customerEmail).maybeSingle();
    if (existingCustomer) {
      await supabase.from("customers").update({ full_name: customerName, phone: customerPhone, total_orders: (existingCustomer.total_orders || 0) + 1, total_spent: (existingCustomer.total_spent || 0) + totalAmount }).eq("id", existingCustomer.id);
    } else {
      await supabase.from("customers").insert({ email: customerEmail, full_name: customerName, phone: customerPhone, total_orders: 1, total_spent: totalAmount });
    }
  }

  // Y28: Insert email automation log for batch-imported orders
  if (customerEmail && ["processing", "shipped", "delivered"].includes(localStatus)) {
    const { data: activeAutomation } = await supabase.from("email_automations")
      .select("id").eq("trigger_event", "order_confirmed").eq("is_active", true).limit(1).maybeSingle();
    await supabase.from("email_automation_logs").insert({
      recipient_email: customerEmail,
      recipient_name: customerName,
      status: "pending",
      automation_id: activeAutomation?.id || null,
    });
  }

  // Y29: Insert order_event for traceability
  await supabase.from("order_events").insert({
    order_id: order.id,
    event_type: "yampi_imported",
    event_hash: `import-batch-${yId}-${order.id}`,
    payload: { yampi_order_id: yId, yampi_order_number: yampiOrderNumber, source: "batch" },
  });

  return { ok: true, yampi_order_id: yampiOrderId, order_id: order.id, order_number: order.order_number, status: localStatus };
}
