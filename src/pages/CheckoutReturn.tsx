import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { StoreLayout } from "@/components/store/StoreLayout";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, Package, Loader2 } from "lucide-react";

interface OrderInfo {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  customer_email: string | null;
}

export default function CheckoutReturn() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id") || localStorage.getItem("checkout_session_id");
  const { clearCart } = useCart();
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 10;

  useEffect(() => {
    // Clear cart on return from payment
    clearCart();
    localStorage.removeItem("checkout_session_id");
  }, []);

  useEffect(() => {
    if (!sessionId || order) return;

    const fetchOrder = async () => {
      // Find recovered cart -> then find order by checking recent orders
      const { data: cart } = await supabase
        .from("abandoned_carts" as any)
        .select("recovered, session_id")
        .eq("session_id", sessionId)
        .maybeSingle();

      if ((cart as any)?.recovered) {
        // Find the most recent order from yampi provider
        const { data: recentOrder } = await supabase
          .from("orders")
          .select("id, order_number, status, total_amount, customer_email")
          .eq("provider", "yampi")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentOrder) {
          setOrder(recentOrder as OrderInfo);
          setLoading(false);
          return;
        }
      }

      if (attempts < MAX_ATTEMPTS) {
        setTimeout(() => setAttempts((a) => a + 1), 3000);
      } else {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [sessionId, attempts, order]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);

  return (
    <StoreLayout>
      <div className="container-custom py-16 max-w-lg mx-auto text-center">
        {loading ? (
          <div className="space-y-4">
            <Clock className="h-16 w-16 mx-auto text-primary animate-pulse" />
            <h1 className="text-2xl font-bold">Aguardando confirmação...</h1>
            <p className="text-muted-foreground">
              Estamos processando seu pagamento. Isso pode levar alguns segundos.
            </p>
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : order ? (
          <div className="space-y-6">
            <CheckCircle className="h-16 w-16 mx-auto text-primary" />
            <h1 className="text-2xl font-bold">Pedido Confirmado!</h1>
            <div className="border rounded-lg p-6 space-y-3 text-left">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pedido</span>
                <span className="font-mono font-semibold">{order.order_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold">{formatPrice(order.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="capitalize font-medium text-primary">
                  {order.status === "processing" ? "Em processamento" : order.status}
                </span>
              </div>
              {order.customer_email && (
                <p className="text-sm text-muted-foreground pt-2 border-t">
                  Enviamos os detalhes para <strong>{order.customer_email}</strong>
                </p>
              )}
            </div>
            <div className="flex gap-3 justify-center">
              <Button asChild>
                <Link to="/">Continuar Comprando</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/rastreio">
                  <Package className="h-4 w-4 mr-2" />
                  Rastrear Pedido
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <CheckCircle className="h-16 w-16 mx-auto text-primary" />
            <h1 className="text-2xl font-bold">Obrigado pela sua compra!</h1>
            <p className="text-muted-foreground">
              Seu pagamento está sendo processado. Você receberá uma confirmação em breve.
            </p>
            <Button asChild>
              <Link to="/">Voltar à Loja</Link>
            </Button>
          </div>
        )}
      </div>
    </StoreLayout>
  );
}
