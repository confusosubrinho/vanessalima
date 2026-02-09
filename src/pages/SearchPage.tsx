import { useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { StoreLayout } from '@/components/store/StoreLayout';
import { ProductGrid } from '@/components/store/ProductGrid';
import { useProducts } from '@/hooks/useProducts';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const { data: products, isLoading } = useProducts();

  const filteredProducts = useMemo(() => {
    if (!products || !query) return [];
    const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return products.filter(p => {
      const name = p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const desc = (p.description || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return name.includes(q) || desc.includes(q);
    });
  }, [products, query]);

  return (
    <StoreLayout>
      <div className="bg-muted/30 py-3">
        <div className="container-custom">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary">Home</Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground">Busca: "{query}"</span>
          </nav>
        </div>
      </div>

      <div className="container-custom py-8">
        <h1 className="text-2xl font-bold mb-2">
          Resultados para "{query}"
        </h1>
        <p className="text-muted-foreground mb-6">
          {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''} encontrado{filteredProducts.length !== 1 ? 's' : ''}
        </p>

        <ProductGrid products={filteredProducts} isLoading={isLoading} />

        {!isLoading && filteredProducts.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-muted-foreground">Nenhum produto encontrado para "{query}".</p>
          </div>
        )}
      </div>
    </StoreLayout>
  );
}