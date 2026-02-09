import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { StoreLayout } from '@/components/store/StoreLayout';
import { ProductGrid } from '@/components/store/ProductGrid';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/database';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function SizePage() {
  const { size } = useParams<{ size: string }>();
  const [sortBy, setSortBy] = useState('newest');

  const { data: products, isLoading } = useQuery({
    queryKey: ['products-by-size', size],
    queryFn: async () => {
      // Get product IDs that have this size variant in stock
      const { data: variants, error: varError } = await supabase
        .from('product_variants')
        .select('product_id')
        .eq('size', size!)
        .eq('is_active', true)
        .gt('stock_quantity', 0);

      if (varError) throw varError;
      if (!variants || variants.length === 0) return [];

      const productIds = [...new Set(variants.map(v => v.product_id))];

      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          category:categories(*),
          images:product_images(*),
          variants:product_variants(*)
        `)
        .eq('is_active', true)
        .in('id', productIds);

      if (error) throw error;
      return data as Product[];
    },
    enabled: !!size,
  });

  const sortedProducts = useMemo(() => {
    if (!products) return [];
    const result = [...products];
    switch (sortBy) {
      case 'price-asc':
        result.sort((a, b) => Number(a.sale_price || a.base_price) - Number(b.sale_price || b.base_price));
        break;
      case 'price-desc':
        result.sort((a, b) => Number(b.sale_price || b.base_price) - Number(a.sale_price || a.base_price));
        break;
      case 'name-asc':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return result;
  }, [products, sortBy]);

  return (
    <StoreLayout>
      <div className="bg-muted/30 py-3">
        <div className="container-custom">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary">Home</Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground">Tamanho {size}</span>
          </nav>
        </div>
      </div>

      <div className="bg-muted/30 py-8">
        <div className="container-custom">
          <h1 className="text-3xl font-bold">Tamanho {size}</h1>
          <p className="text-muted-foreground mt-2">
            {sortedProducts.length} produto{sortedProducts.length !== 1 ? 's' : ''} disponíve{sortedProducts.length !== 1 ? 'is' : 'l'} no tamanho {size}
          </p>
        </div>
      </div>

      <div className="container-custom py-8">
        <div className="flex justify-end mb-6">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Mais recentes</SelectItem>
              <SelectItem value="price-asc">Menor preço</SelectItem>
              <SelectItem value="price-desc">Maior preço</SelectItem>
              <SelectItem value="name-asc">A-Z</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ProductGrid products={sortedProducts} isLoading={isLoading} />

        {!isLoading && sortedProducts.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-muted-foreground">Nenhum produto encontrado no tamanho {size}.</p>
          </div>
        )}
      </div>
    </StoreLayout>
  );
}
