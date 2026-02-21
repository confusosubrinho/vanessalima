import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/database';
import { resolveImageUrl } from '@/lib/imageUrl';

interface SearchPreviewProps {
  onSearch: (query: string) => void;
  className?: string;
}

export function SearchPreview({ onSearch, className }: SearchPreviewProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const searchProducts = async () => {
      if (query.length < 2) {
        setResults([]);
        setIsOpen(false);
        return;
      }

      setIsLoading(true);
      try {
        // Escape special SQL LIKE characters to prevent query errors
        const sanitized = query.replace(/[%_\\]/g, '\\$&');
        const { data, error } = await supabase
          .from('products')
          .select(`
            *,
            images:product_images(*)
          `)
          .eq('is_active', true)
          .ilike('name', `%${sanitized}%`)
          .limit(6);

        if (error) throw error;
        setResults((data || []) as Product[]);
        setIsOpen(true);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    const debounce = setTimeout(searchProducts, 300);
    return () => clearTimeout(debounce);
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
      setIsOpen(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <form onSubmit={handleSubmit} className="w-full">
        <div className="relative w-full">
          <Input
            type="search"
            placeholder="O que deseja procurar?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.length >= 2 && results.length > 0 && setIsOpen(true)}
            className="w-full h-12 pl-5 pr-12 text-base rounded-full border-2 border-muted bg-muted/50 focus:bg-background focus:border-primary"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Search className="h-5 w-5" />
            )}
          </Button>
        </div>
      </form>

      {/* Search Results Preview */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-background border rounded-lg shadow-xl z-50 max-h-[400px] overflow-y-auto">
          <div className="p-2">
            {results.map((product) => {
              const primaryImage = product.images?.find(img => img.is_primary) || product.images?.[0];
              const hasDiscount = product.sale_price && product.sale_price < product.base_price;

              return (
                <Link
                  key={product.id}
                  to={`/produto/${product.slug}`}
                  onClick={() => {
                    setIsOpen(false);
                    setQuery('');
                  }}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <img
                    src={resolveImageUrl(primaryImage?.url)}
                    alt={product.name}
                    className="w-14 h-14 rounded-lg object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm line-clamp-1">{product.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {hasDiscount ? (
                        <>
                          <span className="text-xs line-through text-muted-foreground">
                            {formatPrice(Number(product.base_price))}
                          </span>
                          <span className="text-sm font-bold text-primary">
                            {formatPrice(Number(product.sale_price))}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm font-medium">
                          {formatPrice(Number(product.base_price))}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="border-t p-2">
            <Button
              variant="ghost"
              className="w-full justify-center text-primary"
              onClick={() => {
                onSearch(query);
                setIsOpen(false);
              }}
            >
              Ver todos os resultados para "{query}"
            </Button>
          </div>
        </div>
      )}

      {isOpen && query.length >= 2 && results.length === 0 && !isLoading && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-background border rounded-lg shadow-xl z-50 p-4 text-center text-muted-foreground">
          Nenhum produto encontrado para "{query}"
        </div>
      )}
    </div>
  );
}
