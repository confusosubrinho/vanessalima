import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { resolveImageUrl } from '@/lib/imageUrl';
import { useSearchPreviewProducts } from '@/hooks/useProducts';

const DEBOUNCE_MS = 400;

interface SearchPreviewProps {
  onSearch: (query: string) => void;
  onFocus?: () => void;
  className?: string;
}

export function SearchPreview({ onSearch, onFocus, className }: SearchPreviewProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (query.trim().length < 2) {
      setDebouncedQuery('');
      return;
    }
    const t = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isLoading, isFetched } = useSearchPreviewProducts(debouncedQuery);

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
    if (debouncedQuery && isFetched) setIsOpen(true);
    if (query.length < 2) setIsOpen(false);
  }, [debouncedQuery, isFetched, query.length]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [results]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
      setIsOpen(false);
    }
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case 'Enter':
        if (highlightedIndex >= 0 && highlightedIndex < results.length) {
          e.preventDefault();
          const product = results[highlightedIndex];
          setIsOpen(false);
          setQuery('');
          navigate(`/produto/${product.slug}`);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  }, [isOpen, results, highlightedIndex, navigate]);

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
            onFocus={() => {
              if (query.length >= 2 && results.length > 0) setIsOpen(true);
              onFocus?.();
            }}
            onKeyDown={handleKeyDown}
            className="w-full h-12 pl-5 pr-12 text-base rounded-full border-2 border-muted bg-muted/50 focus:bg-background focus:border-primary"
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            aria-activedescendant={highlightedIndex >= 0 ? `search-result-${highlightedIndex}` : undefined}
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setIsOpen(false);
              }}
              className="absolute right-12 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
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
        <div className="absolute top-full left-0 right-0 mt-2 bg-background border rounded-lg shadow-xl z-50 max-h-[400px] overflow-y-auto" role="listbox">
          <div className="p-2">
            {results.map((product, index) => {
              const primaryImage = product.images?.find(img => img.is_primary) || product.images?.[0];
              const hasDiscount = product.sale_price && product.sale_price < product.base_price;

              return (
                <Link
                  key={product.id}
                  id={`search-result-${index}`}
                  to={`/produto/${product.slug}`}
                  onClick={() => {
                    setIsOpen(false);
                    setQuery('');
                  }}
                  className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                    index === highlightedIndex ? 'bg-accent' : 'hover:bg-muted'
                  }`}
                  role="option"
                  aria-selected={index === highlightedIndex}
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
