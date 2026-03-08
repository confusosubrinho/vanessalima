import { lazy, Suspense, useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { ErrorBoundary } from "@/components/store/ErrorBoundary";
import { ScrollToTop } from "@/components/store/ScrollToTop";
import { VersionChecker } from "@/components/store/VersionChecker";
import { ThemeProvider } from "@/components/store/ThemeProvider";
import { AppmaxScriptLoader } from "@/components/store/AppmaxScriptLoader";
import { APP_VERSION } from "@/lib/appVersion";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Retry wrapper for lazy imports that may fail due to stale cache
function lazyRetry<T extends { default: React.ComponentType<any> }>(
  factory: () => Promise<T>,
): Promise<T> {
  return factory().catch((err) => {
    const key = `lazy-retry-reloaded-${APP_VERSION}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      window.location.reload();
    }
    throw err;
  });
}

// Lazy load non-critical pages — all wrapped with lazyRetry
const ProductDetail = lazy(() => lazyRetry(() => import("./pages/ProductDetail")));
const CategoryPage = lazy(() => lazyRetry(() => import("./pages/CategoryPage")));
const SizePage = lazy(() => lazyRetry(() => import("./pages/SizePage")));
const Auth = lazy(() => lazyRetry(() => import("./pages/Auth")));
const Cart = lazy(() => lazyRetry(() => import("./pages/Cart")));
const Checkout = lazy(() => lazyRetry(() => import("./pages/Checkout")));
const MyAccount = lazy(() => lazyRetry(() => import("./pages/MyAccount")));
const RastreioPage = lazy(() => lazyRetry(() => import("./pages/RastreioPage")));
const OrderConfirmation = lazy(() => lazyRetry(() => import("./pages/OrderConfirmation")));
const FavoritesPage = lazy(() => lazyRetry(() => import("./pages/FavoritesPage")));
const SearchPage = lazy(() => lazyRetry(() => import("./pages/SearchPage")));

// Consolidated pages
const InstitutionalPageRoute = lazy(() => lazyRetry(() => import("./pages/InstitutionalPageRoute")));
const ProductListingPage = lazy(() => lazyRetry(() => import("./pages/ProductListingPage")));

// Standalone institutional pages
const ComoComprarPage = lazy(() => lazyRetry(() => import("./pages/ComoComprarPage")));
const FormasPagamentoPage = lazy(() => lazyRetry(() => import("./pages/FormasPagamentoPage")));
const AtendimentoPage = lazy(() => lazyRetry(() => import("./pages/AtendimentoPage")));

// Admin routes
const AdminLayout = lazy(() => lazyRetry(() => import("./pages/admin/AdminLayout")));
const AdminLogin = lazy(() => lazyRetry(() => import("./pages/admin/AdminLogin")));
const Dashboard = lazy(() => lazyRetry(() => import("./pages/admin/Dashboard")));
const Products = lazy(() => lazyRetry(() => import("./pages/admin/Products")));
const Categories = lazy(() => lazyRetry(() => import("./pages/admin/Categories")));
const Orders = lazy(() => lazyRetry(() => import("./pages/admin/Orders")));
const Customers = lazy(() => lazyRetry(() => import("./pages/admin/Customers")));
const Coupons = lazy(() => lazyRetry(() => import("./pages/admin/Coupons")));
const Banners = lazy(() => lazyRetry(() => import("./pages/admin/Banners")));
const Personalization = lazy(() => lazyRetry(() => import("./pages/admin/Personalization")));
const HighlightBanners = lazy(() => lazyRetry(() => import("./pages/admin/HighlightBanners")));
const Settings = lazy(() => lazyRetry(() => import("./pages/admin/Settings")));
const CodeSettings = lazy(() => lazyRetry(() => import("./pages/admin/CodeSettings")));
const Integrations = lazy(() => lazyRetry(() => import("./pages/admin/Integrations")));
const SalesDashboard = lazy(() => lazyRetry(() => import("./pages/admin/SalesDashboard")));
const ManualRegistration = lazy(() => lazyRetry(() => import("./pages/admin/ManualRegistration")));
const ConversionManual = lazy(() => lazyRetry(() => import("./pages/admin/ConversionManual")));
const AbandonedCarts = lazy(() => lazyRetry(() => import("./pages/admin/AbandonedCarts")));
const EmailAutomations = lazy(() => lazyRetry(() => import("./pages/admin/EmailAutomations")));
const TrafficDashboard = lazy(() => lazyRetry(() => import("./pages/admin/TrafficDashboard")));
const MediaGallery = lazy(() => lazyRetry(() => import("./pages/admin/MediaGallery")));
const PricingSettings = lazy(() => lazyRetry(() => import("./pages/admin/PricingSettings")));
const HelpEditor = lazy(() => lazyRetry(() => import("./pages/admin/HelpEditor")));
const SocialLinks = lazy(() => lazyRetry(() => import("./pages/admin/SocialLinks")));
const PagesAdmin = lazy(() => lazyRetry(() => import("./pages/admin/PagesAdmin")));
const SystemAndLogs = lazy(() => lazyRetry(() => import("./pages/admin/SystemAndLogs")));
const ThemeEditor = lazy(() => lazyRetry(() => import("./pages/admin/ThemeEditor")));
const AppmaxCallback = lazy(() => lazyRetry(() => import("./pages/admin/AppmaxCallback")));
const Notifications = lazy(() => lazyRetry(() => import("./pages/admin/Notifications")));
const Reviews = lazy(() => lazyRetry(() => import("./pages/admin/Reviews")));
const Team = lazy(() => lazyRetry(() => import("./pages/admin/Team")));
const CheckoutSettings = lazy(() => lazyRetry(() => import("./pages/admin/CheckoutSettings")));
const CommerceHealth = lazy(() => lazyRetry(() => import("./pages/admin/CommerceHealth")));
const CheckoutStart = lazy(() => lazyRetry(() => import("./pages/CheckoutStart")));
const CheckoutReturn = lazy(() => lazyRetry(() => import("./pages/CheckoutReturn")));

// Lazy load non-critical floating components
const WhatsAppFloat = lazy(() => lazyRetry(() => import("./components/store/WhatsAppFloat").then(m => ({ default: m.WhatsAppFloat }))));
const CookieConsent = lazy(() => lazyRetry(() => import("./components/store/CookieConsent").then(m => ({ default: m.CookieConsent }))));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.message?.includes('JWT expired')) return false;
        return failureCount < 2;
      },
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24,
      refetchOnWindowFocus: false,
    },
  },
});

// Versioned persist key — automatically invalidates on new deploys
const PERSIST_CACHE_KEY = `VANESSA_LIMA_QUERY_CACHE_v${APP_VERSION}`;
const STORE_SETTINGS_PUBLIC_KEY = 'store-settings-public';

/** Clean up old persist cache keys from previous versions */
function cleanupOldPersistKeys() {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('VANESSA_LIMA_QUERY_CACHE') && key !== PERSIST_CACHE_KEY) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch { /* localStorage unavailable */ }
}

/** Deserialize do cache: remove store-settings-public para não sobrescrever com dados antigos após reidratação. */
function deserializePersistedClient(cacheString: string) {
  const data = JSON.parse(cacheString);
  if (data?.clientState?.queries) {
    data.clientState.queries = data.clientState.queries.filter(
      (q: { queryKey: unknown[] }) => q.queryKey?.[0] !== STORE_SETTINGS_PUBLIC_KEY
    );
  }
  return data;
}

const persister =
  typeof window !== 'undefined'
    ? createSyncStoragePersister({
        storage: window.localStorage,
        key: PERSIST_CACHE_KEY,
        throttleTime: 1000,
        deserialize: deserializePersistedClient,
      })
    : undefined;

// Minimal page loading fallback
function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20 animate-fade-in-soft">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

const App = () => {
  useEffect(() => {
    captureAttribution();
    // Clean up persist cache from old versions & stale retry flags
    cleanupOldPersistKeys();
    // Clean old retry flags (non-versioned legacy)
    try { sessionStorage.removeItem('lazy-retry-reloaded'); } catch {}
  }, []);

  const Provider = persister ? PersistQueryClientProvider : QueryClientProvider;
  const providerProps = persister
    ? {
        client: queryClient,
        persistOptions: {
          persister,
          maxAge: 1000 * 60 * 60 * 24,
          dehydrateOptions: {
            shouldDehydrateQuery: (query: { queryKey: unknown[] }) =>
              query.queryKey[0] !== 'store-settings-public',
          },
        },
      }
    : { client: queryClient };
  return (
  <Provider {...providerProps}>
    <CartProvider>
      <TooltipProvider>
        <ThemeProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppmaxScriptLoader />
          <Suspense fallback={null}>
            <WhatsAppFloat />
            <CookieConsent />
          </Suspense>
          <ScrollToTop />
          <VersionChecker />
          <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/produto/:slug" element={<ProductDetail />} />
              <Route path="/categoria/:slug" element={<CategoryPage />} />
              <Route path="/conta" element={<MyAccount />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/carrinho" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/checkout/start" element={<CheckoutStart />} />
              <Route path="/checkout/obrigado" element={<CheckoutReturn />} />
              <Route path="/tamanho/:size" element={<SizePage />} />

              {/* Consolidated institutional pages (CMS-driven) */}
              <Route path="/faq" element={<InstitutionalPageRoute />} />
              <Route path="/sobre" element={<InstitutionalPageRoute />} />
              <Route path="/politica-privacidade" element={<InstitutionalPageRoute />} />
              <Route path="/termos" element={<InstitutionalPageRoute />} />
              <Route path="/trocas" element={<InstitutionalPageRoute />} />

              {/* Standalone institutional pages (custom content) */}
              <Route path="/como-comprar" element={<ComoComprarPage />} />
              <Route path="/formas-pagamento" element={<FormasPagamentoPage />} />
              <Route path="/atendimento" element={<AtendimentoPage />} />

              {/* Consolidated product listing pages */}
              <Route path="/mais-vendidos" element={<ProductListingPage />} />
              <Route path="/promocoes" element={<ProductListingPage />} />
              <Route path="/novidades" element={<ProductListingPage />} />

              <Route path="/rastreio" element={<RastreioPage />} />
              <Route path="/pedido-confirmado/:orderId" element={<OrderConfirmation />} />
              <Route path="/pedido-confirmado" element={<OrderConfirmation />} />
              <Route path="/favoritos" element={<FavoritesPage />} />
              <Route path="/busca" element={<SearchPage />} />
              
              {/* Admin routes */}
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="produtos" element={<Products />} />
                <Route path="categorias" element={<Categories />} />
                <Route path="pedidos" element={<Orders />} />
                <Route path="clientes" element={<Customers />} />
                <Route path="cupons" element={<Coupons />} />
                <Route path="banners" element={<Banners />} />
                <Route path="personalizacao" element={<Personalization />} />
                <Route path="banners-destaque" element={<HighlightBanners />} />
                <Route path="integracoes" element={<Integrations />} />
                <Route path="vendas" element={<SalesDashboard />} />
                <Route path="registro-manual" element={<ManualRegistration />} />
                <Route path="configuracoes" element={<Settings />} />
                <Route path="configuracoes/codigo" element={<CodeSettings />} />
                <Route path="configuracoes/conversoes" element={<ConversionManual />} />
                <Route path="carrinhos-abandonados" element={<AbandonedCarts />} />
                <Route path="email-automations" element={<EmailAutomations />} />
                <Route path="trafego" element={<TrafficDashboard />} />
                <Route path="galeria" element={<MediaGallery />} />
                <Route path="precos" element={<PricingSettings />} />
                <Route path="ajuda" element={<HelpEditor />} />
                <Route path="redes-sociais" element={<SocialLinks />} />
                <Route path="paginas" element={<PagesAdmin />} />
                <Route path="sistema" element={<SystemAndLogs />} />
                <Route path="tema" element={<ThemeEditor />} />
                <Route path="notificacoes" element={<Notifications />} />
                <Route path="avaliacoes" element={<Reviews />} />
                <Route path="equipe" element={<Team />} />
                <Route path="checkout-transparente" element={<CheckoutSettings />} />
                <Route path="commerce-health" element={<CommerceHealth />} />
              </Route>
              <Route path="/admin/integrations/appmax/callback" element={<AppmaxCallback />} />
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
        </ThemeProvider>
      </TooltipProvider>
    </CartProvider>
  </Provider>
  );
};

export default App;
