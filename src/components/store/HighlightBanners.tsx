import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';

interface HighlightBanner {
  id: string;
  image_url: string;
  link_url: string | null;
  title: string | null;
  display_order: number;
  is_active: boolean;
}

export function HighlightBanners() {
  const { data: banners, isLoading } = useQuery({
    queryKey: ['highlight-banners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('highlight_banners' as any)
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .limit(3);
      
      if (error) throw error;
      return data as unknown as HighlightBanner[];
    },
  });

  if (isLoading) {
    return (
      <section className="py-12 bg-muted/30">
        <div className="container-custom">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!banners || banners.length === 0) {
    return null;
  }

  return (
    <section className="py-12 bg-muted/30">
      <div className="container-custom">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {banners.map((banner) => (
            <Link
              key={banner.id}
              to={banner.link_url || '#'}
              className="relative aspect-square overflow-hidden rounded-lg group"
            >
              <img
                src={banner.image_url}
                alt={banner.title || 'Banner promocional'}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
