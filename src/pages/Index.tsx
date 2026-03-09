import { useEffect, lazy, Suspense, ComponentType } from 'react';
import { StoreLayout } from '@/components/store/StoreLayout';
import { FadeInOnScroll } from '@/components/store/FadeInOnScroll';
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
const BlogSection = lazy(() => import('@/components/store/BlogSection').then(m => ({ default: m.BlogSection })));

const SectionFallback = () => <div className="py-12" />;

/** Skeleton com altura fixa para reservar espaço e evitar CLS da seção "Navegue por Categorias" */
function CategoryGridSkeleton() {
  return (
    <section className="py-12 min-h-[280px]" aria-hidden="true">
      <div className="container-custom">
        <div className="h-8 bg-muted rounded w-48 mx-auto mb-8" />
        <div className="flex gap-6 overflow-hidden justify-center">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex-shrink-0 w-[150px] text-center">
              <div className="w-[150px] h-[150px] rounded-full bg-muted mx-auto mb-3" />
              <div className="h-4 bg-muted rounded w-16 mx-auto" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

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
  blog: BlogSection,
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
      ) : pagesSections && pagesSections.length > 0 ? (
        <>
        {pagesSections.map((section, index) => {
          const Component = SECTION_COMPONENTS[section.section_type];
          if (!Component) return null;
          const isCategoryGrid = section.section_type === 'category_grid';
          return (
            <FadeInOnScroll key={section.id} delay={index * 50} rootMargin="60px">
              <Suspense fallback={isCategoryGrid ? <CategoryGridSkeleton /> : <SectionFallback />}>
                <div className={isCategoryGrid ? 'content-lazy content-lazy-section-category' : 'content-lazy'}>
                  <Component config={section.config} />
                </div>
              </Suspense>
            </FadeInOnScroll>
          );
        })}
        </>
      ) : (
        <div className="container-custom py-16 text-center">
          <p className="text-muted-foreground mb-4">Nenhuma seção configurada para a página inicial.</p>
          <p className="text-sm text-muted-foreground">Acesse o painel admin para configurar banners, categorias e produtos em destaque.</p>
        </div>
      )}
    </StoreLayout>
  );
};

export default Index;
