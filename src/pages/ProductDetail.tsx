import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight, Minus, Plus, ShoppingBag, Heart, MessageCircle, Truck } from 'lucide-react';
import { StoreLayout } from '@/components/store/StoreLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useProduct } from '@/hooks/useProducts';
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/hooks/use-toast';
import { ShippingCalculator } from '@/components/store/ShippingCalculator';
import { ProductCarousel } from '@/components/store/ProductCarousel';
import { ProductReviews } from '@/components/store/ProductReviews';
import { PaymentMethodsModal } from '@/components/store/PaymentMethodsModal';
import { useRecentProducts, useRelatedProducts } from '@/hooks/useRecentProducts';

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading } = useProduct(slug || '');
  const { addItem } = useCart();
  const { toast } = useToast();
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  const { data: recentProducts } = useRecentProducts(product?.id);
  const { data: relatedProducts } = useRelatedProducts(product?.category_id, product?.id);

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

  const selectedVariant = variants.find(v => v.size === selectedSize);
  const isInStock = selectedVariant ? selectedVariant.stock_quantity > 0 : true;

  const handleAddToCart = () => {
    if (!selectedSize) {
      toast({
        title: 'Selecione um tamanho',
        variant: 'destructive',
      });
      return;
    }

    const variant = variants.find(v => v.size === selectedSize);
    if (!variant) return;

    addItem(product, variant, quantity);
    toast({
      title: 'Produto adicionado ao carrinho!',
      description: `${product.name} - Tam. ${selectedSize}`,
    });
  };

  return (
    <StoreLayout>
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
              {/* Badges */}
              <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
                {product.is_new && (
                  <Badge className="bg-blue-500 text-white border-0 px-3 py-1">
                    Lançamento
                  </Badge>
                )}
                {hasDiscount && (
                  <Badge className="bg-red-500 text-white border-0 px-3 py-1">
                    -{discountPercentage}% OFF
                  </Badge>
                )}
                {product.is_featured && !product.is_new && !hasDiscount && (
                  <Badge className="bg-yellow-500 text-white border-0 px-3 py-1">
                    Destaque
                  </Badge>
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
                    <img
                      src={image.url}
                      alt={`${product.name} - ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Description below images */}
            {product.description && (
              <div className="border rounded-lg p-6 bg-muted/30">
                <h2 className="font-bold text-lg mb-3">Descrição</h2>
                <p className="text-muted-foreground whitespace-pre-line">{product.description}</p>
              </div>
            )}
          </div>

          {/* Product info */}
          <div className="space-y-6">
            <div>
              {product.sku && (
                <p className="text-sm text-muted-foreground mb-1">SKU: {product.sku}</p>
              )}
              <h1 className="text-3xl font-bold">{product.name}</h1>
            </div>

            {/* Price */}
            <div className="space-y-1">
              {hasDiscount && (
                <p className="text-muted-foreground line-through text-lg">{formatPrice(Number(product.base_price))}</p>
              )}
              <p className="text-3xl font-bold text-foreground">{formatPrice(currentPrice)}</p>
              <p className="text-muted-foreground">
                ou 6x de R$ {installmentPrice} sem juros
              </p>
              <PaymentMethodsModal basePrice={currentPrice} maxInstallments={6} />
            </div>

            {/* Size selector */}
            <div>
              <label className="block font-medium mb-2">Tamanho</label>
              <div className="flex flex-wrap gap-2">
                {sizes.map((size) => {
                  const variant = variants.find(v => v.size === size);
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

            {/* Quantity */}
            <div>
              <label className="block font-medium mb-2">Quantidade</label>
              <div className="flex items-center gap-4">
                <div className="flex items-center border rounded-lg">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-12 text-center font-medium">{quantity}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setQuantity(quantity + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <Button
                size="lg"
                className="flex-1"
                onClick={handleAddToCart}
                disabled={!isInStock}
              >
                <ShoppingBag className="h-5 w-5 mr-2" />
                {isInStock ? 'Adicionar ao Carrinho' : 'Esgotado'}
              </Button>
              <Button size="lg" variant="outline">
                <Heart className="h-5 w-5" />
              </Button>
            </div>

            {/* WhatsApp - Round button with border */}
            <a
              href={`https://wa.me/5542991120205?text=Olá, gostei deste produto: ${product.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-3 px-6 border-2 border-green-500 text-green-600 rounded-full hover:bg-green-50 transition-colors font-medium"
            >
              <MessageCircle className="h-5 w-5" />
              Comprar pelo WhatsApp
            </a>
            
            {/* Shipping Calculator */}
            <div className="pt-4">
              <ShippingCalculator />
            </div>
          </div>
        </div>
      </div>

      {/* Reviews Section */}
      <ProductReviews productId={product.id} productName={product.name} />

      {/* Related Products */}
      {relatedProducts && relatedProducts.length > 0 && (
        <ProductCarousel 
          title="Produtos Relacionados" 
          products={relatedProducts} 
        />
      )}

      {/* Recent Products */}
      {recentProducts && recentProducts.length > 0 && (
        <ProductCarousel 
          title="Lançamentos" 
          products={recentProducts} 
        />
      )}
    </StoreLayout>
  );
}
