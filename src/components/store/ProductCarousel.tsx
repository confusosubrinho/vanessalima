import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Product } from '@/types/database';
import { useStoreSettings } from '@/hooks/useProducts';
import { usePricingConfig } from '@/hooks/usePricingConfig';
import { getInstallmentDisplay } from '@/lib/pricingEngine';
import { VariantSelectorModal } from './VariantSelectorModal';
import { resolveImageUrl } from '@/lib/imageUrl';

interface ProductCarouselProps {
  products: Product[];
  title?: string;
  subtitle?: string;
  showViewAll?: boolean;
  viewAllLink?: string;
  isLoading?: boolean;
  darkBg?: boolean;
  cardBg?: boolean;
}

export function ProductCarousel({
  products,
  title,
  subtitle,
  showViewAll,
  viewAllLink,
  isLoading,
  darkBg = false,
  cardBg = false,
}: ProductCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: settings } = useStoreSettings();
  const { data: pricingConfig } = usePricingConfig();
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);

  // Touch/mouse drag support
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      isDragging.current = true;
      dragStartX.current = e.pageX - el.offsetLeft;
      dragScrollLeft.current = el.scrollLeft;
      if (e.pointerType === 'mouse') e.preventDefault();
    };
    const onUp = () => { isDragging.current = false; };
    const onMove = (e: PointerEvent) => {
      if (!isDragging.current) return;
      if (e.pointerType === 'mouse') e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      el.scrollLeft = dragScrollLeft.current - (x - dragStartX.current) * 1.5;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onUp);
    el.addEventListener('pointermove', onMove);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onUp);
      el.removeEventListener('pointermove', onMove);
    };
  }, []);

  const whatsappNumber = settings?.contact_whatsapp?.replace(/\D/g, '') || '5542991120205';

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 320;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const formatPrice = useCallback((price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  }, []);

  const handleQuickBuy = (product: Product, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setVariantProduct(product);
  };

  if (isLoading) {
    return (
      <section className={`py-12 ${darkBg ? 'bg-secondary text-secondary-foreground' : ''}`}>
        <div className="container-custom">
          {title && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold">{title}</h2>

              {subtitle && <p className={`mt-1 ${darkBg ? 'text-secondary-foreground/70' : 'text-muted-foreground'}`}>{subtitle}</p>}
            </div>
          )}
          <div className="flex gap-4 overflow-hidden">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse flex-shrink-0 w-[280px]">
                <div className="aspect-[3/4] bg-muted rounded-lg mb-3" />
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!products?.length) return null;

  const isDark = darkBg || cardBg;

  return (
    <>
      <section className={`py-12 ${isDark ? 'bg-secondary text-secondary-foreground' : ''}`}>
        <div className="container-custom">
          {title && (
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold">{title}</h2>
                {subtitle && <p className={`mt-1 ${isDark ? 'text-secondary-foreground/70' : 'text-muted-foreground'}`}>{subtitle}</p>}
              </div>
              {showViewAll && viewAllLink && (
                <Button asChild variant="outline" className={isDark ? 'bg-background text-foreground hover:bg-background/90 border-background' : ''}>
                  <Link to={viewAllLink}>Ver tudo</Link>
                </Button>
              )}
            </div>
          )}

          <div className="relative">
            <Button
              variant="outline"
              size="icon"
              onClick={() => scroll('left')}
              className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 bg-background shadow-lg rounded-full hidden md:flex"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => scroll('right')}
              className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 bg-background shadow-lg rounded-full hidden md:flex"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>

            <div
              ref={scrollRef}
              className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 snap-x snap-mandatory touch-pan-x cursor-grab active:cursor-grabbing"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
            >
              {products.map((product) => {
                const primaryImage = product.images?.find(img => img.is_primary) || product.images?.[0];
                const secondaryImage = product.images?.find(img => !img.is_primary);
                const hasDiscount = product.sale_price && Number(product.sale_price) < Number(product.base_price);
                const discountPercentage = hasDiscount
                  ? Math.round((1 - Number(product.sale_price) / Number(product.base_price)) * 100)
                  : 0;
                const currentPrice = Number(product.sale_price || product.base_price);

                return (
                  <div key={product.id} className={`flex-shrink-0 w-[200px] sm:w-[240px] md:w-[280px] lg:w-[300px] snap-start group ${cardBg ? 'bg-background rounded-xl shadow-sm hover:shadow-md transition-shadow border p-2 sm:p-3' : ''}`}>
                    <Link to={`/produto/${product.slug}`} className="block">
                      <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-muted mb-4">
                        <img
                          src={resolveImageUrl(primaryImage?.url)}
                          alt={primaryImage?.alt_text || product.name}
                          className={`w-full h-full object-cover transition-all duration-500 ${
                            secondaryImage ? 'group-hover:opacity-0' : 'group-hover:scale-110'
                          }`}
                          loading="lazy"
                          decoding="async"
                          width={300}
                          height={400}
                        />
                        {secondaryImage && (
                          <img
                            src={resolveImageUrl(secondaryImage.url)}
                            alt={secondaryImage.alt_text || product.name}
                            className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                            loading="lazy"
                            decoding="async"
                            width={300}
                            height={400}
                          />
                        )}
                        <div className="absolute top-3 left-3 flex flex-col gap-2">
                          {product.is_new && (
                            <Badge className="bg-secondary text-secondary-foreground">LANÇAMENTO</Badge>
                          )}
                          {product.is_featured && (
                            <Badge className="bg-secondary text-secondary-foreground">DESTAQUE</Badge>
                          )}
                          {hasDiscount && (
                            <Badge className="badge-sale">-{discountPercentage}%</Badge>
                          )}
                        </div>
                      </div>
                    </Link>

                    <div className="text-center space-y-3">
                      <Link to={`/produto/${product.slug}`}>
                        <h3 className={`font-medium transition-colors line-clamp-1 ${isDark && !cardBg ? 'text-secondary-foreground hover:text-primary' : 'text-foreground group-hover:text-primary'}`}>
                          {product.name}
                        </h3>
                      </Link>

                      <div>
                        {hasDiscount && (
                          <p className={`line-through text-sm ${isDark && !cardBg ? 'text-secondary-foreground/60' : 'text-muted-foreground'}`}>
                            {formatPrice(Number(product.base_price))}
                          </p>
                        )}
                        <p className={`text-base sm:text-xl font-bold ${isDark && !cardBg ? 'text-secondary-foreground' : 'text-foreground'}`}>
                          {formatPrice(currentPrice)}
                        </p>
                        {pricingConfig && (() => {
                          const display = getInstallmentDisplay(currentPrice, pricingConfig);
                          return (
                            <>
                              <p className={`text-sm font-medium ${isDark && !cardBg ? 'text-secondary-foreground/80' : 'text-foreground/80'}`}>
                                {display.primaryText}
                              </p>
                              {display.secondaryText && (
                                <p className={`text-xs ${isDark && !cardBg ? 'text-secondary-foreground/60' : 'text-muted-foreground'}`}>
                                  {display.secondaryText}
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {/* Size variants */}
                      {(() => {
                        const sizes = product.variants
                          ?.filter(v => v.is_active)
                          .map(v => ({ size: v.size, inStock: v.stock_quantity > 0 }))
                          .filter((v, i, arr) => arr.findIndex(a => a.size === v.size) === i)
                          .sort((a, b) => {
                            const numA = parseFloat(a.size);
                            const numB = parseFloat(b.size);
                            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                            return a.size.localeCompare(b.size);
                          }) || [];
                        return sizes.length > 0 ? (
                          <div>
                            <p className={`text-[11px] mb-1 font-medium ${isDark && !cardBg ? 'text-secondary-foreground/70' : 'text-muted-foreground'}`}>Tamanho</p>
                            <div className="flex gap-1 justify-center overflow-x-auto touch-pan-x cursor-grab active:cursor-grabbing" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                              {sizes.map(({ size, inStock }) => (
                                <span
                                  key={size}
                                  className={`inline-flex items-center justify-center min-w-[26px] h-6 px-1 text-[11px] border rounded flex-shrink-0 ${
                                    inStock
                                      ? 'border-border text-foreground bg-background'
                                      : 'border-border/50 text-muted-foreground/50 line-through bg-muted/50'
                                  }`}
                                >
                                  {size}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null;
                      })()}

                      <div className="space-y-1.5 sm:space-y-2">
                        <Button
                          className="w-full rounded-full text-xs sm:text-sm h-8 sm:h-10"
                          onClick={(e) => handleQuickBuy(product, e)}
                        >
                          Comprar
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full rounded-full text-primary border-primary hover:bg-primary/5 text-[10px] sm:text-xs h-7 sm:h-8 px-2"
                          asChild
                        >
                          <a
                            href={`https://wa.me/${whatsappNumber}?text=Olá, gostei deste produto: ${product.name}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MessageCircle className="h-3 w-3 mr-1" />
                            WhatsApp
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Variant selector modal */}
      {variantProduct && (
        <VariantSelectorModal
          product={variantProduct}
          open={!!variantProduct}
          onOpenChange={(open) => !open && setVariantProduct(null)}
        />
      )}
    </>
  );
}
