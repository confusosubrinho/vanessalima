import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProducts, useCategories } from '@/hooks/useProducts';
import { Product } from '@/types/database';
import { ProductCard } from './ProductCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function BijuteriasSection() {
  const { data: categories } = useCategories();
  const { data: allProducts, isLoading } = useProducts();
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // Find bijuterias category
  const bijuteriasCategory = categories?.find(
    c => c.slug === 'bijuterias' || c.name.toLowerCase().includes('bijuteria')
  );

  if (!bijuteriasCategory) return null;

  // Get products in bijuterias category
  const bijuProducts = (allProducts || []).filter(
    p => p.category_id === bijuteriasCategory.id && p.is_active
  );

  if (bijuProducts.length === 0) return null;

  // Get unique subcategory-like filters from product names/characteristics
  const filters = [
    { key: 'all', label: 'Todos' },
    { key: 'brinco', label: 'Brincos' },
    { key: 'colar', label: 'Colares' },
    { key: 'pulseira', label: 'Pulseiras' },
    { key: 'anel', label: 'Anéis' },
  ];

  const filtered = activeFilter === 'all'
    ? bijuProducts
    : bijuProducts.filter(p => p.name.toLowerCase().includes(activeFilter));

  const displayProducts = filtered.slice(0, 8);

  return (
    <section className="py-12">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold">Bijuterias</h2>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">Acessórios para completar seu look</p>
          </div>
          <Button asChild variant="outline" size="sm" className="sm:size-default">
            <Link to="/bijuterias">Ver todas</Link>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4 sm:mb-6 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeFilter === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="animate-pulse">
                <div className="aspect-square bg-muted rounded-lg mb-3" />
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : displayProducts.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum produto encontrado neste filtro</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {displayProducts.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
