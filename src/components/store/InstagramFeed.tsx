import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface InstagramVideo {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  username: string | null;
  product_id: string | null;
  display_order: number;
  is_active: boolean;
  product?: {
    id: string;
    name: string;
    slug: string;
    images?: { url: string; is_primary: boolean }[];
  } | null;
}

export function InstagramFeed() {
  const [activeIndex, setActiveIndex] = useState(2); // center item
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  const { data: videos } = useQuery({
    queryKey: ['instagram-videos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instagram_videos' as any)
        .select('*, product:products(id, name, slug, images:product_images(url, is_primary))')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      return (data as unknown as InstagramVideo[]) || [];
    },
  });

  // Auto-play active video, pause others
  useEffect(() => {
    if (!videos) return;
    videoRefs.current.forEach((video, id) => {
      const idx = videos.findIndex(v => v.id === id);
      if (idx === activeIndex) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [activeIndex, videos]);

  // No auto-advance - manual scroll only

  const goTo = (direction: 'prev' | 'next') => {
    if (!videos) return;
    setActiveIndex(prev => {
      if (direction === 'prev') return prev <= 0 ? videos.length - 1 : prev - 1;
      return prev >= videos.length - 1 ? 0 : prev + 1;
    });
  };

  // Scroll to active item
  useEffect(() => {
    if (!scrollRef.current || !videos) return;
    const container = scrollRef.current;
    const items = container.children;
    if (items[activeIndex]) {
      const item = items[activeIndex] as HTMLElement;
      const scrollLeft = item.offsetLeft - container.offsetWidth / 2 + item.offsetWidth / 2;
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, [activeIndex, videos]);

  if (!videos || videos.length === 0) {
    // Fallback placeholder
    return (
      <section className="py-12 bg-muted/30">
        <div className="container-custom text-center">
          <h2 className="text-2xl font-bold mb-2">Inspire-se</h2>
          <p className="text-muted-foreground">Em breve, vídeos com nossos produtos favoritos!</p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 bg-muted/30 overflow-hidden">
      <div className="container-custom">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold">Inspire-se</h2>
          <p className="text-muted-foreground mt-1">Veja como nossas clientes usam</p>
        </div>
      </div>

      <div className="relative">
        {/* Navigation arrows */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => goTo('prev')}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background rounded-full shadow-lg"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => goTo('next')}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background rounded-full shadow-lg"
        >
          <ChevronRight className="h-6 w-6" />
        </Button>

        {/* Carousel */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide px-8 snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {videos.map((video, index) => {
            const isActive = index === activeIndex;
            const productImage = video.product?.images?.find(i => i.is_primary)?.url || video.product?.images?.[0]?.url;

            return (
              <div
                key={video.id}
                className={`flex-shrink-0 snap-center transition-all duration-500 cursor-pointer ${
                  isActive ? 'w-[280px] md:w-[320px] scale-100 opacity-100' : 'w-[220px] md:w-[260px] scale-95 opacity-70'
                }`}
                onClick={() => setActiveIndex(index)}
              >
                {/* Video container */}
                <div className={`relative rounded-2xl overflow-hidden bg-black ${
                  isActive ? 'aspect-[9/16] shadow-2xl' : 'aspect-[9/16]'
                }`}>
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current.set(video.id, el);
                    }}
                    src={video.video_url}
                    poster={video.thumbnail_url || undefined}
                    className="w-full h-full object-cover"
                    loop
                    muted
                    playsInline
                    preload="metadata"
                  />

                  {/* Username overlay */}
                  {video.username && (
                    <div className="absolute top-3 left-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm">
                      @{video.username}
                    </div>
                  )}
                </div>

                {/* Product link below video */}
                {video.product && (
                  <Link
                    to={`/produto/${video.product.slug}`}
                    className="mt-3 flex items-center gap-2 bg-background border rounded-lg p-2 hover:border-primary transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {productImage && (
                      <img
                        src={productImage}
                        alt={video.product.name}
                        className="w-10 h-10 rounded object-cover"
                      />
                    )}
                    <span className="text-xs font-medium line-clamp-2 flex-1">
                      {video.product.name}
                    </span>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
