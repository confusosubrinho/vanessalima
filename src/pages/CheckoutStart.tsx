import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { captureAttribution, getAttribution } from "@/lib/attribution";
import { Loader2, ShieldCheck, Lock, CreditCard } from "lucide-react";
import { getCartItemUnitPrice } from "@/lib/cartPricing";
import { generateRequestId, invokeCheckoutRouter } from "@/lib/checkoutClient";
import type { CheckoutStartResponse } from "@/types/checkoutStart";
import { Button } from "@/components/ui/button";

export default function CheckoutStart() {
  const navigate = useNavigate();
  const { items, subtotal, discount, selectedShipping, clearCart, appliedCoupon, cartId, shippingZip } = useCart();
  const [error, setError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const hasStartedCheckout = useRef(false);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);

  const shippingCost = selectedShipping?.price ?? 0;
  const totalValue = subtotal - discount + shippingCost;

  useEffect(() => {
    captureAttribution();

    if (items.length === 0) {
      navigate("/carrinho");
      return;
    }
    if (hasStartedCheckout.current) return;
    hasStartedCheckout.current = true;

    const requestId = generateRequestId();
    const origin = window.location.origin;

    const startCheckout = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        if (!supabaseUrl || String(supabaseUrl).trim() === "") {
          setError(
            "Servidor de pagamento não configurado. Adicione VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env (veja .env.example)."
          );
          hasStartedCheckout.current = false;
          return;
        }

        const payload = {
          request_id: requestId,
          cart_id: cartId!,
          success_url: `${origin}/checkout/obrigado?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/carrinho`,
          attribution: getAttribution() ? {
            utm_source: getAttribution()?.utm_source,
            utm_medium: getAttribution()?.utm_medium,
            utm_campaign: getAttribution()?.utm_campaign,
            utm_term: getAttribution()?.utm_term,
            utm_content: getAttribution()?.utm_content,
            referrer: getAttribution()?.referrer,
            landing_page: getAttribution()?.landing_page,
          } : undefined,
          items: items.map((i) => ({
            variant_id: i.variant.id,
            quantity: i.quantity,
            unit_price: getCartItemUnitPrice(i),
            product_name: i.product.name,
          })),
          subtotal,
          discount_amount: discount,
          shipping_cost: shippingCost,
          total_amount: totalValue,
          order_access_token: null as string | null,
          user_id: null as string | null,
          coupon_code: appliedCoupon?.code ?? null,
        };

        const { data: session } = await supabase.auth.getSession();
        if (session?.data?.session?.user?.id) {
          (payload as Record<string, unknown>).user_id = session.data.session.user.id;
        } else {
          (payload as Record<string, unknown>).order_access_token = crypto.randomUUID();
        }

        const { data, error: invokeError } = await invokeCheckoutRouter<CheckoutStartResponse>("start", payload, requestId);
        if (invokeError) throw invokeError;
        if (!data) throw new Error("Resposta vazia do checkout");

        const errMsg = data.error;
        if (errMsg) throw new Error(errMsg);

        if (data.action === "redirect" && data.redirect_url && data.redirect_url.startsWith("http")) {
          clearCart();
          window.location.href = data.redirect_url;
          return;
        }
        if (data.action === "redirect" && data.redirect_url) {
          navigate(data.redirect_url, { replace: true });
          return;
        }
        if (data.action === "render") {
          navigate("/checkout", {
            replace: true,
            state: {
              orderId: data.order_id,
              provider: data.provider,
              requestId,
              orderAccessToken: data.order_access_token,
              clientSecret: data.client_secret,
            },
          });
          return;
        }
        navigate("/checkout", { replace: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro ao iniciar checkout";
        console.error("Checkout start error:", msg);
        setError(msg);
        hasStartedCheckout.current = false;
      }
    };

    startCheckout();
  }, [items.length, navigate, retryTrigger]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md mx-auto px-4 space-y-6">
        {error ? (
          <div className="text-center space-y-4">
            <p className="text-destructive text-sm">{error}</p>
            {(error.includes("conectar ao servidor") || error.includes("não configurado")) && (
              <p className="text-muted-foreground text-xs max-w-sm mx-auto">
                Confira o .env (VITE_SUPABASE_URL) e execute: supabase functions deploy checkout-router
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button
                onClick={() => {
                  setError(null);
                  setRetryTrigger((r) => r + 1);
                }}
                variant="default"
              >
                Tentar novamente
              </Button>
              <Button
                onClick={() => navigate("/carrinho")}
                variant="outline"
              >
                Voltar ao carrinho
              </Button>
            </div>
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
