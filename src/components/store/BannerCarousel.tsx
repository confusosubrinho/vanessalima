import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBanners } from '@/hooks/useProducts';
import { useIsMobile } from '@/hooks/use-mobile';
import banner1 from '@/assets/banner-1.png';

export function BannerCarousel() {
  const { data: banners } = useBanners();
  const isMobile = useIsMobile();
  const [currentIndex, setCurrentIndex] = useState(0);

  const displayBanners = banners?.length ? banners : [
    {
      id: '1',
      image_url: banner1,
      mobile_image_url: null,
      title: 'RENOVA',
      subtitle: 'Super Sale com descontos de até 50%',
      cta_text: 'Ver ofertas',
      cta_url: '/bijuterias',
    },
  ];

  useEffect(() => {
    if (displayBanners.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % displayBanners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [displayBanners.length]);

  const goToPrevious = () => {
    setCurrentIndex((prev) => prev === 0 ? displayBanners.length - 1 : prev - 1);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % displayBanners.length);
  };

  return (
    <div className="relative w-full overflow-hidden bg-muted">
      <div 
        className="flex transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {displayBanners.map((banner: any) => {
          const imageUrl = isMobile && banner.mobile_image_url 
            ? banner.mobile_image_url 
            : banner.image_url;

          return (
            <div key={banner.id} className="w-full flex-shrink-0">
              <a href={banner.cta_url || '#'} className="block">
                <img
                  src={imageUrl}
                  alt={banner.title || 'Banner'}
                  className="w-full h-auto object-cover"
                  style={{ maxHeight: isMobile ? '400px' : '500px' }}
                />
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
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background rounded-full shadow-lg"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </>
      )}

      {displayBanners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {displayBanners.map((_: any, index: number) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
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
