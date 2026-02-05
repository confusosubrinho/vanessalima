 import { useParams } from 'react-router-dom';
 import { StoreLayout } from '@/components/store/StoreLayout';
 import { ProductGrid } from '@/components/store/ProductGrid';
 import { useProducts, useCategories } from '@/hooks/useProducts';
 
 export default function CategoryPage() {
   const { slug } = useParams<{ slug: string }>();
   const { data: products, isLoading } = useProducts(slug);
   const { data: categories } = useCategories();
 
   const category = categories?.find(c => c.slug === slug);
 
   return (
     <StoreLayout>
       <div className="bg-muted/30 py-8">
         <div className="container-custom">
           <h1 className="text-3xl font-bold">{category?.name || 'Produtos'}</h1>
           {category?.description && (
             <p className="text-muted-foreground mt-2">{category.description}</p>
           )}
         </div>
       </div>
 
       <ProductGrid
         products={products || []}
         isLoading={isLoading}
       />
 
       {!isLoading && !products?.length && (
         <div className="container-custom py-16 text-center">
           <p className="text-muted-foreground">Nenhum produto encontrado nesta categoria.</p>
         </div>
       )}
     </StoreLayout>
   );
 }