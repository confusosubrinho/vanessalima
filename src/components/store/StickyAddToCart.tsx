import { useState } from 'react';
import { ShoppingBag, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/pricingEngine';

interface StickyAddToCartProps {
  productName: string;
  currentPrice: number;
  isInStock: boolean;
  hasSelectedVariant: boolean;
  needsColor: boolean;
  needsSize: boolean;
  onAddToCart: () => void;
  onScrollToVariant: () => void;
  visible: boolean;
}

export function StickyAddToCart({
  productName,
  currentPrice,
  isInStock,
  hasSelectedVariant,
  needsColor,
  needsSize,
  onAddToCart,
  onScrollToVariant,
  visible,
}: StickyAddToCartProps) {
  const [confirmed, setConfirmed] = useState(false);

  if (!visible) return null;

  const handleClick = () => {
    if (!hasSelectedVariant) {
      onScrollToVariant();
      return;
    }
    // First click: scroll to variants to confirm; second click: add to cart
    if (!confirmed) {
      onScrollToVariant();
      setConfirmed(true);
      // Reset after 8s so they need to confirm again if they scroll away
      setTimeout(() => setConfirmed(false), 8000);
      return;
    }
    onAddToCart();
    setConfirmed(false);
  };

  const missingLabel = needsSize && needsColor
    ? 'Selecione cor e tamanho'
    : needsSize
    ? 'Selecione o tamanho'
    : needsColor
    ? 'Selecione a cor'
    : '';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.08)] safe-area-pb animate-slide-up md:hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{productName}</p>
          <p className="text-base font-bold text-foreground">{formatCurrency(currentPrice)}</p>
        </div>
        <Button
          onClick={handleClick}
          disabled={!isInStock}
          className="rounded-full h-12 px-5 text-sm font-semibold shrink-0"
        >
          {!isInStock
            ? 'Indisponível'
            : !hasSelectedVariant
            ? missingLabel || 'Selecionar'
            : confirmed
            ? <><Check className="h-4 w-4 mr-1.5" />Confirmar</>
            : <><ShoppingBag className="h-4 w-4 mr-1.5" />Comprar</>}
        </Button>
      </div>
    </div>
  );
}
