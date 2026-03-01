import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBanners } from '@/hooks/useProducts';
import { useIsMobile } from '@/hooks/use-mobile';
import { resolveImageUrl } from '@/lib/imageUrl';

export function BannerCarousel() {
  const { data: banners } = useBanners();
  const isMobile = useIsMobile();
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const displayBanners = (banners || []).filter((b: any) =>
    isMobile ? b.show_on_mobile !== false : b.show_on_desktop !== false
  );

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (displayBanners.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % displayBanners.length);
    }, 5000);
  }, [displayBanners.length]);

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [resetTimer]);

  if (displayBanners.length === 0) return null;

  const goToPrevious = () => {
    setCurrentIndex((prev) => prev === 0 ? displayBanners.length - 1 : prev - 1);
    resetTimer();
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % displayBanners.length);
    resetTimer();
  };

  const goToIndex = (index: number) => {
    setCurrentIndex(index);
    resetTimer();
  };

  return (
    <div
      className="relative w-full overflow-hidden bg-muted"
      role="region"
      aria-roledescription="carrossel"
      aria-label="Banner promocional"
    >
      <div 
        className="flex transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {displayBanners.map((banner: any, index: number) => {
          const imageUrl = resolveImageUrl(
            isMobile && banner.mobile_image_url 
              ? banner.mobile_image_url 
              : banner.image_url
          );

          return (
            <div key={banner.id} className="w-full flex-shrink-0">
              <a href={banner.cta_url || '#'} className="block">
                {/* Mobile: padrão 600x800 (3:4), imagem inteira sem cortar */}
                <span
                  className={
                    isMobile
                      ? 'block w-full aspect-[3/4] bg-muted flex items-center justify-center overflow-hidden'
                      : 'block w-full'
                  }
                >
                  <img
                    src={imageUrl}
                    alt={banner.title || 'Banner promocional'}
                    className={
                      isMobile
                        ? 'w-full h-full object-contain'
                        : 'w-full h-auto object-cover'
                    }
                    style={isMobile ? undefined : { maxHeight: '500px' }}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    fetchPriority={index === 0 ? 'high' : 'auto'}
                    decoding={index === 0 ? 'sync' : 'async'}
                    width={isMobile ? 600 : 1440}
                    height={isMobile ? 800 : 500}
                  />
                </span>
              </a>
            </div>
          );
        })}
      </div>

      {displayBanners.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background rounded-full shadow-lg"
            aria-label="Slide anterior"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background rounded-full shadow-lg"
            aria-label="Próximo slide"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </>
      )}

      {displayBanners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2" role="tablist" aria-label="Slides do carrossel">
          {displayBanners.map((_: any, index: number) => (
            <button
              key={index}
              onClick={() => goToIndex(index)}
              role="tab"
              aria-selected={index === currentIndex}
              aria-label={`Slide ${index + 1} de ${displayBanners.length}`}
              className={`w-3 h-3 rounded-full transition-colors ${
                index === currentIndex ? 'bg-secondary' : 'bg-secondary/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
