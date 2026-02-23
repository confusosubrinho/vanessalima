import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { useRef, useState, useEffect, useCallback } from 'react';

interface TestimonialConfig {
  is_active: boolean;
  title: string;
  subtitle: string;
  bg_color: string;
  card_color: string;
  star_color: string;
  text_color: string;
  cards_per_view: number;
  autoplay: boolean;
  autoplay_speed: number;
}

interface Testimonial {
  id: string;
  customer_name: string;
  rating: number;
  testimonial: string;
  display_order: number;
  is_active: boolean;
}

export function CustomerTestimonials() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const { data: config } = useQuery({
    queryKey: ['testimonials-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('homepage_testimonials_config' as any)
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data as unknown as TestimonialConfig;
    },
  });

  const { data: testimonials } = useQuery({
    queryKey: ['testimonials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('homepage_testimonials' as any)
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data as unknown as Testimonial[]) || [];
    },
  });

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 5);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollButtons, { passive: true });
    updateScrollButtons();
    return () => el.removeEventListener('scroll', updateScrollButtons);
  }, [testimonials, updateScrollButtons]);

  // Autoplay
  useEffect(() => {
    if (!config?.autoplay || !testimonials?.length) return;
    const speed = (config.autoplay_speed || 5) * 1000;
    const interval = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return;
      const cardWidth = el.querySelector('.testimonial-card')?.clientWidth || 300;
      const gap = 24;
      if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 5) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        el.scrollBy({ left: cardWidth + gap, behavior: 'smooth' });
      }
    }, speed);
    return () => clearInterval(interval);
  }, [config?.autoplay, config?.autoplay_speed, testimonials?.length]);

  if (!config?.is_active || !testimonials?.length) return null;

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.querySelector('.testimonial-card')?.clientWidth || 300;
    const gap = 24;
    el.scrollBy({ left: dir === 'left' ? -(cardWidth + gap) : cardWidth + gap, behavior: 'smooth' });
  };

  const cardsPerView = config.cards_per_view || 4;

  return (
    <section className="py-12 md:py-16" style={{ backgroundColor: config.bg_color }}>
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-10">
          <h2
            className="text-2xl md:text-3xl font-light italic mb-2"
            style={{ color: config.text_color }}
          >
            {config.title}
          </h2>
          <p className="text-sm md:text-base opacity-70" style={{ color: config.text_color }}>
            {config.subtitle}
          </p>
          <div className="w-16 h-0.5 bg-current mx-auto mt-4 opacity-40" style={{ color: config.text_color }} />
        </div>

        {/* Carousel */}
        <div className="relative">
          {canScrollLeft && (
            <button
              onClick={() => scroll('left')}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/80 shadow-md flex items-center justify-center hover:bg-white transition-colors -ml-2 md:-ml-5"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-5 w-5 text-gray-600" />
            </button>
          )}

          <div
            ref={scrollRef}
            className="flex gap-6 overflow-x-auto scrollbar-hide scroll-smooth px-1 py-2"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {testimonials.map((t) => (
              <div
                key={t.id}
                className="testimonial-card flex-shrink-0 rounded-xl p-6 shadow-sm flex flex-col items-center text-center"
                style={{
                  backgroundColor: config.card_color,
                  color: config.text_color,
                  width: `calc((100% - ${(cardsPerView - 1) * 24}px) / ${cardsPerView})`,
                  minWidth: '260px',
                }}
              >
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-lg font-semibold text-gray-500 mb-3">
                  {t.customer_name.charAt(0).toUpperCase()}
                </div>

                {/* Stars */}
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className="h-4 w-4"
                      fill={i < t.rating ? config.star_color : 'transparent'}
                      stroke={i < t.rating ? config.star_color : '#ccc'}
                    />
                  ))}
                </div>

                {/* Text */}
                <p className="text-sm leading-relaxed flex-1 mb-4 opacity-80">
                  {t.testimonial}
                </p>

                {/* Name */}
                <p className="font-semibold text-sm">{t.customer_name}</p>
              </div>
            ))}
          </div>

          {canScrollRight && (
            <button
              onClick={() => scroll('right')}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/80 shadow-md flex items-center justify-center hover:bg-white transition-colors -mr-2 md:-mr-5"
              aria-label="Próximo"
            >
              <ChevronRight className="h-5 w-5 text-gray-600" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
