import { useEffect } from 'react';
import { StoreLayout } from '@/components/store/StoreLayout';
import { BannerCarousel } from '@/components/store/BannerCarousel';
import { FeaturesBar } from '@/components/store/FeaturesBar';
import { CategoryGrid } from '@/components/store/CategoryGrid';
import { ProductCarousel } from '@/components/store/ProductCarousel';
import { ProductGrid } from '@/components/store/ProductGrid';
import { HighlightBanners } from '@/components/store/HighlightBanners';
import { InstagramFeed } from '@/components/store/InstagramFeed';
import { ShopBySize } from '@/components/store/ShopBySize';
import { Newsletter } from '@/components/store/Newsletter';
import { BijuteriasSection } from '@/components/store/BijuteriasSection';
import { useFeaturedProducts, useProducts } from '@/hooks/useProducts';
import { trackSession } from '@/lib/utmTracker';

const Index = () => {
  const { data: featuredProducts, isLoading: featuredLoading } = useFeaturedProducts();
  const { data: allProducts, isLoading: productsLoading } = useProducts();

  useEffect(() => {
    trackSession();
  }, []);

  // Filter products on sale
  const saleProducts = allProducts?.filter(p => p.sale_price && p.sale_price < p.base_price).slice(0, 10) || [];
  
  // Filter new products - limit to 8 for 2x4 grid
  const newProducts = allProducts?.filter(p => p.is_new).slice(0, 8) || [];

  return (
    <StoreLayout>
      <BannerCarousel />
      <FeaturesBar />
      <CategoryGrid />
      
      {/* Mais Vendidos section */}
      <ProductCarousel
        products={(featuredProducts || []).slice(0, 10)}
        title="Mais Vendidos"
        subtitle="Os modelos mais amados pelas nossas clientes"
        showViewAll
        viewAllLink="/mais-vendidos"
        isLoading={featuredLoading}
        cardBg
      />

      {/* Bijuterias Section */}
      <BijuteriasSection />

      {/* Highlight Banners Section */}
      <HighlightBanners />

      {/* Shop by Size */}
      <ShopBySize />

      {/* Sale products */}
      {saleProducts.length > 0 && (
        <ProductCarousel
          products={saleProducts}
          title="Promoções"
          subtitle="Ofertas imperdíveis para você"
          showViewAll
          viewAllLink="/promocoes"
          isLoading={productsLoading}
        />
      )}

      {/* New arrivals - 2x4 grid */}
      <ProductGrid
        products={newProducts}
        title="Novidades"
        subtitle="Acabou de chegar na loja"
        isLoading={productsLoading}
        showViewAll
        viewAllLink="/novidades"
      />

      {/* Instagram Feed Section */}
      <InstagramFeed />

      {/* Newsletter */}
      <Newsletter />
    </StoreLayout>
  );
};

export default Index;
