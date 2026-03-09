import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { StoreLayout } from '@/components/store/StoreLayout';
import { useFavorites } from '@/hooks/useFavorites';
import { ProductCard } from '@/components/store/ProductCard';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/database';

export default function FavoritesPage() {
  const { favorites, isAuthenticated } = useFavorites();

  const { data: favoriteProducts = [], isLoading } = useQuery({
    queryKey: ['products', 'favorites', favorites],
    enabled: isAuthenticated && favorites.length > 0,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          category:categories(*),
          images:product_images(*),
          variants:product_variants(*)
        `)
        .in('id', favorites)
        .eq('is_active', true);
      if (error) throw error;
      return (data as Product[]) || [];
    },
  });

  return (
    <StoreLayout>
      <Helmet>
        <title>Meus Favoritos | Loja</title>
        <meta name="description" content="Veja seus produtos favoritos salvos." />
      </Helmet>
      <div className="container-custom py-8">
        <h1 className="text-2xl font-bold mb-6">Meus Favoritos</h1>

        {!isAuthenticated ? (
          <div className="text-center py-16 space-y-4">
            <Heart className="h-16 w-16 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">Faça login para ver seus favoritos</h2>
            <p className="text-muted-foreground">Crie sua conta para salvar produtos e acessá-los a qualquer momento.</p>
            <Button asChild>
              <Link to="/auth">Criar Conta / Entrar</Link>
            </Button>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : favoriteProducts.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <Heart className="h-16 w-16 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">Nenhum favorito ainda</h2>
            <p className="text-muted-foreground">Explore nossos produtos e toque no coração para salvar.</p>
            <Button asChild>
              <Link to="/">Explorar Produtos</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {favoriteProducts.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </StoreLayout>
  );
}
