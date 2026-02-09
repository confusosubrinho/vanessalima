import { useState } from 'react';
import { StoreLayout } from '@/components/store/StoreLayout';
import { ProductCard } from '@/components/store/ProductCard';
import { useProducts } from '@/hooks/useProducts';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function BestSellersPage() {
  const { data: products, isLoading } = useProducts();
  const [filter, setFilter] = useState<'bestsellers' | 'new'>('bestsellers');

  // Mais vendidos = featured products (proxy)
  const bestSellers = products?.filter(p => p.is_featured) || [];
  // Novidades = newest products by created_at
  const newProducts = products
    ?.slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20) || [];

  const displayProducts = filter === 'bestsellers' ? bestSellers : newProducts;

  return (
    <StoreLayout>
      <div className="container-custom py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Mais Vendidos & Novidades</h1>
          <p className="text-muted-foreground">Os modelos mais amados e as últimas novidades da loja</p>
        </div>

        <div className="flex justify-center mb-8">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList>
              <TabsTrigger value="bestsellers">🔥 Mais Vendidos</TabsTrigger>
              <TabsTrigger value="new">✨ Novidades</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-square bg-muted rounded-lg mb-3" />
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : displayProducts.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {displayProducts.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-12">Nenhum produto encontrado.</p>
        )}
      </div>
    </StoreLayout>
  );
}
