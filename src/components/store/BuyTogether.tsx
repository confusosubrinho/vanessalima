import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Check, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/hooks/use-toast';
import { Product } from '@/types/database';

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
    <section className="py-8 bg-muted/30">
      <div className="container-custom">
        <h2 className="text-2xl font-bold text-center mb-2">Compre Junto</h2>
        <p className="text-center text-muted-foreground mb-8">Ganhe {discountPercent}% de desconto comprando juntos</p>
        
        <div className="flex flex-col lg:flex-row items-center justify-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-4">
            {allProducts.map((product, index) => {
              const primaryImage = product.images?.find(img => img.is_primary) || product.images?.[0];
              const isSelected = selectedProducts.has(product.id);
              const isCurrent = product.id === currentProduct.id;
              const price = Number(product.sale_price || product.base_price);

              return (
                <div key={product.id} className="flex items-center gap-4">
                  <button
                    onClick={() => toggleProduct(product.id)}
                    disabled={isCurrent}
                    className={`relative p-4 rounded-lg border-2 transition-all ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                    } ${isCurrent ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center ${
                      isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}>
                      {isSelected ? <Check className="h-4 w-4" /> : null}
                    </div>
                    <img src={primaryImage?.url || '/placeholder.svg'} alt={product.name} className="w-24 h-24 object-cover rounded-lg mb-2" />
                    <p className="text-sm font-medium line-clamp-2 text-center max-w-[120px]">{product.name}</p>
                    <p className="text-sm font-bold text-primary text-center mt-1">{formatPrice(price)}</p>
                  </button>
                  {index < allProducts.length - 1 && (
                    <Plus className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="lg:ml-8 text-center lg:text-left p-6 bg-background rounded-lg border shadow-sm">
            <p className="text-sm text-muted-foreground mb-1">
              {selectedItems.length} {selectedItems.length === 1 ? 'produto selecionado' : 'produtos selecionados'}
            </p>
            <div className="mb-4">
              <p className="text-sm line-through text-muted-foreground">{formatPrice(totalPrice)}</p>
              <p className="text-2xl font-bold text-primary">{formatPrice(discountedPrice)}</p>
              <p className="text-sm text-primary">Economize {formatPrice(savings)}</p>
            </div>
            <Button onClick={handleAddAll} className="w-full" size="lg">
              <ShoppingBag className="h-5 w-5 mr-2" />
              Adicionar Todos
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
