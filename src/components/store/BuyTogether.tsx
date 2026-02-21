import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Check, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/hooks/use-toast';
import { Product } from '@/types/database';
import { resolveImageUrl } from '@/lib/imageUrl';

interface BuyTogetherProps {
  currentProduct: Product;
  relatedProducts: Product[];
  discountPercent?: number;
}

export function BuyTogether({ currentProduct, relatedProducts, discountPercent = 5 }: BuyTogetherProps) {
  const { addItem } = useCart();
  const { toast } = useToast();
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set([currentProduct.id]));

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  };

  const toggleProduct = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (productId === currentProduct.id) return;
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const allProducts = [currentProduct, ...relatedProducts.slice(0, 2)];
  const selectedItems = allProducts.filter(p => selectedProducts.has(p.id));
  const totalPrice = selectedItems.reduce((sum, p) => sum + Number(p.sale_price || p.base_price), 0);
  const discountedPrice = totalPrice * (1 - discountPercent / 100);
  const savings = totalPrice - discountedPrice;

  const handleAddAll = () => {
    let addedCount = 0;
    selectedItems.forEach(product => {
      const variant = product.variants?.find(v => v.is_active && v.stock_quantity > 0);
      if (variant) {
        addItem(product, variant, 1);
        addedCount++;
      }
    });
    if (addedCount > 0) {
      toast({ title: 'Produtos adicionados!', description: `${addedCount} produto(s) adicionado(s) ao carrinho.` });
    } else {
      toast({ title: 'Selecione os tamanhos', description: 'Adicione cada produto individualmente selecionando o tamanho.', variant: 'destructive' });
    }
  };

  if (relatedProducts.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">🔥 Compre Junto</h3>
      <p className="text-sm text-muted-foreground">Ganhe {discountPercent}% de desconto comprando juntos</p>
      
      <div className="space-y-3">
        {allProducts.map((product, index) => {
          const primaryImage = product.images?.find(img => img.is_primary) || product.images?.[0];
          const isSelected = selectedProducts.has(product.id);
          const isCurrent = product.id === currentProduct.id;
          const price = Number(product.sale_price || product.base_price);

          return (
            <div key={product.id}>
              <button
                onClick={() => toggleProduct(product.id)}
                disabled={isCurrent}
                className={`relative w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                } ${isCurrent ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}>
                  {isSelected ? <Check className="h-3 w-3" /> : null}
                </div>
                <img src={resolveImageUrl(primaryImage?.url)} alt={product.name} className="w-14 h-14 object-cover rounded-md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">{product.name}</p>
                  <p className="text-sm font-bold text-primary">{formatPrice(price)}</p>
                </div>
              </button>
              {index < allProducts.length - 1 && (
                <div className="flex justify-center py-1">
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-4 bg-muted/50 rounded-lg text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          {selectedItems.length} {selectedItems.length === 1 ? 'produto selecionado' : 'produtos selecionados'}
        </p>
        <p className="text-sm line-through text-muted-foreground">{formatPrice(totalPrice)}</p>
        <p className="text-xl font-bold text-primary">{formatPrice(discountedPrice)}</p>
        <p className="text-xs text-primary">Economize {formatPrice(savings)}</p>
        <Button onClick={handleAddAll} className="w-full" size="sm">
          <ShoppingBag className="h-4 w-4 mr-2" />
          Adicionar Todos
        </Button>
      </div>
    </div>
  );
}
