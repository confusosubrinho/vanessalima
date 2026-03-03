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
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Lazy load non-critical pages
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const CategoryPage = lazy(() => import("./pages/CategoryPage"));
const SizePage = lazy(() => import("./pages/SizePage"));
const Auth = lazy(() => import("./pages/Auth"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const MyAccount = lazy(() => import("./pages/MyAccount"));
const RastreioPage = lazy(() => import("./pages/RastreioPage"));
const OrderConfirmation = lazy(() => import("./pages/OrderConfirmation"));
const FavoritesPage = lazy(() => import("./pages/FavoritesPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));

// Consolidated pages (replaces 5 individual institutional + 3 listing pages = 8 → 2 modules)
const InstitutionalPageRoute = lazy(() => import("./pages/InstitutionalPageRoute"));
const ProductListingPage = lazy(() => import("./pages/ProductListingPage"));

// Standalone institutional pages with custom content (not CMS-driven)
const ComoComprarPage = lazy(() => import("./pages/ComoComprarPage"));
const FormasPagamentoPage = lazy(() => import("./pages/FormasPagamentoPage"));
const AtendimentoPage = lazy(() => import("./pages/AtendimentoPage"));

// Lazy load ALL admin routes via single dynamic import boundary
// Vite will group these into an "admin" chunk automatically
const AdminLayout = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/AdminLayout"));
const AdminLogin = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/AdminLogin"));
const Dashboard = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/Dashboard"));
const Products = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/Products"));
const Categories = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/Categories"));
const Orders = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/Orders"));
const Customers = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/Customers"));
const Coupons = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/Coupons"));
const Banners = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/Banners"));
const Personalization = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/Personalization"));
const HighlightBanners = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/HighlightBanners"));
const Settings = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/Settings"));
const CodeSettings = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/CodeSettings"));
const Integrations = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/Integrations"));
const SalesDashboard = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/SalesDashboard"));
const ManualRegistration = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/ManualRegistration"));
const ConversionManual = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/ConversionManual"));
const AbandonedCarts = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/AbandonedCarts"));
const EmailAutomations = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/EmailAutomations"));
const TrafficDashboard = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/TrafficDashboard"));
const MediaGallery = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/MediaGallery"));
const PricingSettings = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/PricingSettings"));
const HelpEditor = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/HelpEditor"));
const SocialLinks = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/SocialLinks"));
const PagesAdmin = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/PagesAdmin"));
const SystemAndLogs = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/SystemAndLogs"));
const ThemeEditor = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/ThemeEditor"));
const AppmaxCallback = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/AppmaxCallback"));
const Notifications = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/Notifications"));
const Reviews = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/Reviews"));
const Team = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/Team"));
const CheckoutSettings = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/CheckoutSettings"));
const CommerceHealth = lazy(() => import(/* webpackChunkName: "admin" */ "./pages/admin/CommerceHealth"));
const CheckoutStart = lazy(() => import("./pages/CheckoutStart"));
const CheckoutReturn = lazy(() => import("./pages/CheckoutReturn"));

// Retry wrapper for lazy imports that may fail due to stale cache
function lazyRetry<T extends { default: React.ComponentType<any> }>(
  factory: () => Promise<T>,
): Promise<T> {
  return factory().catch((err) => {
    // Force reload once to clear stale chunks
    const key = 'lazy-retry-reloaded';
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      window.location.reload();
    }
    throw err;
  });
}

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
      staleTime: 1000 * 60 * 5, // 5 min stale for better caching
      gcTime: 1000 * 60 * 60 * 24, // 24h para persistência não ser descartada
      refetchOnWindowFocus: false, // Reduce unnecessary refetches
    },
  },
});

const PERSIST_CACHE_KEY = 'VANESSA_LIMA_QUERY_CACHE';
const STORE_SETTINGS_PUBLIC_KEY = 'store-settings-public';

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
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

const App = () => {
  useEffect(() => { captureAttribution(); }, []);
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
