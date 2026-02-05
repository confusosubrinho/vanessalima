 import { Product } from '@/types/database';
 import { ProductCard } from './ProductCard';
 
 interface ProductGridProps {
   products: Product[];
   title?: string;
   subtitle?: string;
   showViewAll?: boolean;
   viewAllLink?: string;
   isLoading?: boolean;
 }
 
 export function ProductGrid({
   products,
   title,
   subtitle,
   showViewAll,
   viewAllLink,
   isLoading,
 }: ProductGridProps) {
   if (isLoading) {
     return (
       <section className="py-12">
         <div className="container-custom">
           {title && (
             <div className="text-center mb-8">
               <h2 className="text-2xl font-bold">{title}</h2>
               {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
             </div>
           )}
           <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
             {[...Array(10)].map((_, i) => (
               <div key={i} className="animate-pulse">
                 <div className="aspect-square bg-muted rounded-lg mb-3" />
                 <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                 <div className="h-4 bg-muted rounded w-1/2" />
               </div>
             ))}
           </div>
         </div>
       </section>
     );
   }
 
   if (!products?.length) {
     return null;
   }
 
   return (
     <section className="py-12">
       <div className="container-custom">
         {title && (
           <div className="flex items-center justify-between mb-8">
             <div>
               <h2 className="text-2xl font-bold">{title}</h2>
               {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
             </div>
             {showViewAll && viewAllLink && (
               <a
                 href={viewAllLink}
                 className="text-primary hover:underline font-medium"
               >
                 Ver tudo
               </a>
             )}
           </div>
         )}
 
         <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
           {products.map((product) => (
             <ProductCard key={product.id} product={product} />
           ))}
         </div>
       </div>
     </section>
   );
 }