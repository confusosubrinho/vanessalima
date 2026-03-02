/**
 * Contrato PR9 Fase 1: route "start" do checkout-router.
 * Request enviado pelo front; response canônica do router.
 */

export type CheckoutStartRequest = {
  route: "start";
  request_id: string;
  cart_id: string;
  success_url?: string;
  cancel_url?: string;
  attribution?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
    referrer?: string;
    landing_page?: string;
  };
  customer?: { email?: string; name?: string; phone?: string };
  shipping?: { zip?: string; method_id?: string };
  /** Itens do carrinho; unit_price opcional (backend pode recalcular) */
  items?: Array<{ variant_id: string; quantity: number; unit_price?: number; product_name?: string }>;
  subtotal: number;
  discount_amount?: number;
  shipping_cost?: number;
  total_amount: number;
  /** Para guest checkout */
  order_access_token?: string | null;
  /** Se usuário autenticado */
  user_id?: string | null;
  coupon_code?: string | null;
};

export type CheckoutStartResponse = {
  success: boolean;
  provider: "stripe" | "yampi" | "appmax";
  channel: "internal" | "external";
  experience: "transparent" | "native";
  action: "redirect" | "render";
  order_id?: string;
  order_access_token?: string;
  redirect_url?: string;
  client_secret?: string;
  message?: string;
  error?: string;
};
