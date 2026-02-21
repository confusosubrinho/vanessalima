import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Product, ProductVariant } from '@/types/database';
import { useCart } from '@/contexts/CartContext';
import { ShoppingBag, Check, Bell } from 'lucide-react';
import { StockNotifyModal } from './StockNotifyModal';
import { resolveImageUrl } from '@/lib/imageUrl';

interface VariantSelectorModalProps {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VariantSelectorModal({ product, open, onOpenChange }: VariantSelectorModalProps) {
  const { addItem } = useCart();
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [notifyVariant, setNotifyVariant] = useState<ProductVariant | null>(null);

  const activeVariants = product.variants?.filter(v => v.is_active) || [];
  const sizes = activeVariants
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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Selecione o tamanho</DialogTitle>
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
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mt-2">
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
