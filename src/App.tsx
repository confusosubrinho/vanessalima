import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { ScrollToTop } from "@/components/store/ScrollToTop";
import { VersionChecker } from "@/components/store/VersionChecker";
import { ThemeProvider } from "@/components/store/ThemeProvider";
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
const FAQPage = lazy(() => import("./pages/FAQPage"));
const SobrePage = lazy(() => import("./pages/SobrePage"));
const PoliticaPrivacidadePage = lazy(() => import("./pages/PoliticaPrivacidadePage"));
const TermosPage = lazy(() => import("./pages/TermosPage"));
const TrocasPage = lazy(() => import("./pages/TrocasPage"));
const ComoComprarPage = lazy(() => import("./pages/ComoComprarPage"));
const FormasPagamentoPage = lazy(() => import("./pages/FormasPagamentoPage"));
const AtendimentoPage = lazy(() => import("./pages/AtendimentoPage"));
const BestSellersPage = lazy(() => import("./pages/BestSellersPage"));
const PromotionsPage = lazy(() => import("./pages/PromotionsPage"));
const NewArrivalsPage = lazy(() => import("./pages/NewArrivalsPage"));
const RastreioPage = lazy(() => import("./pages/RastreioPage"));
const OrderConfirmation = lazy(() => import("./pages/OrderConfirmation"));
const FavoritesPage = lazy(() => import("./pages/FavoritesPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));

// Lazy load admin routes (heavy)
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const Products = lazy(() => import("./pages/admin/Products"));
const Categories = lazy(() => import("./pages/admin/Categories"));
const Orders = lazy(() => import("./pages/admin/Orders"));
const Customers = lazy(() => import("./pages/admin/Customers"));
const Coupons = lazy(() => import("./pages/admin/Coupons"));
const Banners = lazy(() => import("./pages/admin/Banners"));
const Personalization = lazy(() => import("./pages/admin/Personalization"));
const HighlightBanners = lazy(() => import("./pages/admin/HighlightBanners"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const CodeSettings = lazy(() => import("./pages/admin/CodeSettings"));
const Integrations = lazy(() => import("./pages/admin/Integrations"));
const SalesDashboard = lazy(() => import("./pages/admin/SalesDashboard"));
const ManualRegistration = lazy(() => import("./pages/admin/ManualRegistration"));
const ConversionManual = lazy(() => import("./pages/admin/ConversionManual"));
const AbandonedCarts = lazy(() => import("./pages/admin/AbandonedCarts"));
const EmailAutomations = lazy(() => import("./pages/admin/EmailAutomations"));
const TrafficDashboard = lazy(() => import("./pages/admin/TrafficDashboard"));
const MediaGallery = lazy(() => import("./pages/admin/MediaGallery"));
const PricingSettings = lazy(() => import("./pages/admin/PricingSettings"));
const HelpEditor = lazy(() => import("./pages/admin/HelpEditor"));
const SocialLinks = lazy(() => import("./pages/admin/SocialLinks"));
const PagesAdmin = lazy(() => import("./pages/admin/PagesAdmin"));
const SystemLogs = lazy(() => import("./pages/admin/SystemLogs"));
const SystemHealth = lazy(() => import("./pages/admin/SystemHealth"));
const ThemeEditor = lazy(() => import("./pages/admin/ThemeEditor"));
const AppmaxCallback = lazy(() => import("./pages/admin/AppmaxCallback"));
const Optimization = lazy(() => import("./pages/admin/Optimization"));
const Notifications = lazy(() => import("./pages/admin/Notifications"));
const Reviews = lazy(() => import("./pages/admin/Reviews"));

// Lazy load non-critical floating components
const WhatsAppFloat = lazy(() => import("./components/store/WhatsAppFloat").then(m => ({ default: m.WhatsAppFloat })));
const CookieConsent = lazy(() => import("./components/store/CookieConsent").then(m => ({ default: m.CookieConsent })));
const AdminErrorIndicator = lazy(() => import("./components/store/AdminErrorIndicator").then(m => ({ default: m.AdminErrorIndicator })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.message?.includes('JWT expired')) return false;
        return failureCount < 2;
      },
      staleTime: 1000 * 60 * 5, // 5 min stale for better caching
      gcTime: 1000 * 60 * 10, // 10 min garbage collection
      refetchOnWindowFocus: false, // Reduce unnecessary refetches
    },
  },
});

// Minimal page loading fallback
function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <CartProvider>
      <TooltipProvider>
        <ThemeProvider>
        <Suspense fallback={null}>
          <AdminErrorIndicator />
        </Suspense>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={null}>
            <WhatsAppFloat />
            <CookieConsent />
          </Suspense>
          <ScrollToTop />
          <VersionChecker />
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/produto/:slug" element={<ProductDetail />} />
              <Route path="/categoria/:slug" element={<CategoryPage />} />
              <Route path="/conta" element={<MyAccount />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/carrinho" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/tamanho/:size" element={<SizePage />} />
              <Route path="/faq" element={<FAQPage />} />
              <Route path="/sobre" element={<SobrePage />} />
              <Route path="/politica-privacidade" element={<PoliticaPrivacidadePage />} />
              <Route path="/termos" element={<TermosPage />} />
              <Route path="/trocas" element={<TrocasPage />} />
              <Route path="/como-comprar" element={<ComoComprarPage />} />
              <Route path="/formas-pagamento" element={<FormasPagamentoPage />} />
              <Route path="/atendimento" element={<AtendimentoPage />} />
              <Route path="/mais-vendidos" element={<BestSellersPage />} />
              <Route path="/promocoes" element={<PromotionsPage />} />
              <Route path="/novidades" element={<NewArrivalsPage />} />
              <Route path="/rastreio" element={<RastreioPage />} />
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
                <Route path="logs" element={<SystemLogs />} />
                <Route path="tema" element={<ThemeEditor />} />
              <Route path="saude" element={<SystemHealth />} />
              <Route path="otimizacao" element={<Optimization />} />
              <Route path="notificacoes" element={<Notifications />} />
              <Route path="avaliacoes" element={<Reviews />} />
              </Route>
              <Route path="/admin/integrations/appmax/callback" element={<AppmaxCallback />} />
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        </ThemeProvider>
      </TooltipProvider>
    </CartProvider>
  </QueryClientProvider>
);

export default App;
