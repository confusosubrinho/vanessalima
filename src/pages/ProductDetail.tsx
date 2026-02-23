import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Minus, Plus, ShoppingBag, Heart, MessageCircle, Truck, Bell, Star } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { StoreLayout } from '@/components/store/StoreLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProduct, useStoreSettings } from '@/hooks/useProducts';
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/hooks/use-toast';
import { useFavorites } from '@/hooks/useFavorites';
import { usePricingConfig } from '@/hooks/usePricingConfig';
import { getInstallmentOptions, getPixPrice, getInstallmentDisplay, formatCurrency } from '@/lib/pricingEngine';
import { ShippingCalculator } from '@/components/store/ShippingCalculator';
import { ProductCarousel } from '@/components/store/ProductCarousel';
import { ProductReviews } from '@/components/store/ProductReviews';
import { PaymentMethodsModal } from '@/components/store/PaymentMethodsModal';
import { BuyTogether } from '@/components/store/BuyTogether';
import { FloatingVideo } from '@/components/store/FloatingVideo';
import { StickyAddToCart } from '@/components/store/StickyAddToCart';
import { AddedToCartToast } from '@/components/store/AddedToCartToast';
import { ProductDetailSkeleton } from '@/components/store/Skeletons';
import { StockNotifyModal } from '@/components/store/StockNotifyModal';
import { useRecentProducts, useRelatedProducts } from '@/hooks/useRecentProducts';
import { resolveImageUrl } from '@/lib/imageUrl';
import { useHaptics } from '@/hooks/useHaptics';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function ProductDetail() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading } = useProduct(slug || '');
  const { addItem, setIsCartOpen } = useCart();
  const { toast } = useToast();
  const { isFavorite, toggleFavorite, isAuthenticated } = useFavorites();
  const haptics = useHaptics();
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState('description');
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [variantWarning, setVariantWarning] = useState('');
  const [addedToast, setAddedToast] = useState<{ name: string; variant: string; image: string } | null>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const variantSectionRef = useRef<HTMLDivElement>(null);
  const addToCartRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const { data: recentProducts } = useRecentProducts(product?.id);
  const { data: relatedProducts } = useRelatedProducts(product?.category_id, product?.id);
  const { data: storeSettings } = useStoreSettings();
  const { data: pricingConfig } = usePricingConfig();

  // Fetch review stats
  const { data: reviewStats } = useQuery({
    queryKey: ['product-review-stats', product?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_reviews')
        .select('rating')
        .eq('product_id', product!.id)
        .eq('is_approved', true);
      if (error || !data || data.length === 0) return { avg: 0, count: 0 };
      const avg = data.reduce((sum, r) => sum + r.rating, 0) / data.length;
      return { avg, count: data.length };
    },
    enabled: !!product?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Auto-select first available variant when product loads
  useEffect(() => {
    if (!product) return;
    const variants = product.variants?.filter((v: any) => v.is_active && v.stock_quantity > 0) || [];
    if (variants.length === 0) return;
    const first = variants[0];
    if (first.color) {
      setSelectedColor(first.color);
    }
    setSelectedSize(first.size);
    setQuantity(1);
    setSelectedImage(0);
  }, [product?.id]);

  // Sticky bar: show after scrolling past the add-to-cart button
  useEffect(() => {
    const handleScroll = () => {
      setShowStickyBar(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToVariants = useCallback(() => {
    variantSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const pixDiscountPercent = pricingConfig?.pix_discount ?? storeSettings?.pix_discount ?? 5;

  // Fetch buy together products configured for this product
  const { data: buyTogetherProducts } = useQuery({
    queryKey: ['buy-together', product?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buy_together_products' as any)
        .select('*, related_product:products!buy_together_products_related_product_id_fkey(*, images:product_images(*), variants:product_variants(*))')
        .eq('product_id', product!.id)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data as any[];
    },
    enabled: !!product?.id,
  });

  if (isLoading) {
    return (
      <StoreLayout>
        <ProductDetailSkeleton />
      </StoreLayout>
    );
  }

  if (!product) {
    return (
      <StoreLayout>
        <div className="container-custom py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Produto não encontrado</h1>
          <Button asChild>
            <Link to="/">Voltar para a loja</Link>
          </Button>
        </div>
      </StoreLayout>
    );
  }

  const images = product.images || [];
  const variants = product.variants?.filter(v => v.is_active) || [];
  
  // Valid variants: active AND in stock
  const validVariants = variants.filter(v => v.stock_quantity > 0);
  
  // Low stock threshold
  const LOW_STOCK_THRESHOLD = 3;
  
  const sizes = [...new Set(variants.map(v => v.size))].sort((a, b) => {
    const numA = Number(a); const numB = Number(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });
  const colors = [...new Map(validVariants.filter(v => v.color).map(v => [v.color, { name: v.color!, hex: v.color_hex }])).values()];
  
  // Filter sizes available for selected color
  const availableSizes = selectedColor
    ? [...new Set(validVariants.filter(v => v.color === selectedColor).map(v => v.size))].sort((a, b) => {
        const numA = Number(a); const numB = Number(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      })
    : [...new Set(validVariants.map(v => v.size))].sort((a, b) => {
        const numA = Number(a); const numB = Number(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      });
  
  // Filter colors available for selected size
  const availableColors = selectedSize
    ? [...new Map(validVariants.filter(v => v.size === selectedSize && v.color).map(v => [v.color, { name: v.color!, hex: v.color_hex }])).values()]
    : colors;
  
  const hasDiscount = product.sale_price && product.sale_price < product.base_price;
  const discountPercentage = hasDiscount
    ? Math.round((1 - Number(product.sale_price) / Number(product.base_price)) * 100)
    : 0;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  };

  // Determine selected variant considering colors
  const hasColors = colors.length > 0;
  const selectedVariant = selectedSize
    ? (hasColors && selectedColor
        ? variants.find(v => v.size === selectedSize && v.color === selectedColor)
        : hasColors
          ? null // Force color selection when colors exist
          : variants.find(v => v.size === selectedSize))
    : null;

  // Price calculation: prioritize variant-specific pricing
  const currentPrice = selectedVariant
    ? (selectedVariant.sale_price && Number(selectedVariant.sale_price) > 0
        ? Number(selectedVariant.sale_price)
        : selectedVariant.base_price && Number(selectedVariant.base_price) > 0
          ? Number(selectedVariant.base_price)
          : Number(product.sale_price || product.base_price) + Number(selectedVariant.price_modifier || 0))
    : Number(product.sale_price || product.base_price);
  const installmentOptions = pricingConfig ? getInstallmentOptions(currentPrice, pricingConfig) : [];
  const installmentDisplay = pricingConfig ? getInstallmentDisplay(currentPrice, pricingConfig) : null;
  const isInStock = selectedVariant ? selectedVariant.stock_quantity > 0 : false;

  const handleColorSelect = (colorName: string) => {
    setSelectedColor(colorName);
    setSelectedSize(null);
    // Find variant image for this color - look for matching variant with image
    // For now, cycle to the first image matching the color name in alt text or order
    const colorVariant = variants.find(v => v.color === colorName);
    if (colorVariant) {
      // If variant has a linked image (via alt_text containing color name), select it
      const colorImageIndex = images.findIndex(img => 
        img.alt_text?.toLowerCase().includes(colorName.toLowerCase())
      );
      if (colorImageIndex >= 0) {
        setSelectedImage(colorImageIndex);
      }
    }
  };

  const handleAddToCart = () => {
    const hasColors = colors.length > 0;
    if (!selectedSize || (hasColors && !selectedColor)) {
      const missing = !selectedSize && hasColors && !selectedColor
        ? 'cor e tamanho'
        : !selectedSize ? 'tamanho' : 'cor';
      setVariantWarning(`Selecione ${missing === 'cor e tamanho' ? 'a ' : 'o '}${missing}`);
      scrollToVariants();
      setTimeout(() => setVariantWarning(''), 4000);
      return;
    }
    setVariantWarning('');

    let variant;
    if (selectedColor) {
      variant = variants.find(v => 
        v.size === selectedSize && v.color === selectedColor && v.is_active && v.stock_quantity > 0
      );
    } else {
      variant = variants.find(v => 
        v.size === selectedSize && (!v.color || v.color === '') && v.is_active && v.stock_quantity > 0
      );
    }

    if (!variant) {
      toast({ 
        title: 'Variante indisponível', 
        description: 'A combinação selecionada não está disponível em estoque.',
        variant: 'destructive' 
      });
      return;
    }

    if (variant.stock_quantity < quantity) {
      toast({ 
        title: 'Estoque insuficiente', 
        description: 'A quantidade solicitada excede o estoque disponível.',
        variant: 'destructive' 
      });
      return;
    }

    addItem(product, variant, quantity);
    haptics.success();
    
    // Premium toast with product info
    const primaryImage = product.images?.find(img => img.is_primary) || product.images?.[0];
    setAddedToast({
      name: product.name,
      variant: `Tam. ${variant.size}${variant.color ? ' - ' + variant.color : ''}`,
      image: resolveImageUrl(primaryImage?.url),
    });
  };

  const characteristics = [
    { label: 'Material', value: product.material },
    { label: 'Marca', value: product.brand },
    { label: 'Peso', value: product.weight ? `${product.weight}g` : null },
    { label: 'Altura', value: product.height ? `${product.height}cm` : null },
    { label: 'Largura', value: product.width ? `${product.width}cm` : null },
    { label: 'Profundidade', value: product.depth ? `${product.depth}cm` : null },
    { label: 'Condição', value: product.condition === 'new' ? 'Novo' : product.condition },
    { label: 'Gênero', value: product.gender },
    { label: 'Padrão', value: product.pattern },
  ].filter(c => c.value);

  // Get configured buy together related products (manual only, no auto-suggestions)
  const configuredRelatedProducts = buyTogetherProducts?.map((bt: any) => bt.related_product).filter(Boolean) || [];
  const buyTogetherDiscount = buyTogetherProducts?.[0]?.discount_percent || 5;

  // Only show manually configured products - NO automatic fallback
  const buyTogetherList = configuredRelatedProducts;

  const tabKeys = ['description', 'characteristics', 'warranty', 'payment'] as const;
  const tabLabels: Record<string, string> = { description: 'Descrição', characteristics: 'Detalhes', warranty: 'Garantia', payment: 'Pagamento' };

  const handleTabSwipe = (direction: 'left' | 'right') => {
    const idx = tabKeys.indexOf(activeTab as any);
    if (direction === 'left' && idx < tabKeys.length - 1) setActiveTab(tabKeys[idx + 1]);
    if (direction === 'right' && idx > 0) setActiveTab(tabKeys[idx - 1]);
  };

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchMove = (e: React.TouchEvent) => { touchEndX.current = e.touches[0].clientX; };
  const onTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) handleTabSwipe(diff > 0 ? 'left' : 'right');
  };

  const renderTabsContent = () => (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-4 h-auto">
        {tabKeys.map(key => (
          <TabsTrigger key={key} value={key} className="text-xs sm:text-sm py-2">{tabLabels[key]}</TabsTrigger>
        ))}
      </TabsList>
      
      <div
        ref={tabsContainerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="min-h-[120px]"
      >
        <TabsContent value="description" className="mt-4">
          <div className="prose prose-sm max-w-none text-muted-foreground">
            {product.description ? (
              /<[a-z][\s\S]*>/i.test(product.description) ? (
                <div dangerouslySetInnerHTML={{ __html: product.description }} />
              ) : (
                <p className="whitespace-pre-line">{product.description}</p>
              )
            ) : (
              <p>Nenhuma descrição disponível.</p>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="characteristics" className="mt-4">
          {characteristics.length > 0 ? (
            <div className="space-y-2">
              {characteristics.map((char, index) => (
                <div key={index} className="flex justify-between py-2 border-b last:border-0">
                  <span className="text-muted-foreground">{char.label}</span>
                  <span className="font-medium">{char.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">Nenhuma característica disponível.</p>
          )}
        </TabsContent>
        
        <TabsContent value="warranty" className="mt-4">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-medium">Garantia de 30 dias</h4>
                <p className="text-sm text-muted-foreground">Todos os nossos produtos possuem garantia de 30 dias contra defeitos de fabricação.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-medium">Trocas e Devoluções</h4>
                <p className="text-sm text-muted-foreground">Primeira troca gratuita em até 7 dias após o recebimento.</p>
              </div>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="payment" className="mt-4">
          <div className="space-y-4">
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium text-primary mb-2">PIX</h4>
              <p className="text-2xl font-bold">{pricingConfig ? formatCurrency(getPixPrice(currentPrice, pricingConfig)) : formatPrice(currentPrice * (1 - pixDiscountPercent / 100))}</p>
              <p className="text-sm text-muted-foreground">À vista com {pixDiscountPercent}% de desconto</p>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">Cartão de Crédito</h4>
              {installmentDisplay && (
                <>
                  <p className="text-lg font-bold">{installmentDisplay.primaryText}</p>
                  {installmentDisplay.secondaryText && (
                    <p className="text-sm text-muted-foreground">{installmentDisplay.secondaryText}</p>
                  )}
                </>
              )}
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm text-muted-foreground mb-2">Parcelas disponíveis:</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {installmentOptions.map(opt => (
                    <span key={opt.n}>
                      {opt.n}x de {formatCurrency(opt.installmentValue)}
                      {opt.hasInterest ? '' : ' s/juros'}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-center">
              <img src="https://images.tcdn.com.br/files/1313274/themes/5/img/settings/stripe-new-card.png" alt="Cartões aceitos" className="h-8" />
            </div>
          </div>
        </TabsContent>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-2 md:hidden">← Arraste para trocar de aba →</p>
    </Tabs>
  );

  // SEO: Build JSON-LD and OG meta tags
  const storeName = storeSettings?.store_name || 'Loja';
  const primaryImage = images.find(img => img.is_primary) || images[0];
  const ogImage = primaryImage ? resolveImageUrl(primaryImage.url) : '';
  const productUrl = `https://vanessalima.lovable.app/produto/${product.slug}`;
  const totalStock = variants.reduce((sum, v) => sum + (v.stock_quantity || 0), 0);
  const availability = totalStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": product.name,
    "description": product.description || '',
    "image": images.map(img => resolveImageUrl(img.url)),
    "brand": { "@type": "Brand", "name": product.brand || storeName },
    "sku": product.sku || undefined,
    "offers": {
      "@type": "Offer",
      "price": String(currentPrice),
      "priceCurrency": "BRL",
      "availability": availability,
      "seller": { "@type": "Organization", "name": storeName },
    },
    ...(reviewStats && reviewStats.count > 0 ? {
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": String(reviewStats.avg.toFixed(1)),
        "reviewCount": String(reviewStats.count),
      }
    } : {}),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vanessalima.lovable.app/" },
      ...(product.category ? [{ "@type": "ListItem", "position": 2, "name": product.category.name, "item": `https://vanessalima.lovable.app/categoria/${product.category.slug}` }] : []),
      { "@type": "ListItem", "position": product.category ? 3 : 2, "name": product.name },
    ],
  };

  return (
    <StoreLayout>
      {/* SEO: JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      {/* SEO: OG Meta Tags */}
      {typeof document !== 'undefined' && (() => {
        const setMeta = (property: string, content: string) => {
          let el = document.querySelector(`meta[property="${property}"]`);
          if (!el) { el = document.createElement('meta'); el.setAttribute('property', property); document.head.appendChild(el); }
          el.setAttribute('content', content);
        };
        setMeta('og:title', product.seo_title || product.name);
        setMeta('og:description', product.seo_description || product.description?.slice(0, 160) || '');
        setMeta('og:image', ogImage);
        setMeta('og:url', productUrl);
        setMeta('og:type', 'product');
        setMeta('product:price:amount', String(currentPrice));
        setMeta('product:price:currency', 'BRL');
        document.title = (product.seo_title || product.name) + ' | ' + storeName;
        return null;
      })()}

      {/* Floating Video */}
      {(product as any).video_url && (
        <FloatingVideo videoUrl={(product as any).video_url} productName={product.name} />
      )}

      {/* Breadcrumb */}
      <div className="bg-muted/30 py-3">
        <div className="container-custom">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary">Home</Link>
            <ChevronRight className="h-4 w-4" />
            {product.category && (
              <>
                <Link to={`/categoria/${product.category.slug}`} className="hover:text-primary">
                  {product.category.name}
                </Link>
                <ChevronRight className="h-4 w-4" />
              </>
            )}
            <span className="text-foreground">{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="container-custom py-8 overflow-hidden">
        <div className="grid md:grid-cols-2 gap-8 overflow-hidden">
          {/* Images */}
          <div className="space-y-4 min-w-0 overflow-hidden">
            <div className="aspect-square rounded-lg overflow-hidden bg-muted relative w-full">
              <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
                {product.is_new && (
                  <Badge className="bg-primary text-primary-foreground border-0 px-3 py-1">Lançamento</Badge>
                )}
                {hasDiscount && (
                  <Badge className="bg-primary text-primary-foreground border-0 px-3 py-1">-{discountPercentage}% OFF</Badge>
                )}
                {product.is_featured && !product.is_new && !hasDiscount && (
                  <Badge className="bg-primary text-primary-foreground border-0 px-3 py-1">Destaque</Badge>
                )}
              </div>
              <img
                src={resolveImageUrl(images[selectedImage]?.url)}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {images.map((image, index) => (
                  <button
                    key={image.id}
                    onClick={() => setSelectedImage(index)}
                    className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${
                      index === selectedImage ? 'border-primary' : 'border-transparent'
                    }`}
                  >
                    <img src={resolveImageUrl(image.url)} alt={`${product.name} - ${index + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Tabs on desktop only */}
            {!isMobile && renderTabsContent()}
          </div>

          {/* Product info */}
          <div className="space-y-6">
            <div>
              {product.sku && <p className="text-sm text-muted-foreground mb-1">SKU: {product.sku}</p>}
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">{product.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex items-center">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-4 w-4 ${
                        star <= Math.round(reviewStats?.avg || 0)
                          ? 'fill-primary text-primary'
                          : 'fill-muted text-muted-foreground/30'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">
                  ({reviewStats?.count || 0})
                </span>
              </div>
            </div>

            <div className="space-y-1">
              {hasDiscount && (
                <p className="text-muted-foreground line-through text-lg">{formatPrice(Number(product.base_price))}</p>
              )}
              <p className="text-2xl sm:text-3xl font-bold text-primary">
                {pricingConfig ? formatCurrency(getPixPrice(currentPrice, pricingConfig)) : formatPrice(currentPrice * (1 - pixDiscountPercent / 100))}
              </p>
              <p className="text-sm text-muted-foreground">no Pix ({pixDiscountPercent}% off)</p>
              {installmentDisplay && (
                <>
                  <p className="text-muted-foreground font-medium">{installmentDisplay.primaryText}</p>
                  {installmentDisplay.secondaryText && (
                    <p className="text-sm text-muted-foreground/70">{installmentDisplay.secondaryText}</p>
                  )}
                </>
              )}
              <PaymentMethodsModal
                basePrice={currentPrice}
                maxInstallments={pricingConfig?.max_installments ?? 6}
                installmentsWithoutInterest={pricingConfig?.interest_free_installments ?? 3}
                installmentInterestRate={pricingConfig?.monthly_rate_fixed ?? 0}
                minInstallmentValue={pricingConfig?.min_installment_value ?? 25}
                pixDiscount={pixDiscountPercent}
              />
            </div>

            {/* Color Selector */}
            <div ref={variantSectionRef}>
            {availableColors.length > 0 && (
              <div>
                <label className="block font-medium mb-2">Cor{selectedColor && `: ${selectedColor}`}</label>
                <div className="flex flex-wrap gap-2">
                  {availableColors.map(({ name, hex }) => (
                    <button
                      key={name}
                      onClick={() => handleColorSelect(name!)}
                      className={`w-10 h-10 rounded-full border-2 transition-all ${
                        selectedColor === name
                          ? 'border-primary ring-2 ring-primary ring-offset-2'
                          : 'border-border hover:border-primary'
                      }`}
                      style={{ backgroundColor: hex || '#ccc' }}
                      title={name || ''}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block font-medium mb-2">Tamanho</label>
              <div className="flex flex-wrap gap-2">
                {sizes.map((size) => {
                  const variantForSize = variants.find(v => 
                    v.size === size && (!selectedColor || v.color === selectedColor)
                  );
                  const stockQty = variantForSize?.stock_quantity || 0;
                  const isAvailable = stockQty > 0;
                  const isLowStock = isAvailable && stockQty <= LOW_STOCK_THRESHOLD;
                  const isOOS = stockQty === 0;
                  return (
                    <button
                      key={size}
                      onClick={() => {
                        if (isOOS && variantForSize) {
                          setSelectedSize(size);
                          setShowNotifyModal(true);
                        } else {
                          setSelectedSize(size);
                        }
                      }}
                      className={`min-w-12 h-12 px-2 rounded-lg border-2 font-medium transition-colors flex flex-col items-center justify-center ${
                        selectedSize === size
                          ? 'border-primary bg-primary text-primary-foreground'
                          : isOOS
                          ? 'border-border/50 text-muted-foreground opacity-60 hover:border-primary/50'
                          : 'border-border hover:border-primary'
                      }`}
                    >
                      <span className={isOOS ? 'line-through' : ''}>{size}</span>
                      {isLowStock && selectedSize !== size && (
                        <span className="text-[10px] text-orange-600 leading-none">Últimas un.</span>
                      )}
                      {isOOS && selectedSize !== size && (
                        <span className="text-[10px] text-muted-foreground leading-none">Avise-me</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            </div>{/* close variantSectionRef */}

            <div className="hidden md:block">
              <label className="block font-medium mb-2">Quantidade</label>
              <div className="flex items-center gap-4">
                <div className="flex items-center border rounded-lg">
                  <Button variant="ghost" size="icon" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-12 text-center font-medium">{quantity}</span>
                  <Button variant="ghost" size="icon" onClick={() => {
                    const maxStock = selectedVariant?.stock_quantity || 99;
                    setQuantity(Math.min(quantity + 1, maxStock));
                  }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Variant warning */}
            {variantWarning && (
              <p className="text-sm text-destructive font-medium animate-fade-in">
                ⚠ {variantWarning}
              </p>
            )}

            <div ref={addToCartRef} className="flex gap-2 sm:gap-4">
              {isInStock ? (
                <Button size="lg" className="flex-1 rounded-full text-sm sm:text-base h-12" onClick={handleAddToCart}>
                  <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2" />
                  Adicionar ao Carrinho
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1 rounded-full text-sm sm:text-base border-primary text-primary hover:bg-primary/10"
                  onClick={() => setShowNotifyModal(true)}
                >
                  <Bell className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2" />
                  Avise-me quando voltar
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  if (!isAuthenticated) {
                    toast({ title: 'Faça login para favoritar', description: 'Crie sua conta para salvar seus produtos favoritos.' });
                    navigate('/auth');
                    return;
                  }
                  toggleFavorite(product.id);
                }}
              >
                <Heart className={`h-5 w-5 ${isFavorite(product.id) ? 'fill-destructive text-destructive' : ''}`} />
              </Button>
            </div>

            {/* Stock Notify Modal */}
            <StockNotifyModal
              open={showNotifyModal}
              onOpenChange={setShowNotifyModal}
              productId={product.id}
              productName={product.name}
              variantId={selectedVariant?.id}
              variantInfo={
                selectedSize
                  ? `${selectedSize}${selectedColor ? ' - ' + selectedColor : ''}`
                  : undefined
              }
              currentPrice={currentPrice}
            />

            {storeSettings?.contact_whatsapp && (
              <a
                href={`https://wa.me/${(storeSettings.contact_whatsapp as string).replace(/\D/g, '')}?text=${encodeURIComponent(`Olá, gostei deste produto: ${product.name}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 py-2 px-4 border border-[#25D366] text-[#25D366] rounded-full hover:bg-[#25D366]/10 transition-colors font-medium text-sm"
              >
                <MessageCircle className="h-4 w-4" />
                Comprar pelo WhatsApp
              </a>
            )}
            
            <div className="pt-4">
              <ShippingCalculator />
            </div>

            {/* Buy Together Section - inside product info column */}
            {buyTogetherList.length > 0 && (
              <div className="pt-4 border-t">
                <BuyTogether 
                  currentProduct={product} 
                  relatedProducts={buyTogetherList} 
                  discountPercent={buyTogetherDiscount}
                />
              </div>
            )}
          </div>
        </div>

        {/* Tabs on mobile - below buy together */}
        {isMobile && (
          <div className="mt-8">
            {renderTabsContent()}
          </div>
        )}
      </div>

      <ProductReviews productId={product.id} productName={product.name} />

      {relatedProducts && relatedProducts.length > 0 && (
        <ProductCarousel title="Produtos Relacionados" products={relatedProducts} />
      )}

      {recentProducts && recentProducts.length > 0 && (
        <ProductCarousel title="Lançamentos" products={recentProducts} />
      )}

      {/* Bottom padding for sticky bar on mobile */}
      <div className="h-20 md:hidden" />

      {/* Sticky Add to Cart Bar - mobile only */}
      <StickyAddToCart
        productName={product.name}
        currentPrice={currentPrice}
        isInStock={validVariants.length > 0}
        hasSelectedVariant={!!selectedVariant}
        needsColor={colors.length > 0 && !selectedColor}
        needsSize={!selectedSize}
        onAddToCart={handleAddToCart}
        onScrollToVariant={scrollToVariants}
        visible={showStickyBar}
      />

      {/* Premium "Added to Cart" toast */}
      <AddedToCartToast
        productName={addedToast?.name || ''}
        variantInfo={addedToast?.variant || ''}
        imageUrl={addedToast?.image || ''}
        visible={!!addedToast}
        onViewCart={() => { setAddedToast(null); setIsCartOpen(true); }}
        onClose={() => setAddedToast(null)}
      />
    </StoreLayout>
  );
}
