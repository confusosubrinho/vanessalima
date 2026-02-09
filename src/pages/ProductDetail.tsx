import { useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Minus, Plus, ShoppingBag, Heart, MessageCircle, Truck } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { StoreLayout } from '@/components/store/StoreLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProduct } from '@/hooks/useProducts';
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/hooks/use-toast';
import { useFavorites } from '@/hooks/useFavorites';
import { ShippingCalculator } from '@/components/store/ShippingCalculator';
import { ProductCarousel } from '@/components/store/ProductCarousel';
import { ProductReviews } from '@/components/store/ProductReviews';
import { PaymentMethodsModal } from '@/components/store/PaymentMethodsModal';
import { BuyTogether } from '@/components/store/BuyTogether';
import { FloatingVideo } from '@/components/store/FloatingVideo';
import { useRecentProducts, useRelatedProducts } from '@/hooks/useRecentProducts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function ProductDetail() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading } = useProduct(slug || '');
  const { addItem } = useCart();
  const { toast } = useToast();
  const { isFavorite, toggleFavorite, isAuthenticated } = useFavorites();
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState('description');
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const { data: recentProducts } = useRecentProducts(product?.id);
  const { data: relatedProducts } = useRelatedProducts(product?.category_id, product?.id);

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
        <div className="container-custom py-8">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="animate-pulse">
              <div className="aspect-square bg-muted rounded-lg" />
            </div>
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-muted rounded w-3/4" />
              <div className="h-6 bg-muted rounded w-1/4" />
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-2/3" />
            </div>
          </div>
        </div>
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
  const sizes = [...new Set(variants.map(v => v.size))].sort((a, b) => Number(a) - Number(b));
  const colors = [...new Map(variants.filter(v => v.color).map(v => [v.color, { name: v.color!, hex: v.color_hex }])).values()];
  
  // Filter sizes by selected color
  const availableSizes = selectedColor
    ? [...new Set(variants.filter(v => v.color === selectedColor).map(v => v.size))].sort((a, b) => Number(a) - Number(b))
    : sizes;
  
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

  const currentPrice = Number(product.sale_price || product.base_price);
  const installmentPrice = (currentPrice / 6).toFixed(2);

  const selectedVariant = selectedColor && selectedSize
    ? variants.find(v => v.size === selectedSize && v.color === selectedColor)
    : variants.find(v => v.size === selectedSize);
  const isInStock = selectedVariant ? selectedVariant.stock_quantity > 0 : true;

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
    if (!selectedSize) {
      toast({ title: 'Selecione um tamanho', variant: 'destructive' });
      return;
    }
    const variant = variants.find(v => v.size === selectedSize);
    if (!variant) return;
    addItem(product, variant, quantity);
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

  // Get configured buy together related products
  const configuredRelatedProducts = buyTogetherProducts?.map((bt: any) => bt.related_product).filter(Boolean) || [];
  const buyTogetherDiscount = buyTogetherProducts?.[0]?.discount_percent || 5;

  // Use configured products if available, otherwise fall back to related
  const buyTogetherList = configuredRelatedProducts.length > 0 ? configuredRelatedProducts : (relatedProducts?.slice(0, 3) || []);

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
              <p className="text-2xl font-bold">{formatPrice(currentPrice * 0.95)}</p>
              <p className="text-sm text-muted-foreground">À vista com 5% de desconto</p>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">Cartão de Crédito</h4>
              <p className="text-lg font-bold">até 6x de R$ {installmentPrice}</p>
              <p className="text-sm text-muted-foreground">Sem juros no cartão</p>
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm text-muted-foreground mb-2">Parcelas disponíveis:</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {[1,2,3,4,5,6].map(n => (
                    <span key={n}>{n}x de {formatPrice(currentPrice / n)}</span>
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

  return (
    <StoreLayout>
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

      <div className="container-custom py-8">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Images */}
          <div className="space-y-4">
            <div className="aspect-square rounded-lg overflow-hidden bg-muted relative">
              <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
                {product.is_new && (
                  <Badge className="bg-primary text-primary-foreground border-0 px-3 py-1">Lançamento</Badge>
                )}
                {hasDiscount && (
                  <Badge className="bg-destructive text-destructive-foreground border-0 px-3 py-1">-{discountPercentage}% OFF</Badge>
                )}
                {product.is_featured && !product.is_new && !hasDiscount && (
                  <Badge className="bg-warning text-warning-foreground border-0 px-3 py-1">Destaque</Badge>
                )}
              </div>
              <img
                src={images[selectedImage]?.url || '/placeholder.svg'}
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
                    <img src={image.url} alt={`${product.name} - ${index + 1}`} className="w-full h-full object-cover" />
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
            </div>

            <div className="space-y-1">
              {hasDiscount && (
                <p className="text-muted-foreground line-through text-lg">{formatPrice(Number(product.base_price))}</p>
              )}
              <p className="text-2xl sm:text-3xl font-bold text-foreground">{formatPrice(currentPrice)}</p>
              <p className="text-muted-foreground">ou 6x de R$ {installmentPrice} sem juros</p>
              <PaymentMethodsModal basePrice={currentPrice} maxInstallments={6} />
            </div>

            {/* Color Selector */}
            {colors.length > 0 && (
              <div>
                <label className="block font-medium mb-2">Cor{selectedColor && `: ${selectedColor}`}</label>
                <div className="flex flex-wrap gap-2">
                  {colors.map(({ name, hex }) => (
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
                {availableSizes.map((size) => {
                  const variant = selectedColor
                    ? variants.find(v => v.size === size && v.color === selectedColor)
                    : variants.find(v => v.size === size);
                  const outOfStock = !variant || variant.stock_quantity === 0;
                  return (
                    <button
                      key={size}
                      onClick={() => !outOfStock && setSelectedSize(size)}
                      disabled={outOfStock}
                      className={`w-12 h-12 rounded-lg border-2 font-medium transition-colors ${
                        selectedSize === size
                          ? 'border-primary bg-primary text-primary-foreground'
                          : outOfStock
                          ? 'border-muted bg-muted text-muted-foreground cursor-not-allowed line-through'
                          : 'border-border hover:border-primary'
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block font-medium mb-2">Quantidade</label>
              <div className="flex items-center gap-4">
                <div className="flex items-center border rounded-lg">
                  <Button variant="ghost" size="icon" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-12 text-center font-medium">{quantity}</span>
                  <Button variant="ghost" size="icon" onClick={() => setQuantity(quantity + 1)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 sm:gap-4">
              <Button size="lg" className="flex-1 rounded-full text-sm sm:text-base" onClick={handleAddToCart} disabled={!isInStock}>
                <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2" />
                {isInStock ? 'Adicionar ao Carrinho' : 'Esgotado'}
              </Button>
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

            <a
              href={`https://wa.me/5542991120205?text=Olá, gostei deste produto: ${product.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 py-2 px-4 border border-[#25D366] text-[#25D366] rounded-full hover:bg-[#25D366]/10 transition-colors font-medium text-sm"
            >
              <MessageCircle className="h-4 w-4" />
              Comprar pelo WhatsApp
            </a>
            
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
    </StoreLayout>
  );
}
