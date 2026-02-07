import { StoreLayout } from '@/components/store/StoreLayout';
import { BannerCarousel } from '@/components/store/BannerCarousel';
import { FeaturesBar } from '@/components/store/FeaturesBar';
import { CategoryGrid } from '@/components/store/CategoryGrid';
import { ProductCarousel } from '@/components/store/ProductCarousel';
import { HighlightBanners } from '@/components/store/HighlightBanners';
import { useFeaturedProducts, useProducts } from '@/hooks/useProducts';

const Index = () => {
  const { data: featuredProducts, isLoading: featuredLoading } = useFeaturedProducts();
  const { data: allProducts, isLoading: productsLoading } = useProducts();

  // Filter products on sale
  const saleProducts = allProducts?.filter(p => p.sale_price && p.sale_price < p.base_price) || [];
  
  // Filter new products
  const newProducts = allProducts?.filter(p => p.is_new) || [];

  return (
    <StoreLayout>
      <BannerCarousel />
      <FeaturesBar />
      <CategoryGrid />
      
      {/* Sale section */}
      <ProductCarousel
        products={saleProducts}
        title="50% Off Em Modelos Selecionados"
        subtitle="Promoção por tempo limitado, aproveite!"
        showViewAll
        viewAllLink="/outlet"
        isLoading={productsLoading}
        darkBg
      />

      {/* Highlight Banners Section */}
      <HighlightBanners />

      {/* Featured products */}
      <ProductCarousel
        products={featuredProducts || []}
        title="Destaques"
        subtitle="Os modelos mais amados pelas nossas clientes"
        isLoading={featuredLoading}
      />

      {/* New arrivals */}
      <ProductCarousel
        products={newProducts}
        title="Novidades"
        subtitle="Acabou de chegar na loja"
        isLoading={productsLoading}
        showViewAll
        viewAllLink="/novidades"
      />
    </StoreLayout>
  );
};

export default Index;
