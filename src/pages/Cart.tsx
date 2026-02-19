import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Minus, Plus, ShoppingBag, ArrowLeft, Truck, AlertTriangle } from 'lucide-react';
import { StoreLayout } from '@/components/store/StoreLayout';
import { Button } from '@/components/ui/button';
import { useCart } from '@/contexts/CartContext';
import { ShippingCalculator } from '@/components/store/ShippingCalculator';
import { CouponInput } from '@/components/store/CouponInput';
import { CartProductSuggestions } from '@/components/store/CartProductSuggestions';
import { supabase } from '@/integrations/supabase/client';
import { useStoreSettings } from '@/hooks/useProducts';
import { useQuery } from '@tanstack/react-query';
import { usePricingConfig } from '@/hooks/usePricingConfig';
import { getInstallmentDisplay, formatCurrency } from '@/lib/pricingEngine';
import { HelpHint } from '@/components/HelpHint';

export default function Cart() {
  const { items, subtotal, removeItem, updateQuantity, clearCart, discount, selectedShipping, setSelectedShipping, total } = useCart();
  const { data: pricingConfig } = usePricingConfig();

  // Fetch fresh stock data for cart items
  const { data: freshStockData } = useQuery({
    queryKey: ['cart-stock', items.map(i => i.variant.id).join(',')],
    queryFn: async () => {
      const variantIds = items.map(i => i.variant.id);
      if (variantIds.length === 0) return new Map<string, { stock_quantity: number; is_active: boolean | null }>();
      const { data } = await supabase
        .from('product_variants')
        .select('id, stock_quantity, is_active')
        .in('id', variantIds);
      return new Map(data?.map(v => [v.id, v]) || []);
    },
    enabled: items.length > 0,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const { data: storeSettings } = useStoreSettings();
  const freeShippingThreshold = storeSettings?.free_shipping_threshold ?? 399;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  };

  const remainingForFreeShipping = freeShippingThreshold - subtotal;
  const hasFreeShipping = subtotal >= freeShippingThreshold;

  if (items.length === 0) {
    return (
      <StoreLayout>
        <div className="container-custom py-16 text-center">
          <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Seu carrinho está vazio</h1>
          <p className="text-muted-foreground mb-6">Adicione produtos ao carrinho para continuar</p>
          <Button asChild>
            <Link to="/">Continuar Comprando</Link>
          </Button>
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      <div className="container-custom py-8">
        <div className="flex items-center gap-2 sm:gap-4 mb-6 sm:mb-8">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-lg sm:text-2xl font-bold">Carrinho de Compras</h1>
          <HelpHint helpKey="store.cart" />
          <span className="text-muted-foreground text-sm">({items.length} {items.length === 1 ? 'item' : 'itens'})</span>
        </div>

        {/* Free shipping progress */}
        <div className="bg-muted/50 rounded-lg p-4 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="h-5 w-5 text-primary" />
            {hasFreeShipping ? (
              <span className="text-primary font-medium">Parabéns! Você ganhou frete grátis!</span>
            ) : (
              <span className="text-muted-foreground">
                Faltam <span className="font-bold text-foreground">{formatPrice(remainingForFreeShipping)}</span> para frete grátis
              </span>
            )}
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-primary h-2.5 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.min((subtotal / freeShippingThreshold) * 100, 100)}%` }}
            />
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart items */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => {
              const freshStock = freshStockData?.get(item.variant.id);
              const currentStock = freshStock?.stock_quantity ?? item.variant.stock_quantity;
              const isActive = freshStock?.is_active ?? true;
              const stockInsufficient = currentStock < item.quantity;

              return (
              <div key={item.variant.id} className={`flex gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg ${!isActive ? 'opacity-60' : ''}`}>
                <Link to={`/produto/${item.product.slug}`}>
                  <img
                    src={item.product.images?.[0]?.url || '/placeholder.svg'}
                    alt={item.product.name}
                    className="w-24 h-24 md:w-32 md:h-32 object-cover rounded-lg"
                  />
                </Link>
                <div className="flex-1">
                  <div className="flex justify-between">
                    <div>
                      <Link to={`/produto/${item.product.slug}`} className="font-medium hover:text-primary transition-colors">
                        {item.product.name}
                      </Link>
                      <p className="text-sm text-muted-foreground">Tamanho: {item.variant.size}</p>
                      {item.variant.color && (
                        <p className="text-sm text-muted-foreground">Cor: {item.variant.color}</p>
                      )}
                      {!isActive && (
                        <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3" /> Produto indisponível
                        </p>
                      )}
                      {isActive && stockInsufficient && (
                        <p className="text-xs text-orange-600 flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3" /> Estoque reduzido para {currentStock} un.
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(item.variant.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center border rounded-lg">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item.variant.id, item.quantity - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-10 text-center">{item.quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={item.quantity >= currentStock || !isActive}
                        onClick={() => updateQuantity(item.variant.id, Math.min(item.quantity + 1, currentStock))}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="text-right">
                      {item.product.sale_price && (
                        <p className="text-sm text-muted-foreground line-through">
                          {formatPrice(Number(item.product.base_price) * item.quantity)}
                        </p>
                      )}
                      <p className="font-bold text-lg">
                        {formatPrice(Number(item.product.sale_price || item.product.base_price) * item.quantity)}
                      </p>
                      <p className="text-xs text-muted-foreground">{currentStock} disponível(is)</p>
                    </div>
                  </div>
                </div>
              </div>
              );
            })}

            <Button variant="ghost" className="text-destructive" onClick={clearCart}>
              Limpar carrinho
            </Button>

            {/* Product suggestions */}
            <div className="pt-4 border-t">
              <CartProductSuggestions />
            </div>
          </div>

          {/* Order summary */}
          <div className="lg:col-span-1">
            <div className="border rounded-lg p-6 sticky top-32 space-y-4">
              <h2 className="font-bold text-lg">Resumo do Pedido</h2>

              {/* Shipping calculator */}
              <ShippingCalculator compact />

              {/* Coupon */}
              <CouponInput compact />

              <div className="border-t pt-4 space-y-2">
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
                    <span>Frete ({selectedShipping.name})</span>
                    <span>{selectedShipping.price === 0 ? 'Grátis' : formatPrice(selectedShipping.price)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t">
                  <span>Total</span>
                  <span className="animate-price-update" key={total.toFixed(2)}>{formatPrice(total)}</span>
                </div>
                {(() => {
                  const display = pricingConfig ? getInstallmentDisplay(total, pricingConfig) : null;
                  return display ? (
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-foreground/80">{display.primaryText}</p>
                      {display.secondaryText && (
                        <p className="text-xs text-muted-foreground">{display.secondaryText}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">até 6x sem juros</p>
                  );
                })()}
              </div>

              <Button asChild className="w-full" size="lg" disabled={!selectedShipping}>
                <Link to={selectedShipping ? "/checkout" : "#"} onClick={(e) => { if (!selectedShipping) e.preventDefault(); }}>
                  {selectedShipping ? 'Finalizar Compra' : 'Calcule o frete primeiro'}
                </Link>
              </Button>

              <Button asChild variant="outline" className="w-full">
                <Link to="/">Continuar Comprando</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}
