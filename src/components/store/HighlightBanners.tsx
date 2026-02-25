import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { resolveImageUrl } from '@/lib/imageUrl';

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
        .from('highlight_banners')
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

  // Fallback example banners when none from DB
  const fallbackBanners = [
    {
      id: 'example-1',
      image_url: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=600&h=600&fit=crop',
      link_url: '/categoria/sandalias',
      title: 'Sandálias',
      display_order: 1,
      is_active: true,
    },
    {
      id: 'example-2',
      image_url: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&h=600&fit=crop',
      link_url: '/categoria/tenis',
      title: 'Tênis',
      display_order: 2,
      is_active: true,
    },
    {
      id: 'example-3',
      image_url: 'https://images.unsplash.com/photo-1603808033192-082d6919d3e1?w=600&h=600&fit=crop',
      link_url: '/mais-vendidos',
      title: 'Mais Vendidos',
      display_order: 3,
      is_active: true,
    },
  ];

  const displayBanners = (banners && banners.length > 0) ? banners : fallbackBanners;

  return (
    <section className="py-12 bg-muted/30">
      <div className="container-custom">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4">
          {displayBanners.map((banner, index) => (
            <Link
              key={banner.id}
              to={banner.link_url || '#'}
              className={`relative aspect-square overflow-hidden rounded-lg group ${index === 0 && displayBanners.length === 3 ? 'col-span-2 md:col-span-1' : ''}`}
            >
              <img
                src={resolveImageUrl(banner.image_url)}
                alt={banner.title || 'Banner promocional'}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              {banner.title && (
                <div className="absolute bottom-4 left-4 right-4">
                  <span className="bg-background/90 text-foreground px-4 py-2 rounded-full text-sm font-medium">
                    {banner.title}
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
