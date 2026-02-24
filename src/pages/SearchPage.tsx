import { useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronRight, Search } from 'lucide-react';
import { StoreLayout } from '@/components/store/StoreLayout';
import { ProductGrid } from '@/components/store/ProductGrid';
import { useSearchProducts } from '@/hooks/useProducts';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const trimmed = query.trim();
  const { data: products = [], isLoading } = useSearchProducts(trimmed);

  return (
    <StoreLayout>
      <Helmet>
        <title>{trimmed ? `Busca: ${query} | Loja` : 'Busca | Loja'}</title>
        {trimmed && <meta name="description" content={`Resultados da busca por "${query}".`} />}
      </Helmet>
      <div className="bg-muted/30 py-3">
        <div className="container-custom">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary">Home</Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground">{trimmed ? `Busca: "${query}"` : 'Busca'}</span>
          </nav>
        </div>
      </div>

      <div className="container-custom py-8">
        {!trimmed ? (
          <div className="py-16 text-center">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-xl font-semibold mb-2">Encontre produtos</h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Digite algo na busca (menu ou URL <code className="text-xs bg-muted px-1 rounded">/busca?q=...</code>) para ver os resultados.
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-2">
              Resultados para &quot;{query}&quot;
            </h1>
            <p className="text-muted-foreground mb-6">
              {products.length} produto{products.length !== 1 ? 's' : ''} encontrado{products.length !== 1 ? 's' : ''}
            </p>

            <ProductGrid products={products} isLoading={isLoading} />

            {!isLoading && products.length === 0 && (
              <div className="py-16 text-center">
                <p className="text-muted-foreground">Nenhum produto encontrado para &quot;{query}&quot;.</p>
              </div>
            )}
          </>
        )}
      </div>
    </StoreLayout>
  );
}