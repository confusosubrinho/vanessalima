import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { captureAttribution, getAttribution } from "@/lib/attribution";
import { Loader2, ShieldCheck, Lock, CreditCard } from "lucide-react";
import { getCartItemUnitPrice } from "@/lib/cartPricing";

export default function CheckoutStart() {
  const navigate = useNavigate();
  const { items, subtotal, discount, selectedShipping, clearCart, appliedCoupon, cartId, shippingZip } = useCart();
  const [error, setError] = useState<string | null>(null);
  const hasStartedCheckout = useRef(false);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);

  const shippingCost = selectedShipping?.price ?? 0;
  const totalValue = subtotal - discount + shippingCost;

  useEffect(() => {
    captureAttribution();

    // #region agent log
    fetch('http://127.0.0.1:7427/ingest/6be3df10-442e-437f-9e54-2e76350dbe50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'99eb5a'},body:JSON.stringify({sessionId:'99eb5a',location:'CheckoutStart.tsx:effect',message:'effect run',data:{itemsLength:items.length,cartId:cartId||null},hypothesisId:'A',timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (items.length === 0) {
      navigate("/carrinho");
      return;
    }
    if (hasStartedCheckout.current) return;
    hasStartedCheckout.current = true;

    const startCheckout = async () => {
      try {
        // Uma única fonte de verdade: qual fluxo está ativo (transparente vs gateway)
        const { data: resolveData } = await supabase.functions.invoke("checkout-create-session", {
          body: { action: "resolve" },
        });
        const flow = resolveData?.flow as string | undefined;
        const provider = resolveData?.provider as string | undefined;

        if (flow === "transparent" || !flow) {
          navigate("/checkout", { replace: true });
          return;
        }

        if (flow === "gateway" && provider === "yampi") {
          const att = getAttribution();
          const payload = {
            items: items.map((i) => ({ variant_id: i.variant.id, quantity: i.quantity })),
            attribution: att ? { utm_source: att.utm_source, utm_medium: att.utm_medium, utm_campaign: att.utm_campaign, utm_term: att.utm_term, utm_content: att.utm_content, referrer: att.referrer, landing_page: att.landing_page } : undefined,
          };
          const { data: yampiData, error: yampiInvokeError } = await supabase.functions.invoke("checkout-create-session", { body: payload });
          if (yampiInvokeError) throw new Error(yampiInvokeError.message || "Erro ao conectar com o servidor de checkout");
          const errMsg = yampiData?.error as string | undefined;
          if (errMsg && !yampiData?.redirect_url) throw new Error(errMsg);
          const redirectUrl = yampiData?.redirect_url as string | undefined;
          if (redirectUrl && redirectUrl.startsWith("http")) {
            clearCart();
            window.location.href = redirectUrl;
          } else if (yampiData?.fallback && redirectUrl) {
            navigate(redirectUrl, { replace: true });
          } else if (errMsg) {
            throw new Error(errMsg);
          } else {
            throw new Error("Erro ao gerar link de pagamento Yampi. Tente o checkout da loja.");
          }
          return;
        }

        if (flow !== "gateway" || provider !== "stripe") {
          navigate("/checkout", { replace: true });
          return;
        }

        const { data: session } = await supabase.auth.getSession();
        const userId = session?.session?.user?.id || null;
        const guestToken = userId ? null : crypto.randomUUID();

        const orderTotal = subtotal - discount + shippingCost;

        // Create order with placeholder shipping data (Stripe will collect real address)
        const { data: order, error: orderError } = await supabase
          .from("orders")
          .insert({
            order_number: "TEMP",
            user_id: userId,
            cart_id: cartId,
            subtotal: subtotal,
            shipping_cost: shippingCost,
            discount_amount: discount,
            total_amount: orderTotal,
            status: "pending",
            shipping_name: "Aguardando Stripe",
            shipping_address: "Aguardando Stripe",
            shipping_city: "Aguardando",
            shipping_state: "XX",
            shipping_zip: shippingZip || "00000000",
            shipping_phone: null,
            coupon_code: appliedCoupon?.code || null,
            customer_email: null,
            idempotency_key: cartId,
            access_token: guestToken,
            provider: "stripe",
            gateway: "stripe",
          } as any)
          .select()
          .single();

        // #region agent log
        fetch('http://127.0.0.1:7427/ingest/6be3df10-442e-437f-9e54-2e76350dbe50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'99eb5a'},body:JSON.stringify({sessionId:'99eb5a',location:'CheckoutStart.tsx:afterOrderInsert',message:'order insert result',data:{orderId:order?.id||null,orderErrorCode:orderError?.code||null,orderErrorMsg:orderError?.message?.slice(0,120)||null},hypothesisId:'D',timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        if (orderError) {
          // Handle duplicate cart_id
          if (orderError.code === "23505" && orderError.message?.includes("cart_id")) {
            const { data: existingByCart } = await (supabase.from("orders") as any)
              .select("id, order_number")
              .eq("cart_id", cartId)
              .limit(1)
              .maybeSingle();
            if (existingByCart) {
              navigate(`/pedido-confirmado/${existingByCart.id}`, {
                state: { orderId: existingByCart.id, orderNumber: existingByCart.order_number },
                replace: true,
              });
              return;
            }
          }
          throw orderError;
        }

        // Insert order items
        const orderItems = items.map((item) => ({
          order_id: order.id,
          product_id: item.product.id,
          product_variant_id: item.variant.id,
          product_name: item.product.name,
          variant_info: `${item.variant.size}${item.variant.color ? " / " + item.variant.color : ""}`,
          quantity: item.quantity,
          unit_price: getCartItemUnitPrice(item),
          total_price: getCartItemUnitPrice(item) * item.quantity,
          title_snapshot: item.product.name,
          image_snapshot: item.product.images?.[0]?.url || null,
        }));

        await supabase.from("order_items").insert(orderItems);

        // Build products array for Stripe
        const products = items.map((item) => ({
          variant_id: item.variant.id,
          name: item.product.name,
          quantity: item.quantity,
          unit_price: getCartItemUnitPrice(item),
        }));

        const origin = window.location.origin;

        // Call Stripe to create checkout session
        const { data: stripeData, error: stripeError } = await supabase.functions.invoke(
          "stripe-create-intent",
          {
            body: {
              action: "create_checkout_session",
              order_id: order.id,
              amount: orderTotal,
              products,
              coupon_code: appliedCoupon?.code || null,
              discount_amount: discount,
              order_access_token: guestToken,
              success_url: `${origin}/checkout/obrigado?session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${origin}/carrinho`,
            },
          }
        );

        const backendError = stripeData?.error != null
          ? (typeof stripeData.error === "string" ? stripeData.error : JSON.stringify(stripeData.error))
          : null;
        const hasCheckoutUrl = !!(stripeData?.checkout_url);

        // #region agent log
        fetch('http://127.0.0.1:7427/ingest/6be3df10-442e-437f-9e54-2e76350dbe50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'99eb5a'},body:JSON.stringify({sessionId:'99eb5a',location:'CheckoutStart.tsx:afterInvoke',message:'stripe-create-intent response',data:{hasStripeError:!!stripeError,stripeErrorMessage:stripeError?.message?.slice(0,100)||null,backendError:backendError?.slice(0,150)||null,hasCheckoutUrl,checkoutUrlHost:stripeData?.checkout_url?new URL(stripeData.checkout_url).host:null},hypothesisId:'B,C,E',timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        if (stripeError) throw new Error(backendError || stripeError.message);
        if (backendError) throw new Error(backendError);

        if (stripeData?.checkout_url) {
          // #region agent log
          fetch('http://127.0.0.1:7427/ingest/6be3df10-442e-437f-9e54-2e76350dbe50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'99eb5a'},body:JSON.stringify({sessionId:'99eb5a',location:'CheckoutStart.tsx:redirect',message:'redirecting to Stripe',data:{checkoutUrlHost:new URL(stripeData.checkout_url).host},hypothesisId:'success',timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          clearCart();
          window.location.href = stripeData.checkout_url;
        } else {
          throw new Error("URL de checkout não retornada");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro ao iniciar checkout";
        // #region agent log
        fetch('http://127.0.0.1:7427/ingest/6be3df10-442e-437f-9e54-2e76350dbe50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'99eb5a'},body:JSON.stringify({sessionId:'99eb5a',location:'CheckoutStart.tsx:catch',message:'checkout error',data:{errorMessage:msg.slice(0,200)},hypothesisId:'B,C,D,E',timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        console.error("Checkout start error:", msg);
        setError(msg);
      }
    };

    startCheckout();
  }, [items.length, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md mx-auto px-4 space-y-6">
        {error ? (
          <div className="text-center space-y-4">
            <p className="text-destructive text-sm">{error}</p>
            <button
              onClick={() => navigate("/carrinho")}
              className="text-primary underline text-sm"
            >
              Voltar ao carrinho
            </button>
          </div>
        ) : (
          <>
            {/* Mini order summary */}
            <div className="border rounded-lg p-4 space-y-3">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Resumo do pedido
              </h2>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.variant.id} className="flex items-center gap-3">
                    <img
                      src={item.product.images?.[0]?.url || "/placeholder.svg"}
                      alt={item.product.name}
                      className="w-10 h-10 rounded object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.variant.size}
                        {item.variant.color ? ` / ${item.variant.color}` : ""} × {item.quantity}
                      </p>
                    </div>
                    <p className="text-sm font-medium whitespace-nowrap">
                      {formatPrice(getCartItemUnitPrice(item) * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="border-t pt-2 space-y-1">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-primary">
                    <span>Desconto</span>
                    <span>-{formatPrice(discount)}</span>
                  </div>
                )}
                {selectedShipping && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Frete</span>
                    <span>{selectedShipping.price === 0 ? "Grátis" : formatPrice(selectedShipping.price)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold pt-1">
                  <span>Total</span>
                  <span>{formatPrice(totalValue)}</span>
                </div>
              </div>
            </div>

            {/* Loading spinner */}
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-muted-foreground text-sm">
                Redirecionando para pagamento seguro...
              </p>
            </div>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-6 pt-4 border-t">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Lock className="h-4 w-4" />
                <span className="text-xs">SSL Seguro</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs">Compra Garantida</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CreditCard className="h-4 w-4" />
                <span className="text-xs">Pagamento Seguro</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
