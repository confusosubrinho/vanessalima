 import { StoreLayout } from '@/components/store/StoreLayout';
 import { BannerCarousel } from '@/components/store/BannerCarousel';
 import { FeaturesBar } from '@/components/store/FeaturesBar';
 import { CategoryGrid } from '@/components/store/CategoryGrid';
 import { ProductGrid } from '@/components/store/ProductGrid';
 import { useFeaturedProducts, useProducts } from '@/hooks/useProducts';
 
 const Index = () => {
   const { data: featuredProducts, isLoading: featuredLoading } = useFeaturedProducts();
   const { data: allProducts, isLoading: productsLoading } = useProducts();
 
   // Filter products on sale
   const saleProducts = allProducts?.filter(p => p.sale_price && p.sale_price < p.base_price) || [];
 
   return (
     <StoreLayout>
       <BannerCarousel />
       <FeaturesBar />
       <CategoryGrid />
       
       {/* Sale section */}
       {saleProducts.length > 0 && (
         <div className="bg-muted/30">
           <ProductGrid
             products={saleProducts}
             title="50% Off Em Modelos Selecionados"
             subtitle="Promoção por tempo limitado, aproveite!"
             showViewAll
             viewAllLink="/outlet"
             isLoading={productsLoading}
           />
         </div>
       )}
 
       {/* Featured products */}
       <ProductGrid
         products={featuredProducts || []}
         title="Destaques"
         subtitle="Os modelos mais amados pelas nossas clientes"
         isLoading={featuredLoading}
       />
 
       {/* New arrivals */}
       <div className="bg-muted/30">
         <ProductGrid
           products={allProducts?.filter(p => p.is_new) || []}
           title="Novidades"
           subtitle="Acabou de chegar na loja"
           isLoading={productsLoading}
         />
       </div>
     </StoreLayout>
   );
 };
 
 export default Index;
