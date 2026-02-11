import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate webhook secret token from URL
    const url = new URL(req.url);
    const webhookSecret = Deno.env.get("APPMAX_WEBHOOK_SECRET");

    // #5: Webhook secret is MANDATORY
    if (!webhookSecret) {
      console.error("[webhook] APPMAX_WEBHOOK_SECRET not configured - rejecting request");
      return new Response("Webhook secret not configured", { status: 500 });
    }
    const urlToken = url.searchParams.get("token");
    if (urlToken !== webhookSecret) {
      console.warn("[webhook] Invalid token received");
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRole);

    // Extract event info from payload
    // Appmax may send events in different formats
    const eventType = payload?.type || payload?.event || payload?.event_type || "unknown";
    const appmaxOrderId =
      payload?.data?.order_id?.toString() ||
      payload?.order_id?.toString() ||
      payload?.data?.id?.toString() ||
      null;

    if (!appmaxOrderId) {
      console.warn("[webhook] No order_id in payload:", JSON.stringify(payload).slice(0, 200));
      return new Response("OK", { status: 200 });
    }

    // Idempotency: generate event hash
    const raw = JSON.stringify(payload);
    const eventHash = await sha256(`${eventType}:${appmaxOrderId}:${raw}`);

    // Try to insert (unique constraint on event_hash prevents duplicates)
    const { error: insertError } = await supabase.from("order_events").insert({
      appmax_order_id: appmaxOrderId,
      event_type: eventType,
      event_hash: eventHash,
      payload,
    });

    if (insertError) {
      // Likely duplicate event - return OK to stop retries
      console.log("[webhook] Duplicate event ignored:", eventType, appmaxOrderId);
      return new Response("OK", { status: 200 });
    }

    // Map event to internal status
    const newStatus = mapEventToStatus(eventType);

    if (newStatus && appmaxOrderId) {
      // Find internal order by appmax_order_id
      const { data: order } = await supabase
        .from("orders")
        .select("id, status")
        .eq("appmax_order_id", appmaxOrderId)
        .maybeSingle();

      if (order) {
        // Prevent backward status transitions
        const statusWeight: Record<string, number> = {
          pending: 1,
          processing: 2,
          shipped: 3,
          delivered: 4,
          cancelled: 5,
        };

        const currentWeight = statusWeight[order.status] || 0;
        const newWeight = statusWeight[newStatus] || 0;

        // Allow forward transitions and cancellations
        if (newWeight > currentWeight || newStatus === "cancelled") {
          await supabase
            .from("orders")
            .update({
              status: newStatus,
              last_webhook_event: eventType,
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.id);

          // Also link order_event to the order
          await supabase
            .from("order_events")
            .update({ order_id: order.id })
            .eq("event_hash", eventHash);

          console.log(`[webhook] Order ${order.id} status: ${order.status} → ${newStatus} (${eventType})`);
        } else {
          console.log(`[webhook] Skipping backward transition: ${order.status} → ${newStatus}`);
        }
      } else {
        console.warn(`[webhook] No internal order found for appmax_order_id: ${appmaxOrderId}`);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("[webhook] Error:", error.message);
    // Return 200 to prevent Appmax from retrying on our errors
    return new Response("OK", { status: 200 });
  }
});
