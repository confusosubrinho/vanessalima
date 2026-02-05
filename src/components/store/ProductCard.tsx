 import { Link } from 'react-router-dom';
 import { Product } from '@/types/database';
 import { Badge } from '@/components/ui/badge';
 
 interface ProductCardProps {
   product: Product;
 }
 
 export function ProductCard({ product }: ProductCardProps) {
   const primaryImage = product.images?.find(img => img.is_primary) || product.images?.[0];
   const secondaryImage = product.images?.find(img => !img.is_primary);
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
 
   const installmentPrice = ((product.sale_price || product.base_price) / 6).toFixed(2);
 
   return (
     <Link
       to={`/produto/${product.slug}`}
       className="group card-product block"
     >
       <div className="relative aspect-square overflow-hidden bg-muted">
         {/* Primary image */}
         <img
           src={primaryImage?.url || '/placeholder.svg'}
           alt={product.name}
           className="w-full h-full object-cover transition-opacity duration-300 group-hover:opacity-0"
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
         <div className="absolute top-2 left-2 flex flex-col gap-1">
           {product.is_new && (
             <Badge className="badge-new">Lançamento</Badge>
           )}
           {hasDiscount && (
             <Badge className="badge-sale">-{discountPercentage}%</Badge>
           )}
           {product.is_featured && !product.is_new && !hasDiscount && (
             <Badge variant="outline" className="bg-background">Destaque</Badge>
           )}
         </div>
       </div>
 
       <div className="p-4">
         <h3 className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">
           {product.name}
         </h3>
 
         <div className="mt-2 space-y-1">
           {hasDiscount ? (
             <>
               <p className="price-original">{formatPrice(Number(product.base_price))}</p>
               <p className="price-sale text-lg">{formatPrice(Number(product.sale_price))}</p>
             </>
           ) : (
             <p className="price-current">{formatPrice(Number(product.base_price))}</p>
           )}
           <p className="text-xs text-muted-foreground">
             ou 6x de R$ {installmentPrice} sem juros
           </p>
         </div>
       </div>
     </Link>
   );
 }