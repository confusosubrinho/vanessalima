import { fetchWithTimeout } from "./fetchWithTimeout.ts";
import { getValidTokenSafe } from "./blingTokenRefresh.ts";

const BLING_API_URL = "https://api.bling.com.br/Api/v3";

function blingHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Accept: "application/json" };
}

/**
 * Tenta criar o pedido automaticamente no Bling após pagamento confirmado.
 * O Bling decrementa o estoque automaticamente ao receber o pedido de venda.
 * 
 * Retorna { success, bling_order_id } ou { success: false, error }.
 * Nunca lança exceção — falhas são logadas e retornadas como resultado.
 */
export async function autoPushOrderToBling(
  supabase: any,
  orderId: string
): Promise<{ success: boolean; bling_order_id?: number; error?: string; skipped?: boolean }> {
  try {
    // Check if Bling is configured
    const { data: settings } = await supabase
      .from("store_settings")
      .select("bling_access_token, bling_refresh_token")
      .limit(1)
      .maybeSingle();

    if (!settings?.bling_access_token) {
      return { success: false, skipped: true, error: "Bling não configurado" };
    }

    // Check if order already has bling_order_id
    const { data: order } = await supabase
      .from("orders")
      .select("id, notes, order_number, shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip, shipping_cost, total_amount, created_at, customer_cpf")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) return { success: false, error: "Pedido não encontrado" };

    // Check duplicate: already sent to Bling
    if (order.notes?.includes("bling_order_id:")) {
      const existingId = order.notes.match(/bling_order_id:(\d+)/)?.[1];
      console.log(`[bling-auto] Order ${orderId} already has bling_order_id:${existingId}, skipping`);
      return { success: true, bling_order_id: Number(existingId), skipped: true };
    }

    // Get token
    let token: string;
    try {
      token = await getValidTokenSafe(supabase);
    } catch (err: any) {
      console.warn(`[bling-auto] Token error for order ${orderId}: ${err.message}`);
      return { success: false, error: `Token error: ${err.message}` };
    }

    // Build order items — use variant SKU when available for correct Bling stock decrement
    const { data: orderItems } = await supabase
      .from("order_items")
      .select("product_name, quantity, unit_price, product_id, product_variant_id")
      .eq("order_id", orderId);

    const itens = [];
    for (const item of (orderItems || [])) {
      let codigo = item.product_id?.substring(0, 8) || "PROD";
      // Priority: variant SKU > product SKU > fallback
      if (item.product_variant_id) {
        const { data: variant } = await supabase
          .from("product_variants")
          .select("sku")
          .eq("id", item.product_variant_id)
          .maybeSingle();
        if (variant?.sku) codigo = variant.sku;
        else if (item.product_id) {
          const { data: prod } = await supabase.from("products").select("sku").eq("id", item.product_id).maybeSingle();
          if (prod?.sku) codigo = prod.sku;
        }
      } else if (item.product_id) {
        const { data: prod } = await supabase.from("products").select("sku").eq("id", item.product_id).maybeSingle();
        if (prod?.sku) codigo = prod.sku;
      }
      itens.push({
        descricao: item.product_name,
        quantidade: item.quantity,
        valor: item.unit_price,
        codigo,
      });
    }

    if (itens.length === 0) {
      return { success: false, error: "Pedido sem itens" };
    }

    const cpfMatch = order.customer_cpf || order.notes?.match(/CPF:\s*([\d.\-]+)/)?.[1] || "";
    const cpf = cpfMatch.replace(/\D/g, "");

    const blingOrder = {
      numero: 0,
      data: new Date(order.created_at).toISOString().split("T")[0],
      dataSaida: new Date().toISOString().split("T")[0],
      contato: {
        nome: order.shipping_name,
        tipoPessoa: "F",
        numeroDocumento: cpf,
        contribuinte: 9,
      },
      itens,
      transporte: {
        fretePorConta: 0,
        frete: order.shipping_cost || 0,
        volumes: [{ servico: "Transportadora" }],
        contato: { nome: order.shipping_name },
        etiqueta: {
          nome: order.shipping_name,
          endereco: order.shipping_address,
          municipio: order.shipping_city,
          uf: order.shipping_state,
          cep: order.shipping_zip?.replace(/\D/g, ""),
        },
      },
      parcelas: [{
        valor: order.total_amount,
        dataVencimento: new Date().toISOString().split("T")[0],
        observacao: "Pagamento online",
      }],
      observacoes: `Pedido ${order.order_number} - Loja Online`,
      observacoesInternas: order.notes || "",
      numeroPedidoCompra: order.order_number,
    };

    const response = await fetchWithTimeout(`${BLING_API_URL}/pedidos/vendas`, {
      method: "POST",
      headers: blingHeaders(token),
      body: JSON.stringify(blingOrder),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = `Bling API error [${response.status}]: ${JSON.stringify(data).substring(0, 300)}`;
      console.error(`[bling-auto] ${errMsg}`);
      // Log but don't fail the webhook
      return { success: false, error: errMsg };
    }

    const blingOrderId = data?.data?.id;

    // Save bling_order_id to order notes
    if (blingOrderId) {
      const existingNotes = order.notes || "";
      await supabase.from("orders").update({
        notes: `${existingNotes} | bling_order_id:${blingOrderId}`.trim(),
      }).eq("id", orderId);
      console.log(`[bling-auto] Order ${orderId} → Bling order ${blingOrderId} created successfully`);
    }

    return { success: true, bling_order_id: blingOrderId };
  } catch (err: any) {
    console.error(`[bling-auto] Unexpected error for order ${orderId}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Cancela um pedido no Bling via API.
 * Se não tiver bling_order_id, tenta ajustar o estoque diretamente.
 */
export async function cancelBlingOrder(
  supabase: any,
  orderId: string
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  try {
    const { data: settings } = await supabase
      .from("store_settings")
      .select("bling_access_token")
      .limit(1)
      .maybeSingle();

    if (!settings?.bling_access_token) {
      return { success: false, skipped: true, error: "Bling não configurado" };
    }

    const { data: order } = await supabase
      .from("orders")
      .select("id, notes")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) return { success: false, error: "Pedido não encontrado" };

    const blingOrderIdMatch = order.notes?.match(/bling_order_id:(\d+)/);
    if (!blingOrderIdMatch) {
      console.log(`[bling-auto] Order ${orderId} has no bling_order_id, skipping cancel`);
      return { success: false, skipped: true, error: "Sem bling_order_id" };
    }

    const blingOrderId = blingOrderIdMatch[1];

    let token: string;
    try {
      token = await getValidTokenSafe(supabase);
    } catch (err: any) {
      return { success: false, error: `Token error: ${err.message}` };
    }

    // Cancel order in Bling via PATCH with situação 12 (cancelado) — Bling v3 API
    const response = await fetchWithTimeout(
      `${BLING_API_URL}/pedidos/vendas/${blingOrderId}`,
      { method: "PATCH", headers: blingHeaders(token), body: JSON.stringify({ situacao: { valor: 12 } }) }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const errMsg = `Bling cancel error [${response.status}]: ${JSON.stringify(data).substring(0, 200)}`;
      console.warn(`[bling-auto] ${errMsg}`);
      return { success: false, error: errMsg };
    }

    // Consume response body and log result
    const cancelData = await response.json().catch(() => ({}));
    console.log(`[bling-auto] Bling order ${blingOrderId} cancelled for order ${orderId}`, JSON.stringify(cancelData).substring(0, 200));
    return { success: true };
  } catch (err: any) {
    console.error(`[bling-auto] Cancel error for order ${orderId}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Verifica se há movimentações de estoque recentes (últimos N minutos) para um variant.
 * Usado para proteger contra sobrescrita de estoque local por sync do Bling.
 */
export async function hasRecentLocalMovements(
  supabase: any,
  variantId: string,
  windowMinutes: number = 10
): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("inventory_movements")
    .select("id")
    .eq("variant_id", variantId)
    .in("type", ["debit", "reserve", "refund"])
    .gt("created_at", cutoff)
    .limit(1);

  return (data?.length || 0) > 0;
}
