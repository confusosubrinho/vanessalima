/**
 * PR4: Checkout router mínimo — delega para implementações existentes e retorna shape unificado.
 * PR9 Fase 1: route "start" — schema rígido (zod), preços/totais recalculados no servidor, allowlist, rate limit.
 */
import { z } from "https://esm.sh/zod@3.23.8";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, stripe-signature",
};

const SINGLETON_ID = "00000000-0000-0000-0000-000000000001";

const ROUTES = [
  "start",
  "resolve",
  "create_gateway_session",
  "stripe_intent",
  "process_payment",
] as const;

type Route = (typeof ROUTES)[number];

const TARGET_MAP: Record<Exclude<Route, "start">, string> = {
  resolve: "checkout-create-session",
  create_gateway_session: "checkout-create-session",
  stripe_intent: "stripe-create-intent",
  process_payment: "process-payment",
};

// Allowlist e schema por route. Para "start" não aceitamos unit_price/product_name/subtotal/total_amount do cliente.
const startStartItemSchema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.number().int().positive(),
});
const startStartSchema = z.object({
  route: z.literal("start"),
  cart_id: z.string().min(1),
  items: z.array(startStartItemSchema).min(1),
  discount_amount: z.number().min(0).optional().default(0),
  shipping_cost: z.number().min(0).optional().default(0),
  success_url: z.union([z.string().url(), z.literal("")]).optional().default(""),
  cancel_url: z.union([z.string().url(), z.literal("")]).optional().default(""),
  attribution: z.unknown().optional(),
  user_id: z.string().uuid().nullable().optional(),
  order_access_token: z.string().nullable().optional(),
  coupon_code: z.string().nullable().optional(),
  request_id: z.string().optional(),
});

