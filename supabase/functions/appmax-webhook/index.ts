import {
  corsHeaders,
  getServiceClient,
  logAppmax,
} from "../_shared/appmax.ts";

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Map Appmax event types to internal order statuses
function mapEventToStatus(eventType: string): string | null {
  const map: Record<string, string> = {
    order_paid: "processing",
    order_approved: "processing",
    order_paid_by_pix: "processing",
    order_pix_created: "pending",
    order_billet_created: "pending",
    order_pending_integration: "pending",
    order_integrated: "processing",
    order_refund: "cancelled",
    order_pix_expired: "cancelled",
    order_billet_overdue: "cancelled",
    order_shipped: "shipped",
    order_delivered: "delivered",
  };
  return map[eventType] || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = getServiceClient();

  try {
    // Validate webhook secret token from URL
    const url = new URL(req.url);
    const webhookSecret = Deno.env.get("APPMAX_WEBHOOK_SECRET");

    if (!webhookSecret) {
      await logAppmax(supabase, "error", "APPMAX_WEBHOOK_SECRET não configurado — rejeitando request");
      return new Response("Webhook secret not configured", { status: 500 });
    }
    const urlToken = url.searchParams.get("token");
    if (urlToken !== webhookSecret) {
      await logAppmax(supabase, "warn", "Webhook token inválido recebido");
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    const eventType = payload?.type || payload?.event || payload?.event_type || "unknown";
    const appmaxOrderId =
      payload?.data?.order_id?.toString() ||
      payload?.order_id?.toString() ||
      payload?.data?.id?.toString() ||
      null;

    if (!appmaxOrderId) {
      await logAppmax(supabase, "warn", "Webhook sem order_id no payload", {
        preview: JSON.stringify(payload).slice(0, 200),
      });
      return new Response("OK", { status: 200 });
    }

    // Idempotency: generate event hash
    const raw = JSON.stringify(payload);
    const eventHash = await sha256(`${eventType}:${appmaxOrderId}:${raw}`);

    const { error: insertError } = await supabase.from("order_events").insert({
      appmax_order_id: appmaxOrderId,
      event_type: eventType,
      event_hash: eventHash,
      payload,
    });

    if (insertError) {
      await logAppmax(supabase, "info", `Webhook evento duplicado ignorado: ${eventType}`, {
        appmax_order_id: appmaxOrderId,
      });
      return new Response("OK", { status: 200 });
    }

    // Map event to internal status
    const newStatus = mapEventToStatus(eventType);

    if (newStatus && appmaxOrderId) {
      const { data: order } = await supabase
        .from("orders")
        .select("id, status")
        .eq("appmax_order_id", appmaxOrderId)
        .maybeSingle();

      if (order) {
        const statusWeight: Record<string, number> = {
          pending: 1, processing: 2, shipped: 3, delivered: 4, cancelled: 5,
        };
        const currentWeight = statusWeight[order.status] || 0;
        const newWeight = statusWeight[newStatus] || 0;

        if (newWeight > currentWeight || newStatus === "cancelled") {
          await supabase.from("orders").update({
            status: newStatus,
            last_webhook_event: eventType,
            updated_at: new Date().toISOString(),
          }).eq("id", order.id);

          await supabase.from("order_events").update({ order_id: order.id }).eq("event_hash", eventHash);

          await logAppmax(supabase, "info", `Pedido ${order.id}: ${order.status} → ${newStatus}`, {
            event_type: eventType,
            appmax_order_id: appmaxOrderId,
          });
        }
      } else {
        await logAppmax(supabase, "warn", `Pedido interno não encontrado para appmax_order_id: ${appmaxOrderId}`);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    await logAppmax(supabase, "error", `Erro no webhook: ${error.message}`);
    return new Response("OK", { status: 200 });
  }
});
