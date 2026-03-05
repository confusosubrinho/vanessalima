/**
 * yampi-sync-order-status: Sincroniza status e dados de um pedido Yampi com o pedido local.
 * Busca o pedido na API Yampi pelo external_reference e atualiza status, pagamento, rastreio, método de envio e data da compra.
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

  async function fetchYampiOrder(q: string): Promise<Record<string, unknown> | null> {
    const searchUrl = `${baseUrl}/orders?${includeQuery}&q=${encodeURIComponent(q)}&limit=5`;
    const res = await fetch(searchUrl, { headers });
    if (!res.ok) return null;
    const json = await res.json();
    const orders = json?.data || [];
    return orders.find((o: Record<string, unknown>) =>
      String(o.id) === q || String(o.number) === q || String(o.order_number) === q
    ) || orders[0] || null;
  }

  let yampiOrder: Record<string, unknown> | null = null;
  try {
    // 1) Busca pelo ID externo (id interno na Yampi)
    yampiOrder = await fetchYampiOrder(order.external_reference);
    // 2) Se não achou e temos número do pedido, tenta pelo número (ex.: 1491772375818422)
    if (!yampiOrder && order.yampi_order_number) {
      yampiOrder = await fetchYampiOrder(order.yampi_order_number);
    }
    // 3) Se ainda não achou, tenta GET direto por ID (algumas APIs suportam)
    if (!yampiOrder) {
      const directUrl = `${baseUrl}/orders/${order.external_reference}?${includeQuery}`;
      const res = await fetch(directUrl, { headers });
      if (res.ok) {
        const json = await res.json();
        yampiOrder = (json?.data as Record<string, unknown>) || (json as Record<string, unknown>) || null;
      }
    }
  } catch (err) {
    console.error("[yampi-sync] Fetch error:", err);
    return jsonRes({ ok: false, error: "Erro ao conectar com a API Yampi" }, 502);
  }

  if (!yampiOrder) {
    return jsonRes({
      ok: false,
      error: "Pedido não encontrado na Yampi",
      hint: "Se importou pelo ID interno, tente importar de novo pelo número do pedido (ex.: 1491772375818422) que aparece no painel da Yampi.",
    }, 404);
  }

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
  const transactions = ((yampiOrder.transactions as Record<string, unknown>)?.data as unknown[]) || (yampiOrder.transactions as unknown[]) || [];
  const firstTx = (transactions[0] as Record<string, unknown>) || {};
  const txStatus = (firstTx.status as string)?.toLowerCase() || yampiStatus;
  const paymentStatus = paymentStatusMap[txStatus] || paymentStatusMap[yampiStatus] || (localStatus === "pending" ? "pending" : localStatus === "cancelled" ? "failed" : "approved");

  const trackingCode = (yampiOrder.tracking_code as string) || null;
  const shippingOption = (yampiOrder.shipping_option as Record<string, unknown>) || {};
  const shippingMethodName = (yampiOrder.shipping_option_name as string) ||
    (shippingOption.name as string) ||
    ((yampiOrder.delivery_option as Record<string, unknown>)?.name as string) ||
    (yampiOrder.shipping_method as string) ||
    null;

  const yampiOrderDate = (yampiOrder.created_at as string) || (yampiOrder.date as string) || (yampiOrder.order_date as string) || (yampiOrder.updated_at as string) || null;
  const yampiCreatedAt = yampiOrderDate ? new Date(yampiOrderDate).toISOString() : null;
  const yampiOrderNumber = (yampiOrder.number != null ? String(yampiOrder.number) : null) || (yampiOrder.order_number != null ? String(yampiOrder.order_number) : null) || null;

  const updatePayload: Record<string, unknown> = {
    status: localStatus,
    payment_status: paymentStatus,
    tracking_code: trackingCode,
    shipping_method: shippingMethodName,
    yampi_created_at: yampiCreatedAt,
    yampi_order_number: yampiOrderNumber,
  };

  const { error: updateErr } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", order.id);

  if (updateErr) {
    console.error("[yampi-sync] Update error:", updateErr?.message);
    return jsonRes({ ok: false, error: updateErr?.message || "Erro ao atualizar pedido" }, 500);
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