// Rate limit simples em memória: por cart_id + IP, 30 req/min
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimitCheck(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (now >= entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

function jsonRes(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonRes({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("checkout-router: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return jsonRes({ success: false, error: "Configuração do servidor incompleta" }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    return jsonRes({ success: false, error: "Body JSON inválido" }, 400);
  }

  const route = (body?.route ?? body?.action) as Route | undefined;
  const requestId = (body?.request_id as string) || req.headers.get("x-request-id") || null;

  if (!route || !ROUTES.includes(route)) {
    return jsonRes(
      { success: false, error: "route inválida. Use: start | resolve | create_gateway_session | stripe_intent | process_payment" },
      400
    );
  }

  // ─── PR9: route "start" — validação rígida, preços do DB, rate limit ───
  if (route === "start") {
    const parsed = startStartSchema.safeParse({ ...body, route: "start" });
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join("; ") || "Payload inválido para route start";
      return jsonRes({ success: false, error: msg }, 400);
    }
    const startReq = parsed.data;
    const cartId = startReq.cart_id;
    const itemsInput = startReq.items;
    const discountAmount = startReq.discount_amount ?? 0;
    const shippingCost = startReq.shipping_cost ?? 0;
    const successUrl = startReq.success_url ?? "";
    const cancelUrl = startReq.cancel_url ?? "";
    const orderAccessToken = startReq.order_access_token ?? null;
    const userId = startReq.user_id ?? null;
    const couponCode = startReq.coupon_code ?? null;
    const attribution = startReq.attribution;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const rateKey = `${cartId}|${ip}`;
    if (!rateLimitCheck(rateKey)) {
      return jsonRes({ success: false, error: "Muitas requisições. Tente novamente em alguns minutos." }, 429);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const t0 = Date.now();

    const variantIds = [...new Set(itemsInput.map((i) => i.variant_id))];
    const { data: variantsRows, error: variantsErr } = await supabase
      .from("product_variants")
      .select("id, product_id, base_price, sale_price, products(base_price, sale_price, name)")
      .in("id", variantIds);

    if (variantsErr || !variantsRows?.length) {
      return jsonRes({ success: false, error: "Variantes não encontradas ou inválidas" }, 400);
    }

    type VariantRow = {
      id: string;
      product_id: string | null;
      base_price: number | null;
      sale_price: number | null;
      products: { base_price?: number; sale_price?: number; name?: string } | null;
    };
    const variantMap = new Map<string, { product_id: string | null; name: string; unit_price: number }>();
    for (const v of variantsRows as VariantRow[]) {
      const product = v.products;
      const base = v.base_price ?? product?.base_price ?? 0;
      const sale = v.sale_price ?? product?.sale_price ?? null;
      const unitPrice = typeof sale === "number" && sale >= 0 ? sale : (typeof base === "number" ? base : 0);
      const name = (product?.name as string) ?? "";
      variantMap.set(v.id, { product_id: v.product_id ?? null, name, unit_price: Number(unitPrice) });
    }

    const items: Array<{ variant_id: string; quantity: number; unit_price: number; product_name: string }> = [];
    let subtotal = 0;
    for (const i of itemsInput) {
      const meta = variantMap.get(i.variant_id);
      if (!meta) {
        return jsonRes({ success: false, error: `Variante inválida: ${i.variant_id}` }, 400);
      }
      const unitPrice = meta.unit_price;
      const lineTotal = unitPrice * i.quantity;
      subtotal += lineTotal;
      items.push({
        variant_id: i.variant_id,
        quantity: i.quantity,
        unit_price: unitPrice,
        product_name: meta.name,
      });
    }
    const totalAmount = Math.max(0, subtotal - discountAmount + shippingCost);

    let provider: "stripe" | "yampi" | "appmax" = "stripe";
    let channel: "internal" | "external" = "internal";
    let experience: "transparent" | "native" = "transparent";

    const { data: settings } = await supabase
      .from("checkout_settings")
      .select("enabled, active_provider, channel, experience")
      .eq("id", SINGLETON_ID)
      .maybeSingle();

    if (settings) {
      if (!settings.enabled) {
        return jsonRes({
          success: true,
          provider: settings.active_provider as "stripe" | "yampi" | "appmax",
          channel: settings.channel as "internal" | "external",
          experience: settings.experience as "transparent" | "native",
          action: "render",
          redirect_url: "/checkout",
          message: "Checkout desativado.",
        });
      }
      provider = settings.active_provider as "stripe" | "yampi" | "appmax";
      channel = settings.channel as "internal" | "external";
      experience = settings.experience as "transparent" | "native";
    } else {
      const resolveUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/checkout-create-session`;
      const resolveRes = await fetchWithTimeout(
        resolveUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({ action: "resolve", request_id: requestId }),
        },
        10_000
      );
      const resolveData = resolveRes.ok ? (await resolveRes.json().catch(() => ({}))) as Record<string, unknown> : {};
      const flow = resolveData.flow as string | undefined;
      channel = flow === "gateway" ? "external" : "internal";
      experience = channel === "external" ? "native" : "transparent";
      provider = (resolveData.provider as "stripe" | "yampi" | "appmax") || "stripe";
    }

    let orderId: string | null = null;
    let guestToken: string | null = orderAccessToken;

    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, order_number, access_token")
      .eq("cart_id", cartId)
      .in("status", ["pending", "processing"])
      .maybeSingle();

    if (existingOrder) {
      orderId = existingOrder.id;
      if (existingOrder.access_token) guestToken = existingOrder.access_token;
    } else {
      const guestTokenNew = guestToken || crypto.randomUUID();
      const { data: newOrder, error: orderErr } = await supabase
        .from("orders")
        .insert({
          order_number: "TEMP",
          user_id: userId,
          cart_id: cartId,
          subtotal,
          shipping_cost: shippingCost,
          discount_amount: discountAmount,
          total_amount: totalAmount,
          status: "pending",
          shipping_name: channel === "external" ? "Aguardando checkout" : "A preencher",
          shipping_address: "A preencher",
          shipping_city: "",
          shipping_state: "XX",
          shipping_zip: "00000000",
          shipping_phone: null,
          coupon_code: couponCode,
          customer_email: null,
          idempotency_key: cartId,
          access_token: guestTokenNew,
          provider,
          gateway: provider === "stripe" ? "stripe" : null,
        })
        .select("id")
        .single();
      if (orderErr) {
        if (orderErr.code === "23505") {
          const { data: again } = await supabase.from("orders").select("id, access_token").eq("cart_id", cartId).maybeSingle();
          if (again) {
            orderId = again.id;
            guestToken = again.access_token;
          }
        }
        if (!orderId) {
          console.error("checkout-router start order insert error:", orderErr);
          return jsonRes({ success: false, error: orderErr.message }, 500);
        }
      } else {
        orderId = newOrder?.id ?? null;
        guestToken = guestTokenNew;
      }
      if (orderId && newOrder && !orderErr) {
        const fullItems = items.map((i) => {
          const meta = variantMap.get(i.variant_id)!;
          return {
            order_id: orderId,
            product_variant_id: i.variant_id,
            product_id: meta.product_id,
            product_name: i.product_name,
            variant_info: "",
            quantity: i.quantity,
            unit_price: i.unit_price,
            total_price: i.unit_price * i.quantity,
            title_snapshot: i.product_name,
            image_snapshot: null as string | null,
          };
        });
        await supabase.from("order_items").insert(
          fullItems.map(({ order_id, product_variant_id, product_id, product_name, variant_info, quantity, unit_price, total_price, title_snapshot, image_snapshot }) =>
            ({ order_id, product_variant_id, product_id, product_name, variant_info, quantity, unit_price, total_price, title_snapshot, image_snapshot })
          )
        );
      }
    }

    const origin = successUrl ? (() => { try { return new URL(successUrl).origin; } catch { return ""; } })() : "";
    const productsForStripe = items.map((i) => ({ variant_id: i.variant_id, name: i.product_name, quantity: i.quantity, unit_price: i.unit_price }));

    if (channel === "external" && provider === "yampi") {
      const targetUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/checkout-create-session`;
      const yampiRes = await fetchWithTimeout(
        targetUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({
            items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
            attribution,
            request_id: requestId,
          }),
        },
        22_000
      );
      const yampiData = yampiRes.ok ? (await yampiRes.json().catch(() => ({}))) as Record<string, unknown> : {};
      const redirectUrl = yampiData.redirect_url as string | undefined;
      const errMsg = yampiData.error as string | undefined;
      if (errMsg && !redirectUrl) {
        return jsonRes({ success: false, provider, channel, experience, action: "redirect", error: errMsg }, 400);
      }
      console.log(JSON.stringify({ scope: "checkout-router", request_id: requestId, route: "start", provider, channel, duration_ms: Date.now() - t0 }));
      return jsonRes({
        success: true,
        provider,
        channel,
        experience,
        action: "redirect",
        redirect_url: redirectUrl || `${origin}/checkout`,
      });
    }

    if (channel === "external" && provider === "stripe") {
      const targetUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/stripe-create-intent`;
      const stripeRes = await fetchWithTimeout(
        targetUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({
            action: "create_checkout_session",
            order_id: orderId,
            amount: totalAmount,
            products: productsForStripe,
            coupon_code: couponCode,
            discount_amount: discountAmount,
            order_access_token: guestToken,
            success_url: successUrl || `${origin}/checkout/obrigado?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl || `${origin}/carrinho`,
            request_id: requestId,
          }),
        },
        22_000
      );
      const stripeData = stripeRes.ok ? (await stripeRes.json().catch(() => ({}))) as Record<string, unknown> : {};
      const checkoutUrl = stripeData.checkout_url as string | undefined;
      const errMsg = stripeData.error as string | undefined;
      if (errMsg) return jsonRes({ success: false, provider, channel, experience, action: "redirect", error: errMsg }, stripeRes.ok ? 200 : stripeRes.status);
      console.log(JSON.stringify({ scope: "checkout-router", request_id: requestId, route: "start", provider, channel, duration_ms: Date.now() - t0 }));
      return jsonRes({
        success: true,
        provider,
        channel,
        experience,
        action: "redirect",
        redirect_url: checkoutUrl,
        order_id: orderId ?? undefined,
        order_access_token: guestToken ?? undefined,
      });
    }

    if (channel === "internal" && provider === "stripe") {
      const targetUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/stripe-create-intent`;
      const stripeRes = await fetchWithTimeout(
        targetUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({
            action: "create_payment_intent",
            order_id: orderId,
            amount: totalAmount,
            products: productsForStripe,
            coupon_code: couponCode,
            discount_amount: discountAmount,
            order_access_token: guestToken,
            request_id: requestId,
          }),
        },
        22_000
      );
      const stripeData = stripeRes.ok ? (await stripeRes.json().catch(() => ({}))) as Record<string, unknown> : {};
      const clientSecret = stripeData.client_secret as string | undefined;
      const errMsg = stripeData.error as string | undefined;
      if (errMsg) return jsonRes({ success: false, provider, channel, experience, action: "render", error: errMsg }, stripeRes.ok ? 200 : stripeRes.status);
      console.log(JSON.stringify({ scope: "checkout-router", request_id: requestId, route: "start", provider, channel, duration_ms: Date.now() - t0 }));
      return jsonRes({
        success: true,
        provider,
        channel,
        experience,
        action: "render",
        client_secret: clientSecret,
        order_id: orderId ?? undefined,
        order_access_token: guestToken ?? undefined,
      });
    }

    if (channel === "internal" && provider === "appmax") {
      console.log(JSON.stringify({ scope: "checkout-router", request_id: requestId, route: "start", provider, channel, duration_ms: Date.now() - t0 }));
      return jsonRes({
        success: true,
        provider,
        channel,
        experience,
        action: "render",
        order_id: orderId ?? undefined,
        order_access_token: guestToken ?? undefined,
        redirect_url: "/checkout",
      });
    }

    return jsonRes({
      success: false,
      provider,
      channel,
      experience,
      action: "render",
      error: "Combinação provider/channel não suportada para start",
    }, 400);
  }

  const target = TARGET_MAP[route as Exclude<Route, "start">];
  const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/${target}`;

  const targetBody: Record<string, unknown> = { ...body, request_id: requestId };
  delete targetBody.route;
  if (route === "resolve") targetBody.action = "resolve";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceRoleKey}`,
    ...(requestId && { "x-request-id": requestId }),
  };
  const auth = req.headers.get("authorization");
  if (auth) headers.Authorization = auth;

  console.log(JSON.stringify({ scope: "checkout-router", request_id: requestId, route, target }));

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(targetBody),
      },
      22_000
    );

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return jsonRes({
        success: false,
        error: res.ok ? "Resposta inválida do servidor" : `Erro ${res.status}`,
      }, res.ok ? 502 : res.status);
    }

    const errMsg = typeof data.error === "string" ? data.error : data.error != null ? JSON.stringify(data.error) : null;
    const success = res.ok && !errMsg;

    const unified = {
      success,
      ...(errMsg && { error: errMsg }),
      ...data,
    };
    return jsonRes(unified, res.ok ? 200 : res.status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("checkout-router delegate error:", msg);
    return jsonRes({ success: false, error: msg || "Erro ao processar checkout" }, 500);
  }
});
