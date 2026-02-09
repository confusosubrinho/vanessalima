import { useRef, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Product } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { ShoppingBag, Heart } from 'lucide-react';
import { VariantSelectorModal } from './VariantSelectorModal';
import { useFavorites } from '@/hooks/useFavorites';
import { useToast } from '@/hooks/use-toast';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const sizeScrollRef = useRef<HTMLDivElement>(null);
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const { isFavorite, toggleFavorite, isAuthenticated } = useFavorites();
  const { toast } = useToast();
  const navigate = useNavigate();
  const primaryImage = product.images?.find(img => img.is_primary) || product.images?.[0];
  const secondaryImage = product.images?.find(img => !img.is_primary);
  const hasDiscount = product.sale_price && product.sale_price < product.base_price;
  const discountPercentage = hasDiscount
    ? Math.round((1 - Number(product.sale_price) / Number(product.base_price)) * 100)
    : 0;
  const formatPrice = (price: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
  const currentPrice = Number(product.sale_price || product.base_price);
  const pixPrice = currentPrice * 0.95;
  const hasVariants = (product.variants?.filter(v => v.is_active)?.length || 0) > 0;
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
        className="group card-product block rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-background border border-border/40"
        id={`product-card-${product.slug}`}
      >
        <div className="relative aspect-square overflow-hidden bg-muted">
          <img
            src={primaryImage?.url || '/placeholder.svg'}
            alt={product.name}
            className={`w-full h-full object-cover transition-all duration-500 ${
              secondaryImage ? 'group-hover:opacity-0' : 'group-hover:scale-110'
            }`}
          />
          {secondaryImage && (
            <img
              src={secondaryImage.url}
              alt={product.name}
              className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />
          )}

          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {product.is_new && <Badge className="badge-new">Lançamento</Badge>}
            {hasDiscount && <Badge className="badge-sale">-{discountPercentage}%</Badge>}
            {product.is_featured && !product.is_new && !hasDiscount && (
              <Badge variant="outline" className="bg-background">Destaque</Badge>
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
              className="absolute bottom-2 right-2 bg-primary text-primary-foreground p-2.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-primary/90 shadow-lg"
              title="Comprar"
            >
              <ShoppingBag className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="p-3">
          <h3 className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2 text-sm">
            {product.name}
          </h3>

          <div className="mt-2 space-y-0.5">
            {hasDiscount ? (
              <>
                <p className="price-original text-xs">{formatPrice(Number(product.base_price))}</p>
                <p className="price-sale text-base font-bold">{formatPrice(Number(product.sale_price))}</p>
              </>
            ) : (
              <p className="price-current text-base font-bold">{formatPrice(Number(product.base_price))}</p>
            )}
            <p className="text-[11px] text-muted-foreground">{formatPrice(pixPrice)} via Pix</p>
          </div>

          {sizes.length > 0 && (
            <div className="mt-2">
              <p className="text-[11px] text-muted-foreground mb-1 font-medium">Tamanho</p>
              <div ref={sizeScrollRef} className="flex gap-1 overflow-x-auto touch-pan-x cursor-grab active:cursor-grabbing select-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
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
