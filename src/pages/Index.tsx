import { useEffect, lazy, Suspense } from 'react';
import { StoreLayout } from '@/components/store/StoreLayout';
import { BannerCarousel } from '@/components/store/BannerCarousel';
import { FeaturesBar } from '@/components/store/FeaturesBar';
import { CategoryGrid } from '@/components/store/CategoryGrid';
import { ProductCarousel } from '@/components/store/ProductCarousel';
import { useFeaturedProducts, useProducts } from '@/hooks/useProducts';
import { trackSession } from '@/lib/utmTracker';

// Lazy load below-the-fold sections
const ProductGrid = lazy(() => import('@/components/store/ProductGrid').then(m => ({ default: m.ProductGrid })));
const HighlightBanners = lazy(() => import('@/components/store/HighlightBanners').then(m => ({ default: m.HighlightBanners })));
const InstagramFeed = lazy(() => import('@/components/store/InstagramFeed').then(m => ({ default: m.InstagramFeed })));
const ShopBySize = lazy(() => import('@/components/store/ShopBySize').then(m => ({ default: m.ShopBySize })));
const Newsletter = lazy(() => import('@/components/store/Newsletter').then(m => ({ default: m.Newsletter })));
const BijuteriasSection = lazy(() => import('@/components/store/BijuteriasSection').then(m => ({ default: m.BijuteriasSection })));

const SectionFallback = () => <div className="py-12" />;

const Index = () => {
  const { data: featuredProducts, isLoading: featuredLoading } = useFeaturedProducts();
  const { data: allProducts, isLoading: productsLoading } = useProducts();

  useEffect(() => {
    trackSession();
  }, []);

  const saleProducts = allProducts?.filter(p => p.sale_price && p.sale_price < p.base_price).slice(0, 10) || [];
  const newProducts = allProducts?.filter(p => p.is_new).slice(0, 8) || [];

  return (
    <StoreLayout>
      <BannerCarousel />
      <FeaturesBar />
      <CategoryGrid />
      
      <ProductCarousel
        products={(featuredProducts || []).slice(0, 10)}
        title="Mais Vendidos"
        subtitle="Os modelos mais amados pelas nossas clientes"
        showViewAll
        viewAllLink="/mais-vendidos"
        isLoading={featuredLoading}
        cardBg
      />

      <div className="content-lazy">
        <Suspense fallback={<SectionFallback />}>
          <BijuteriasSection />
        </Suspense>
      </div>

      <div className="content-lazy">
        <Suspense fallback={<SectionFallback />}>
          <HighlightBanners />
        </Suspense>
      </div>

      <div className="content-lazy">
        <Suspense fallback={<SectionFallback />}>
          <ShopBySize />
        </Suspense>
      </div>

      {saleProducts.length > 0 && (
        <div className="content-lazy">
          <ProductCarousel
            products={saleProducts}
            title="Promoções"
            subtitle="Ofertas imperdíveis para você"
            showViewAll
            viewAllLink="/promocoes"
            isLoading={productsLoading}
          />
        </div>
      )}

      <div className="content-lazy">
        <Suspense fallback={<SectionFallback />}>
          <ProductGrid
            products={newProducts}
            title="Novidades"
            subtitle="Acabou de chegar na loja"
            isLoading={productsLoading}
            showViewAll
            viewAllLink="/novidades"
          />
        </Suspense>
      </div>

      <div className="content-lazy">
        <Suspense fallback={<SectionFallback />}>
          <InstagramFeed />
        </Suspense>
      </div>

      <div className="content-lazy">
        <Suspense fallback={<SectionFallback />}>
          <Newsletter />
        </Suspense>
      </div>
    </StoreLayout>
  );
};

export default Index;
