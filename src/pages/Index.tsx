import { useEffect, lazy, Suspense } from 'react';
import { StoreLayout } from '@/components/store/StoreLayout';
import { BannerCarousel } from '@/components/store/BannerCarousel';
import { FeaturesBar } from '@/components/store/FeaturesBar';
import { CategoryGrid } from '@/components/store/CategoryGrid';
import { DynamicSection } from '@/components/store/DynamicSection';
import { useHomeSections } from '@/hooks/useHomeSections';
import { trackSession } from '@/lib/utmTracker';

const HighlightBanners = lazy(() => import('@/components/store/HighlightBanners').then(m => ({ default: m.HighlightBanners })));
const InstagramFeed = lazy(() => import('@/components/store/InstagramFeed').then(m => ({ default: m.InstagramFeed })));
const ShopBySize = lazy(() => import('@/components/store/ShopBySize').then(m => ({ default: m.ShopBySize })));
const Newsletter = lazy(() => import('@/components/store/Newsletter').then(m => ({ default: m.Newsletter })));
const CustomerTestimonials = lazy(() => import('@/components/store/CustomerTestimonials').then(m => ({ default: m.CustomerTestimonials })));

const SectionFallback = () => <div className="py-12" />;
const Index = () => {
  const { data: homeSections } = useHomeSections();

  useEffect(() => {
    trackSession();
  }, []);

  return (
    <StoreLayout>
      <BannerCarousel />
      <FeaturesBar />
      <CategoryGrid />

      {homeSections?.map((section, i) => (
        <div key={section.id} className="content-lazy">
          <DynamicSection section={section} />
        </div>
      ))}

      {/* Fixed sections */}
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

      <Suspense fallback={<SectionFallback />}>
        <InstagramFeed />
      </Suspense>

      <div className="content-lazy">
        <Suspense fallback={<SectionFallback />}>
          <CustomerTestimonials />
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
