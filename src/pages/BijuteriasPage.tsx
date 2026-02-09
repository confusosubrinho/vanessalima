import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Gem } from 'lucide-react';
import { StoreLayout } from '@/components/store/StoreLayout';
import { ProductGrid } from '@/components/store/ProductGrid';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/database';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

export default function BijuteriasPage() {
  const [sortBy, setSortBy] = useState('newest');

  const { data: products, isLoading } = useQuery({
    queryKey: ['bijuterias-products'],
    queryFn: async () => {
      // Find the bijuterias category
      const { data: category } = await supabase
        .from('categories')
        .select('id')
        .ilike('slug', '%bijuteria%')
        .single();

      let query = supabase
        .from('products')
        .select(`
          *,
          category:categories(*),
          images:product_images(*),
          variants:product_variants(*)
        `)
        .eq('is_active', true);

      if (category) {
        query = query.eq('category_id', category.id);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data as Product[];
    },
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
      case 'sale':
        result.sort((a, b) => {
          const aDiscount = a.sale_price ? (1 - a.sale_price / a.base_price) : 0;
          const bDiscount = b.sale_price ? (1 - b.sale_price / b.base_price) : 0;
          return bDiscount - aDiscount;
        });
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
            <span className="text-foreground">Bijuterias</span>
          </nav>
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary/10 to-accent/10 py-12">
        <div className="container-custom text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Gem className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-2">Bijuterias</h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Acessórios que completam seu look com estilo e elegância
          </p>
          <div className="flex justify-center gap-2 mt-4">
            <Badge variant="outline" className="px-4 py-1">Anéis</Badge>
            <Badge variant="outline" className="px-4 py-1">Colares</Badge>
            <Badge variant="outline" className="px-4 py-1">Brincos</Badge>
            <Badge variant="outline" className="px-4 py-1">Pulseiras</Badge>
          </div>
        </div>
      </div>

      <div className="container-custom py-8">
        <div className="flex items-center justify-between mb-6">
          <p className="text-muted-foreground">
            {sortedProducts.length} produto{sortedProducts.length !== 1 ? 's' : ''}
          </p>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Mais recentes</SelectItem>
              <SelectItem value="price-asc">Menor preço</SelectItem>
              <SelectItem value="price-desc">Maior preço</SelectItem>
              <SelectItem value="name-asc">A-Z</SelectItem>
              <SelectItem value="sale">Maior desconto</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ProductGrid products={sortedProducts} isLoading={isLoading} />

        {!isLoading && sortedProducts.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-muted-foreground text-lg">Nenhuma bijuteria disponível no momento.</p>
            <p className="text-sm text-muted-foreground mt-1">Volte em breve para conferir as novidades!</p>
          </div>
        )}
      </div>
    </StoreLayout>
  );
}
