import { useRef, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Product } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { ShoppingBag, Heart, Star, Eye } from 'lucide-react';
import { VariantSelectorModal } from './VariantSelectorModal';
import { useFavorites } from '@/hooks/useFavorites';
import { useToast } from '@/hooks/use-toast';
import { usePricingConfig } from '@/hooks/usePricingConfig';
import { useStoreSettings } from '@/hooks/useProducts';
import { getPixPriceForDisplay, getPixDiscountAmount, shouldApplyPixDiscount, getInstallmentDisplay, formatCurrency } from '@/lib/pricingEngine';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolveImageUrl } from '@/lib/imageUrl';

interface ProductCardProps {
  product: Product;
}

function useShowVariantsOnGrid() {
  const { data } = useStoreSettings();
  return (data as any)?.show_variants_on_grid ?? true;
}

export function ProductCard({ product }: ProductCardProps) {
  const sizeScrollRef = useRef<HTMLDivElement>(null);
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const { isFavorite, toggleFavorite, isAuthenticated } = useFavorites();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: pricingConfig } = usePricingConfig();
  const showVariants = useShowVariantsOnGrid();
  const pixDiscountPercent = pricingConfig?.pix_discount ?? 5;

  // Fetch average rating for this product
  const { data: reviewStats } = useQuery({
    queryKey: ['product-review-stats', product.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_reviews')
        .select('rating')
        .eq('product_id', product.id)
        .eq('is_approved', true);
      if (error || !data || data.length === 0) return { avg: 0, count: 0 };
      const avg = data.reduce((sum, r) => sum + r.rating, 0) / data.length;
      return { avg, count: data.length };
    },
    staleTime: 5 * 60 * 1000,
  });

  const primaryImage = product.images?.find(img => img.is_primary) || product.images?.[0];
  const secondaryImage = product.images?.find(img => !img.is_primary);
  const hasDiscount = product.sale_price && product.sale_price < product.base_price;
  const discountPercentage = hasDiscount
    ? Math.round((1 - Number(product.sale_price) / Number(product.base_price)) * 100)
    : 0;
  const formatPrice = (price: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
  const currentPrice = Number(product.sale_price || product.base_price);
  const hasProductSale = hasDiscount; // product already has sale_price < base_price
  const applyPix = pricingConfig ? shouldApplyPixDiscount(pricingConfig, hasProductSale) : true;
  const pixPrice = pricingConfig
    ? getPixPriceForDisplay(currentPrice, pricingConfig, hasProductSale)
    : (applyPix ? currentPrice * (1 - pixDiscountPercent / 100) : currentPrice);
  const pixDiscountAmount = pricingConfig
    ? getPixDiscountAmount(currentPrice, pricingConfig, hasProductSale)
    : (applyPix ? currentPrice * (pixDiscountPercent / 100) : 0);
  const activeVariants = product.variants?.filter(v => v.is_active) || [];
  const hasVariants = activeVariants.length > 0;
  const totalStock = activeVariants.reduce((sum, v) => sum + (v.stock_quantity || 0), 0);
  const isOutOfStock = hasVariants && totalStock === 0;
  const LOW_STOCK_THRESHOLD = 3;
  const isLowStock = hasVariants && totalStock > 0 && totalStock <= LOW_STOCK_THRESHOLD;
  const sizes = activeVariants
    .map(v => ({ size: v.size, inStock: v.stock_quantity > 0 }))
    .filter((v, i, arr) => arr.findIndex(a => a.size === v.size) === i)
    .sort((a, b) => {
      const numA = parseFloat(a.size);
      const numB = parseFloat(b.size);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.size.localeCompare(b.size);
    }) || [];

  useEffect(() => {
    const el = sizeScrollRef.current;
    if (!el) return;
    let isDown = false, startX = 0, sl = 0;
    const onDown = (e: TouchEvent | MouseEvent) => {
      isDown = true;
      const pageX = 'touches' in e ? e.touches[0].pageX : e.pageX;
      startX = pageX - el.offsetLeft;
      sl = el.scrollLeft;
      if (!('touches' in e)) { e.preventDefault(); e.stopPropagation(); }
    };
    const onUp = () => { isDown = false; };
    const onMove = (e: TouchEvent | MouseEvent) => {
      if (!isDown) return;
      const pageX = 'touches' in e ? e.touches[0].pageX : e.pageX;
      if (!('touches' in e)) e.preventDefault();
      el.scrollLeft = sl - (pageX - el.offsetLeft - startX) * 1.5;
    };
    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: true });
    return () => {
      el.removeEventListener('mousedown', onDown);
      el.removeEventListener('touchstart', onDown);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchend', onUp);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
    };
  }, []);
  const handleBuyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setVariantModalOpen(true);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      toast({ title: 'Faça login para favoritar', description: 'Crie sua conta para salvar seus produtos favoritos.' });
      navigate('/auth');
      return;
    }
    toggleFavorite(product.id);
  };

  return (
    <>
      <Link
        to={`/produto/${product.slug}`}
        className={`group card-product card-lift block rounded-lg overflow-hidden shadow-sm hover:shadow-md bg-background border border-border/40 ${isOutOfStock ? 'opacity-65' : ''}`}
        id={`product-card-${product.slug}`}
      >
        <div className="relative aspect-square overflow-hidden bg-muted">
          <img
            src={resolveImageUrl(primaryImage?.url)}
            alt={product.name}
            className={`w-full h-full object-cover transition-all duration-500 ${
              secondaryImage ? 'group-hover:opacity-0' : 'group-hover:scale-110'
            }`}
            loading="lazy"
            decoding="async"
            width={300}
            height={300}
          />
          {secondaryImage && (
            <img
              src={resolveImageUrl(secondaryImage.url)}
              alt={`${product.name} - foto alternativa`}
              className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              loading="lazy"
              decoding="async"
              width={300}
              height={300}
            />
          )}

          <div className="absolute top-2 left-2 flex flex-col gap-1 max-w-[calc(100%-3rem)]">
            {isOutOfStock && <Badge variant="secondary" className="text-[10px] truncate bg-muted-foreground text-background">Sem estoque</Badge>}
            {isLowStock && <Badge className="text-[10px] truncate bg-primary text-primary-foreground">Últimas unidades</Badge>}
            {product.is_new && !isOutOfStock && <Badge className="badge-new text-[10px] truncate">Lançamento</Badge>}
            {hasDiscount && !isOutOfStock && <Badge className="badge-sale text-[10px] truncate">-{discountPercentage}%</Badge>}
            {product.is_featured && !product.is_new && !hasDiscount && !isOutOfStock && (
              <Badge variant="outline" className="bg-background text-[10px] truncate">Destaque</Badge>
            )}
          </div>

          {/* Favorite button */}
          <button
            onClick={handleFavoriteClick}
            className="absolute top-2 right-2 bg-background/80 p-1.5 rounded-full hover:bg-background transition-colors shadow-sm"
          >
            <Heart className={`h-4 w-4 ${isFavorite(product.id) ? 'fill-destructive text-destructive' : 'text-muted-foreground'}`} />
          </button>

          {/* Buy button overlay */}
          {hasVariants && (
            <button
              id={`btn-buy-${product.slug}`}
              onClick={handleBuyClick}
              className="absolute bottom-2 right-2 bg-primary text-primary-foreground p-2.5 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-primary/90 shadow-lg btn-press"
              title={isOutOfStock ? 'Ver produto' : 'Comprar'}
            >
              {isOutOfStock ? <Eye className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
            </button>
          )}
        </div>

        <div className="p-3">
          <h3 className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2 text-sm leading-snug min-h-[2.5rem]">
            {product.name}
          </h3>

          {reviewStats && reviewStats.count > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <div className="flex">
                {[1, 2, 3, 4, 5].map(star => (
                  <Star
                    key={star}
                    className={`h-3 w-3 ${star <= Math.round(reviewStats.avg) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'}`}
                  />
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground">({reviewStats.count})</span>
            </div>
          )}

          <div className="mt-2 space-y-0.5">
            {hasDiscount ? (
              <>
                <p className="price-original text-xs line-through text-muted-foreground">{formatPrice(Number(product.base_price))}</p>
                <p className="text-base font-bold text-primary">{formatPrice(currentPrice)}</p>
                {applyPix && pixDiscountAmount > 0 ? (
                  <>
                    <p className="text-[11px] text-muted-foreground">{pixDiscountPercent}% off no PIX</p>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <p className="price-current text-base font-bold">{formatPrice(currentPrice)}</p>
                {applyPix && pixDiscountAmount > 0 ? (
                  <>
                    <p className="text-[11px] text-muted-foreground">{pixDiscountPercent}% off no PIX</p>
                  </>
                ) : null}
              </>
            )}
            {pricingConfig && (() => {
              const display = getInstallmentDisplay(currentPrice, pricingConfig, hasDiscount);
              return (
                <div className="pt-0.5">
                  <p className="text-[11px] font-medium text-foreground/80">{display.primaryText}</p>
                </div>
              );
            })()}
          </div>

          {showVariants && sizes.length > 0 && (
            <div className="mt-2">
              <p className="text-[11px] text-muted-foreground mb-1 font-medium">Tamanho</p>
              <div ref={sizeScrollRef} className="flex gap-1 overflow-x-auto touch-pan-x cursor-grab active:cursor-grabbing select-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                {sizes.map(({ size, inStock }) => (
                  <span
                    key={size}
                    className={`inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 text-[11px] border rounded flex-shrink-0 ${
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
          )}
        </div>
      </Link>

      <VariantSelectorModal
        product={product}
        open={variantModalOpen}
        onOpenChange={setVariantModalOpen}
      />
    </>
  );
}
