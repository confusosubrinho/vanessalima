import { StoreLayout } from '@/components/store/StoreLayout';
import { BannerCarousel } from '@/components/store/BannerCarousel';
import { FeaturesBar } from '@/components/store/FeaturesBar';
import { CategoryGrid } from '@/components/store/CategoryGrid';
import { ProductCarousel } from '@/components/store/ProductCarousel';
import { HighlightBanners } from '@/components/store/HighlightBanners';
import { InstagramFeed } from '@/components/store/InstagramFeed';
import { ShopBySize } from '@/components/store/ShopBySize';
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
      
      {/* Bijuterias section */}
      <ProductCarousel
        products={saleProducts}
        title="Bijuterias"
        subtitle="Acessórios que completam seu look"
        showViewAll
        viewAllLink="/bijuterias"
        isLoading={productsLoading}
        darkBg
      />

      {/* Highlight Banners Section */}
      <HighlightBanners />

      {/* Shop by Size */}
      <ShopBySize />

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

      {/* Instagram Feed Section */}
      <InstagramFeed />
    </StoreLayout>
  );
};

export default Index;
