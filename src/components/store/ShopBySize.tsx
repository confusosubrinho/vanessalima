import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';

export function ShopBySize() {
  const { data: sizes } = useQuery({
    queryKey: ['available-sizes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_variants')
        .select('size')
        .eq('is_active', true)
        .gt('stock_quantity', 0);
      
      if (error) throw error;
      
      const uniqueSizes = [...new Set(data.map(v => v.size))]
        .sort((a, b) => {
          const numA = parseFloat(a);
          const numB = parseFloat(b);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.localeCompare(b);
        });
      
      return uniqueSizes;
    },
  });

  if (!sizes || sizes.length === 0) return null;

  return (
    <section className="py-12">
      <div className="container-custom">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold">Compre por Tamanho</h2>
          <p className="text-muted-foreground mt-1">Encontre seu número perfeito</p>
        </div>

        <div className="flex gap-3 overflow-x-auto scrollbar-hide justify-start md:justify-center pb-2 touch-pan-x cursor-grab active:cursor-grabbing" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
          {sizes.map((size) => (
            <Link
              key={size}
              to={`/tamanho/${size}`}
              className="flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full border-2 border-foreground text-foreground font-bold text-lg hover:bg-foreground hover:text-background transition-colors flex-shrink-0"
            >
              {size}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
