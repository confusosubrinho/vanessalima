 import { useRef } from 'react';
 import { Link } from 'react-router-dom';
 import { ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { Product } from '@/types/database';
 import { useCart } from '@/contexts/CartContext';
 import { useToast } from '@/hooks/use-toast';
 
 interface ProductCarouselProps {
   products: Product[];
   title?: string;
   subtitle?: string;
   showViewAll?: boolean;
   viewAllLink?: string;
   isLoading?: boolean;
   darkBg?: boolean;
 }
 
 export function ProductCarousel({
   products,
   title,
   subtitle,
   showViewAll,
   viewAllLink,
   isLoading,
   darkBg = false,
 }: ProductCarouselProps) {
   const scrollRef = useRef<HTMLDivElement>(null);
   const { addItem } = useCart();
   const { toast } = useToast();
 
   const scroll = (direction: 'left' | 'right') => {
     if (scrollRef.current) {
       const scrollAmount = 320;
       scrollRef.current.scrollBy({
         left: direction === 'left' ? -scrollAmount : scrollAmount,
         behavior: 'smooth',
       });
     }
   };
 
   const formatPrice = (price: number) => {
     return new Intl.NumberFormat('pt-BR', {
       style: 'currency',
       currency: 'BRL',
     }).format(price);
   };
 
   const handleQuickBuy = (product: Product, e: React.MouseEvent) => {
     e.preventDefault();
     const variant = product.variants?.find(v => v.is_active && v.stock_quantity > 0);
     if (variant) {
       addItem(product, variant, 1);
       toast({
         title: 'Adicionado ao carrinho!',
         description: `${product.name} - Tam. ${variant.size}`,
       });
     } else {
       toast({
         title: 'Selecione um tamanho',
         description: 'Acesse a página do produto para escolher',
         variant: 'destructive',
       });
     }
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
 
   return (
     <section className={`py-12 ${darkBg ? 'bg-secondary text-secondary-foreground' : ''}`}>
       <div className="container-custom">
         {title && (
           <div className="flex items-center justify-between mb-8">
             <div>
               <h2 className="text-2xl font-bold">{title}</h2>
               {subtitle && <p className={`mt-1 ${darkBg ? 'text-secondary-foreground/70' : 'text-muted-foreground'}`}>{subtitle}</p>}
             </div>
             {showViewAll && viewAllLink && (
               <Button asChild variant={darkBg ? 'secondary' : 'outline'} className={darkBg ? 'bg-background text-foreground hover:bg-background/90' : ''}>
                 <Link to={viewAllLink}>Ver tudo</Link>
               </Button>
             )}
           </div>
         )}
 
         <div className="relative">
           {/* Navigation arrows */}
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
 
           {/* Products carousel */}
           <div
             ref={scrollRef}
             className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 snap-x snap-mandatory"
             style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
           >
             {products.map((product) => {
               const primaryImage = product.images?.find(img => img.is_primary) || product.images?.[0];
               const secondaryImage = product.images?.find(img => !img.is_primary);
               const hasDiscount = product.sale_price && Number(product.sale_price) < Number(product.base_price);
               const discountPercentage = hasDiscount
                 ? Math.round((1 - Number(product.sale_price) / Number(product.base_price)) * 100)
                 : 0;
               const currentPrice = Number(product.sale_price || product.base_price);
               const installmentPrice = (currentPrice / 12).toFixed(2);
 
               return (
                 <div key={product.id} className="flex-shrink-0 w-[280px] md:w-[300px] snap-start group">
                   <Link to={`/produto/${product.slug}`} className="block">
                      <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-muted mb-4">
                        {/* Primary image */}
                        <img
                          src={primaryImage?.url || '/placeholder.svg'}
                          alt={product.name}
                          className={`w-full h-full object-cover transition-all duration-500 ${
                            secondaryImage ? 'group-hover:opacity-0' : 'group-hover:scale-110'
                          }`}
                        />
                        {/* Secondary image on hover */}
                        {secondaryImage && (
                          <img
                            src={secondaryImage.url}
                            alt={product.name}
                            className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                          />
                        )}
 
                       {/* Badges */}
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
                        <h3 className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                          {product.name}
                        </h3>
                      </Link>

                      <div>
                        {hasDiscount && (
                          <p className="text-muted-foreground line-through text-sm">{formatPrice(Number(product.base_price))}</p>
                        )}
                        <p className="text-xl font-bold">{formatPrice(currentPrice)}</p>
                        <p className="text-sm text-muted-foreground">
                          ou <span className="font-medium">12x</span> de <span className="font-medium">R$ {installmentPrice}</span> com juros
                        </p>
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
                            <p className="text-xs text-muted-foreground mb-1.5 font-medium">Tamanho</p>
                            <div className="flex gap-1 justify-center overflow-x-auto touch-pan-x cursor-grab active:cursor-grabbing" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                              {sizes.map(({ size, inStock }) => (
                                <span
                                  key={size}
                                  className={`inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 text-xs border rounded flex-shrink-0 ${
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

                      <div className="space-y-2">
                        <Button
                          className="w-full rounded-full"
                          onClick={(e) => handleQuickBuy(product, e)}
                        >
                          Comprar
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full rounded-full text-primary border-primary hover:bg-primary/5"
                          asChild
                        >
                          <a
                            href={`https://wa.me/5542991120205?text=Olá, gostei deste produto: ${product.name}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MessageCircle className="h-4 w-4 mr-2" />
                            Comprar pelo Whats
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
   );
 }