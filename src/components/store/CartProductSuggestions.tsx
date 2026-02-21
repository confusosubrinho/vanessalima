import { Link } from 'react-router-dom';
import { useProducts } from '@/hooks/useProducts';
import { useCart } from '@/contexts/CartContext';
import { Product } from '@/types/database';
import { ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { VariantSelectorModal } from './VariantSelectorModal';
import { useStoreContact } from '@/hooks/useStoreContact';
import { resolveImageUrl } from '@/lib/imageUrl';

interface CartProductSuggestionsProps {
  compact?: boolean;
}

export function CartProductSuggestions({ compact = false }: CartProductSuggestionsProps) {
  const { subtotal, items } = useCart();
  const { data: allProducts } = useProducts();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { data: storeSettings } = useStoreContact();

  const FREE_SHIPPING_THRESHOLD = (storeSettings as any)?.free_shipping_threshold ?? 399;
  const hasFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  const remaining = FREE_SHIPPING_THRESHOLD - subtotal;

  const cartProductIds = new Set(items.map(i => i.product.id));

  // Filter out products already in cart
  const available = (allProducts || []).filter(
    p => !cartProductIds.has(p.id) && p.is_active && (p.variants?.some(v => v.is_active && v.stock_quantity > 0))
  );

  let suggested: Product[] = [];

  if (!hasFreeShipping && remaining > 0) {
    // Sort by price closest to remaining amount (prefer products that complete free shipping)
    suggested = [...available]
      .map(p => ({
        product: p,
        price: Number(p.sale_price || p.base_price),
        diff: Math.abs(Number(p.sale_price || p.base_price) - remaining),
      }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 4)
      .map(x => x.product);
  } else {
    // Show best sellers (featured products)
    suggested = available
      .filter(p => p.is_featured)
      .slice(0, 4);
    if (suggested.length < 4) {
      const ids = new Set(suggested.map(s => s.id));
      const more = available.filter(p => !ids.has(p.id)).slice(0, 4 - suggested.length);
      suggested = [...suggested, ...more];
    }
  }

  if (suggested.length === 0) return null;

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-center">
        {!hasFreeShipping ? (
          <p>
            Adicione mais <span className="text-primary font-bold">{formatPrice(remaining)}</span> para frete grátis! 🚚
          </p>
        ) : (
          <p className="text-muted-foreground">Você também pode gostar:</p>
        )}
      </div>

      <div className={compact ? 'flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x' : `grid grid-cols-2 md:grid-cols-4 gap-2`}>
        {suggested.map(product => {
          const img = product.images?.find(i => i.is_primary) || product.images?.[0];
          const price = Number(product.sale_price || product.base_price);
          return (
            <div key={product.id} className={`border rounded-lg overflow-hidden bg-background group ${compact ? 'flex-shrink-0 w-[120px] snap-start' : ''}`}>
              <Link to={`/produto/${product.slug}`} className="block">
                <div className="aspect-square overflow-hidden bg-muted">
                  <img
                    src={resolveImageUrl(img?.url)}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
              </Link>
              <div className="p-1.5">
                <p className="text-[10px] font-medium line-clamp-1">{product.name}</p>
                <p className="text-[10px] font-bold text-primary mt-0.5">{formatPrice(price)}</p>
                <button
                  onClick={() => setSelectedProduct(product)}
                  className="w-full mt-1 flex items-center justify-center gap-1 text-[10px] bg-primary text-primary-foreground py-1 rounded hover:bg-primary/90 transition-colors"
                >
                  <ShoppingBag className="h-2.5 w-2.5" />
                  Adicionar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selectedProduct && (
        <VariantSelectorModal
          product={selectedProduct}
          open={!!selectedProduct}
          onOpenChange={(open) => !open && setSelectedProduct(null)}
        />
      )}
    </div>
  );
}
