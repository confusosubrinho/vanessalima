 import { Link } from 'react-router-dom';
 import { Product } from '@/types/database';
 import { ProductCard } from './ProductCard';
 import { Button } from '@/components/ui/button';
 import { ProductGridSkeleton } from './Skeletons';
 
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
           <ProductGridSkeleton />
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
           </div>
         )}
 
         <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
           {products.map((product) => (
             <ProductCard key={product.id} product={product} />
           ))}
         </div>

         {showViewAll && viewAllLink && (
           <div className="text-center mt-8">
             <Button asChild variant="outline" size="lg">
               <Link to={viewAllLink}>Ver mais</Link>
             </Button>
           </div>
         )}
       </div>
     </section>
   );
 }