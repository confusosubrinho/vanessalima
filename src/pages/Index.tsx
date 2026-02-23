import { useEffect, lazy, Suspense, ComponentType } from 'react';
import { StoreLayout } from '@/components/store/StoreLayout';
import { BannerCarousel } from '@/components/store/BannerCarousel';
import { FeaturesBar } from '@/components/store/FeaturesBar';
import { CategoryGrid } from '@/components/store/CategoryGrid';
import { DynamicSection } from '@/components/store/DynamicSection';
import { useHomeSections } from '@/hooks/useHomeSections';
import { useHomePageSections } from '@/hooks/useHomePageSections';
import { trackSession } from '@/lib/utmTracker';

const HighlightBanners = lazy(() => import('@/components/store/HighlightBanners').then(m => ({ default: m.HighlightBanners })));
const InstagramFeed = lazy(() => import('@/components/store/InstagramFeed').then(m => ({ default: m.InstagramFeed })));
const ShopBySize = lazy(() => import('@/components/store/ShopBySize').then(m => ({ default: m.ShopBySize })));
const Newsletter = lazy(() => import('@/components/store/Newsletter').then(m => ({ default: m.Newsletter })));
const CustomerTestimonials = lazy(() => import('@/components/store/CustomerTestimonials').then(m => ({ default: m.CustomerTestimonials })));

const SectionFallback = () => <div className="py-12" />;

// Product sections block — renders the dynamic home_sections loop
function ProductSectionsBlock() {
  const { data: homeSections } = useHomeSections();
  if (!homeSections?.length) return null;
  return (
    <>
      {homeSections.map((section) => (
        <div key={section.id} className="content-lazy">
          <DynamicSection section={section} />
        </div>
      ))}
    </>
  );
}

const SECTION_COMPONENTS: Record<string, ComponentType<any>> = {
  banner_carousel: BannerCarousel,
  features_bar: FeaturesBar,
  category_grid: CategoryGrid,
  product_sections: ProductSectionsBlock,
  highlight_banners: HighlightBanners,
  shop_by_size: ShopBySize,
  instagram_feed: InstagramFeed,
  testimonials: CustomerTestimonials,
  newsletter: Newsletter,
};

const Index = () => {
  const { data: pagesSections, isLoading } = useHomePageSections();

  useEffect(() => {
    trackSession();
  }, []);

  return (
    <StoreLayout>
      {isLoading ? (
        // Show skeleton placeholders while loading section config
        <>
          <SectionFallback />
          <SectionFallback />
          <SectionFallback />
        </>
      ) : (
        pagesSections?.map((section) => {
          const Component = SECTION_COMPONENTS[section.section_type];
          if (!Component) return null;
          return (
            <Suspense key={section.id} fallback={<SectionFallback />}>
              <div className="content-lazy">
                <Component config={section.config} />
              </div>
            </Suspense>
          );
        })
      )}
    </StoreLayout>
  );
};

export default Index;
