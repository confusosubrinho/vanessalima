import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { captureAttribution, getAttribution } from "@/lib/attribution";
import { Loader2, ShieldCheck, Lock, CreditCard } from "lucide-react";

export default function CheckoutStart() {
  const navigate = useNavigate();
  const { items, subtotal, clearCart } = useCart();
  const [error, setError] = useState<string | null>(null);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);

  useEffect(() => {
    captureAttribution();

    if (!items.length) {
      navigate("/carrinho");
      return;
    }

    const startCheckout = async () => {
      try {
        const attribution = getAttribution();
        const cartItems = items.map((item) => ({
          variant_id: item.variant.id,
          quantity: item.quantity,
        }));

        const { data, error: fnError } = await supabase.functions.invoke(
          "checkout-create-session",
          { body: { items: cartItems, attribution } }
        );

        if (fnError) throw new Error(fnError.message);
        if (data?.error) throw new Error(data.error);

        // #6 Save session_id and clear cart before redirect
        if (data?.session_id) {
          localStorage.setItem("checkout_session_id", data.session_id);
        }

        if (data?.redirect_url) {
          if (data.redirect_url.startsWith("http")) {
            // External redirect (Yampi) - clear cart now
            clearCart();
            window.location.href = data.redirect_url;
          } else {
            navigate(data.redirect_url);
          }
        } else {
          navigate("/checkout");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro ao iniciar checkout";
        console.error("Checkout start error:", msg);
        setError(msg);
        setTimeout(() => navigate("/checkout"), 3000);
      }
    };

    startCheckout();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md mx-auto px-4 space-y-6">
        {error ? (
          <div className="text-center space-y-4">
            <p className="text-destructive text-sm">{error}</p>
            <p className="text-muted-foreground text-xs">
              Redirecionando para checkout alternativo...
            </p>
          </div>
        ) : (
          <>
            {/* #9 Mini order summary */}
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
                      {formatPrice(
                        Number(item.product.sale_price || item.product.base_price) * item.quantity
                      )}
                    </p>
                  </div>
                ))}
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
            </div>

            {/* Loading spinner */}
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-muted-foreground text-sm">
                Preparando seu checkout seguro...
              </p>
            </div>

            {/* #8 Trust badges */}
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
