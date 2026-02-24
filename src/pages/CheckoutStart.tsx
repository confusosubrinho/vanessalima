import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { captureAttribution, getAttribution } from "@/lib/attribution";
import { Loader2 } from "lucide-react";

export default function CheckoutStart() {
  const navigate = useNavigate();
  const { items, clearCart } = useCart();
  const [error, setError] = useState<string | null>(null);

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
          {
            body: { items: cartItems, attribution },
          }
        );

        if (fnError) throw new Error(fnError.message);
        if (data?.error) throw new Error(data.error);

        if (data?.redirect_url) {
          if (data.redirect_url.startsWith("http")) {
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
        // Fallback to native checkout after 3s
        setTimeout(() => navigate("/checkout"), 3000);
      }
    };

    startCheckout();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        {error ? (
          <>
            <p className="text-destructive text-sm">{error}</p>
            <p className="text-muted-foreground text-xs">
              Redirecionando para checkout alternativo...
            </p>
          </>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground text-sm">
              Preparando seu checkout seguro...
            </p>
          </>
        )}
      </div>
    </div>
  );
}
