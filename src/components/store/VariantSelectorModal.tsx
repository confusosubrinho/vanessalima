import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Product, ProductVariant } from '@/types/database';
import { useCart } from '@/contexts/CartContext';
import { ShoppingBag, Bell } from 'lucide-react';
import { StockNotifyModal } from './StockNotifyModal';
import { resolveImageUrl } from '@/lib/imageUrl';
import { usePricingConfig } from '@/hooks/usePricingConfig';
import { getInstallmentDisplay, formatCurrency as fmtCurrency } from '@/lib/pricingEngine';
import { useToast } from '@/hooks/use-toast';

interface VariantSelectorModalProps {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VariantSelectorModal({ product, open, onOpenChange }: VariantSelectorModalProps) {
  const { addItem } = useCart();
  const { data: pricingConfig } = usePricingConfig();
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [notifyVariant, setNotifyVariant] = useState<ProductVariant | null>(null);

  const activeVariants = product.variants?.filter(v => v.is_active) || [];

  // Extract unique colors
  const colors = useMemo(() => {
    const colorSet = new Map<string, ProductVariant>();
    activeVariants.forEach(v => {
      if (v.color && !colorSet.has(v.color)) {
        colorSet.set(v.color, v);
      }
    });
    return Array.from(colorSet.entries()).map(([color, variant]) => ({ color, variant }));
  }, [activeVariants]);

  const hasColors = colors.length > 1;

  // Auto-select first color if only one exists
  const effectiveColor = hasColors ? selectedColor : (colors[0]?.color ?? null);

  // Filter sizes by selected color
  const filteredVariants = effectiveColor
    ? activeVariants.filter(v => v.color === effectiveColor)
    : activeVariants;

  const sizes = filteredVariants
    .map(v => ({ size: v.size, variant: v }))
    .filter((v, i, arr) => arr.findIndex(a => a.size === v.size) === i)
    .sort((a, b) => {
      const numA = parseFloat(a.size);
      const numB = parseFloat(b.size);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.size.localeCompare(b.size);
    });

  const primaryImage = product.images?.find(img => img.is_primary) || product.images?.[0];
  const currentPrice = Number(product.sale_price || product.base_price);
  const hasDiscount = product.sale_price && product.sale_price < product.base_price;

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

  const handleAdd = () => {
    if (!selectedVariant) return;
    addItem(product, selectedVariant, 1);
    onOpenChange(false);
    setSelectedVariant(null);
    setSelectedColor(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedVariant(null);
      setSelectedColor(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{hasColors ? 'Selecione cor e tamanho' : 'Selecione o tamanho'}</DialogTitle>
          <DialogDescription>Escolha uma opção para adicionar ao carrinho</DialogDescription>
        </DialogHeader>
        <div className="flex gap-4 items-start">
          <img
            src={resolveImageUrl(primaryImage?.url)}
            alt={product.name}
            className="w-20 h-20 object-cover rounded"
          />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm line-clamp-2">{product.name}</p>
            <div className="mt-1">
              {hasDiscount ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground line-through text-xs">{formatPrice(Number(product.base_price))}</span>
                  <span className="font-bold text-primary">{formatPrice(currentPrice)}</span>
                </div>
              ) : (
                <span className="font-bold">{formatPrice(currentPrice)}</span>
              )}
              {pricingConfig && (() => {
                const hasSale = !!(product.sale_price && product.sale_price < product.base_price);
                const pixDiscount = pricingConfig.pix_discount || 0;
                const showPix = pixDiscount > 0 && (!hasSale || pricingConfig.pix_discount_applies_to_sale_products !== false);
                const pixPrice = showPix ? currentPrice * (1 - pixDiscount / 100) : null;
                const display = getInstallmentDisplay(currentPrice, pricingConfig, hasSale);
                return (
                  <div className="space-y-0.5">
                    {pixPrice && (
                      <p className="text-xs text-primary font-medium">
                        {formatPrice(pixPrice)} no PIX
                      </p>
                    )}
                    {display?.primaryText && (
                      <p className="text-xs text-muted-foreground">{display.primaryText}</p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Color selector */}
        {hasColors && (
          <div className="mt-2">
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Cor{selectedColor ? `: ${selectedColor}` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              {colors.map(({ color }) => {
                const isSelected = selectedColor === color;
                return (
                  <button
                    key={color}
                    onClick={() => {
                      setSelectedColor(color);
                      setSelectedVariant(null);
                    }}
                    className={`h-9 px-3 rounded border text-sm font-medium transition-all ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:border-primary'
                    }`}
                  >
                    {color}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Size selector */}
        {(!hasColors || selectedColor) && (
          <div className="mt-2">
            {hasColors && <p className="text-sm font-medium text-muted-foreground mb-2">Tamanho</p>}
            <div className="grid grid-cols-4 gap-2">
              {sizes.map(({ size, variant }) => {
                const inStock = variant.stock_quantity > 0;
                const isSelected = selectedVariant?.id === variant.id;
                return (
                  <button
                    key={variant.id}
                    id={`btn-variant-select-${variant.id}`}
                    onClick={() => {
                      if (inStock) {
                        setSelectedVariant(variant);
                      } else {
                        setNotifyVariant(variant);
                        setNotifyModalOpen(true);
                      }
                    }}
                    className={`h-10 rounded border text-sm font-medium transition-all ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : inStock
                        ? 'border-border hover:border-primary'
                        : 'border-border/50 text-muted-foreground opacity-60 hover:border-primary/50'
                    }`}
                  >
                    <span className={!inStock ? 'line-through' : ''}>{size}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Button
          id="btn-variant-add-to-cart"
          onClick={handleAdd}
          disabled={!selectedVariant}
          className="w-full mt-2"
          size="lg"
        >
          <ShoppingBag className="h-4 w-4 mr-2" />
          Adicionar ao Carrinho
        </Button>
      </DialogContent>

      <StockNotifyModal
        open={notifyModalOpen}
        onOpenChange={setNotifyModalOpen}
        productId={product.id}
        productName={product.name}
        variantId={notifyVariant?.id}
        variantInfo={notifyVariant ? `${notifyVariant.size}${notifyVariant.color ? ' - ' + notifyVariant.color : ''}` : undefined}
        currentPrice={currentPrice}
      />
    </Dialog>
  );
}
