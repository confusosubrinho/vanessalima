import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { ScrollToTop } from "@/components/store/ScrollToTop";
import { AdminErrorIndicator } from "@/components/store/AdminErrorIndicator";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import ProductDetail from "./pages/ProductDetail";
import CategoryPage from "./pages/CategoryPage";
import SizePage from "./pages/SizePage";
import BijuteriasPage from "./pages/BijuteriasPage";
import Auth from "./pages/Auth";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import MyAccount from "./pages/MyAccount";
import FAQPage from "./pages/FAQPage";
import SobrePage from "./pages/SobrePage";
import PoliticaPrivacidadePage from "./pages/PoliticaPrivacidadePage";
import TermosPage from "./pages/TermosPage";
import TrocasPage from "./pages/TrocasPage";
import ComoComprarPage from "./pages/ComoComprarPage";
import FormasPagamentoPage from "./pages/FormasPagamentoPage";
import AtendimentoPage from "./pages/AtendimentoPage";
import BestSellersPage from "./pages/BestSellersPage";
import RastreioPage from "./pages/RastreioPage";
import OrderConfirmation from "./pages/OrderConfirmation";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminLogin from "./pages/admin/AdminLogin";
import Dashboard from "./pages/admin/Dashboard";
import Products from "./pages/admin/Products";
import Categories from "./pages/admin/Categories";
import Orders from "./pages/admin/Orders";
import Customers from "./pages/admin/Customers";
import Coupons from "./pages/admin/Coupons";
import Banners from "./pages/admin/Banners";
import HighlightBanners from "./pages/admin/HighlightBanners";
import Settings from "./pages/admin/Settings";
import CodeSettings from "./pages/admin/CodeSettings";
import Integrations from "./pages/admin/Integrations";
import SalesDashboard from "./pages/admin/SalesDashboard";
import ManualRegistration from "./pages/admin/ManualRegistration";
import ConversionManual from "./pages/admin/ConversionManual";
import AbandonedCarts from "./pages/admin/AbandonedCarts";
import EmailAutomations from "./pages/admin/EmailAutomations";
import TrafficDashboard from "./pages/admin/TrafficDashboard";
import MediaGallery from "./pages/admin/MediaGallery";
import { WhatsAppFloat } from "./components/store/WhatsAppFloat";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Don't retry on JWT expired - session recovery handles it
        if (error?.message?.includes('JWT expired')) return false;
        return failureCount < 2;
      },
      staleTime: 1000 * 60, // 1 min stale
      refetchOnWindowFocus: true,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <CartProvider>
      <TooltipProvider>
        <AdminErrorIndicator />
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <WhatsAppFloat />
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/produto/:slug" element={<ProductDetail />} />
            <Route path="/categoria/:slug" element={<CategoryPage />} />
            <Route path="/conta" element={<MyAccount />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/carrinho" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/tamanho/:size" element={<SizePage />} />
            <Route path="/bijuterias" element={<BijuteriasPage />} />
            <Route path="/faq" element={<FAQPage />} />
            <Route path="/sobre" element={<SobrePage />} />
            <Route path="/politica-privacidade" element={<PoliticaPrivacidadePage />} />
            <Route path="/termos" element={<TermosPage />} />
            <Route path="/trocas" element={<TrocasPage />} />
            <Route path="/como-comprar" element={<ComoComprarPage />} />
            <Route path="/formas-pagamento" element={<FormasPagamentoPage />} />
            <Route path="/atendimento" element={<AtendimentoPage />} />
            <Route path="/mais-vendidos" element={<BestSellersPage />} />
            <Route path="/rastreio" element={<RastreioPage />} />
            <Route path="/pedido-confirmado" element={<OrderConfirmation />} />
            
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
            </Route>
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </CartProvider>
  </QueryClientProvider>
);

export default App;
