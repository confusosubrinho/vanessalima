import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { useHorizontalScrollAxisLock } from '@/hooks/useHorizontalScrollAxisLock';

export function ShopBySize() {
  const scrollRef = useHorizontalScrollAxisLock();
  // Standard shoe sizes to display
  const STANDARD_SIZES = ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44'];

  const { data: sizes } = useQuery({
    queryKey: ['available-sizes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_variants')
        .select('size')
        .eq('is_active', true)
        .gt('stock_quantity', 0);
      
      if (error) throw error;
      
      const rawSizes = [...new Set(data.map(v => v.size))];
      
      // Only keep sizes that match standard numeric shoe sizes
      const validSizes = STANDARD_SIZES.filter(std =>
        rawSizes.some(raw => raw.trim() === std)
      );
      
      return validSizes;
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

        <div ref={scrollRef} className="flex gap-3 overflow-x-auto scrollbar-hide justify-start md:justify-center pb-2 touch-pan-x cursor-grab active:cursor-grabbing" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
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
