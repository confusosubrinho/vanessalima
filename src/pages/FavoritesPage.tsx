import { Link } from 'react-router-dom';
import { StoreLayout } from '@/components/store/StoreLayout';
import { useProducts } from '@/hooks/useProducts';
import { useFavorites } from '@/hooks/useFavorites';
import { ProductCard } from '@/components/store/ProductCard';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function FavoritesPage() {
  const { favorites, isAuthenticated } = useFavorites();
  const { data: allProducts } = useProducts();

  const favoriteProducts = allProducts?.filter(p => favorites.includes(p.id)) || [];

  return (
    <StoreLayout>
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
