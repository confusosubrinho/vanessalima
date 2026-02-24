/**
 * Testes de fluxo de compra: carrinho vazio, adicionar item, carrinho com itens, redirecionamento do checkout.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CartProvider, useCart } from "@/contexts/CartContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import Cart from "@/pages/Cart";
import CheckoutStart from "@/pages/CheckoutStart";
import type { Product, ProductVariant, CartItem } from "@/types/database";

// Evitar chamadas reais e efeitos colaterais
vi.mock("@/lib/utmTracker", () => ({ saveAbandonedCart: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { redirect_url: "/checkout" }, error: null }),
    },
  },
}));

vi.mock("@/hooks/useProducts", () => ({
  useStoreSettings: () => ({ data: { free_shipping_threshold: 399 }, isLoading: false }),
  useCategories: () => ({ data: [], isLoading: false }),
  useProducts: () => ({ data: [], isLoading: false }),
  useSearchPreviewProducts: () => ({ data: [], isLoading: false, isFetched: true }),
  useProduct: () => ({ data: null, isLoading: false }),
  useSearchProducts: () => ({ data: [], isLoading: false }),
  useBanners: () => ({ data: [], isLoading: false }),
  useFeaturedProducts: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/usePricingConfig", () => ({
  usePricingConfig: () => ({ data: null, isLoading: false }),
}));

vi.mock("@/hooks/useStoreContact", () => ({
  useStoreSettingsPublic: () => ({ data: null, isLoading: false }),
  useStoreContact: () => ({ data: null, isLoading: false }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

// Dados mínimos para um item do carrinho
function createMockProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    name: "Bota Teste",
    slug: "bota-teste",
    description: null,
    base_price: 299.9,
    sale_price: null,
    cost: null,
    sku: null,
    category_id: null,
    is_active: true,
    is_featured: false,
    is_new: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    weight: null,
    width: null,
    height: null,
    depth: null,
    gtin: null,
    mpn: null,
    brand: null,
    condition: null,
    google_product_category: null,
    age_group: null,
    gender: null,
    material: null,
    pattern: null,
    seo_title: null,
    seo_description: null,
    seo_keywords: null,
    ...overrides,
  };
}

function createMockVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: "var-1",
    product_id: "prod-1",
    size: "38",
    color: null,
    color_hex: null,
    stock_quantity: 10,
    price_modifier: 0,
    base_price: null,
    sale_price: null,
    sku: null,
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function createMockCartItem(): CartItem {
  return {
    product: createMockProduct(),
    variant: createMockVariant(),
    quantity: 1,
  };
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

function AllProviders({ children, initialEntry = "/carrinho" }: { children: React.ReactNode; initialEntry?: string }) {
  return (
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
        </TooltipProvider>
      </CartProvider>
    </QueryClientProvider>
  );
}

describe("Fluxo de compra", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("Carrinho vazio", () => {
    it("exibe mensagem de carrinho vazio e link Continuar Comprando", () => {
      render(
        <AllProviders>
          <Routes>
            <Route path="/carrinho" element={<Cart />} />
          </Routes>
        </AllProviders>
      );

      expect(screen.getByText(/Seu carrinho está vazio/i)).toBeInTheDocument();
      expect(screen.getByText(/Adicione produtos ao carrinho para continuar/i)).toBeInTheDocument();
      const link = screen.getByRole("link", { name: /Continuar Comprando/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/");
    });
  });

  describe("Adicionar ao carrinho (contexto)", () => {
    it("addItem aumenta itemCount e inclui item na lista", () => {
      let cartApi: ReturnType<typeof useCart> | null = null;
      function Consumer() {
        cartApi = useCart();
        return (
          <div>
            <span data-testid="count">{cartApi.itemCount}</span>
            <button
              type="button"
              onClick={() =>
                cartApi!.addItem(createMockProduct(), createMockVariant(), 2)
              }
            >
              Adicionar
            </button>
          </div>
        );
      }

      render(
        <AllProviders>
          <Consumer />
        </AllProviders>
      );

      expect(screen.getByTestId("count")).toHaveTextContent("0");
      fireEvent.click(screen.getByRole("button", { name: /Adicionar/i }));

      expect(cartApi!.itemCount).toBe(2);
      expect(cartApi!.items).toHaveLength(1);
      expect(cartApi!.items[0].product.name).toBe("Bota Teste");
      expect(cartApi!.items[0].quantity).toBe(2);
    });

    it("addItem do mesmo variant soma quantidade", () => {
      let cartApi: ReturnType<typeof useCart> | null = null;
      function Consumer() {
        cartApi = useCart();
        return (
          <button
            type="button"
            onClick={() => {
              cartApi!.addItem(createMockProduct(), createMockVariant(), 1);
              cartApi!.addItem(createMockProduct(), createMockVariant(), 1);
            }}
          >
            Adicionar 2x
          </button>
        );
      }

      render(
        <AllProviders>
          <Consumer />
        </AllProviders>
      );

      fireEvent.click(screen.getByRole("button", { name: /Adicionar 2x/i }));

      expect(cartApi!.items).toHaveLength(1);
      expect(cartApi!.items[0].quantity).toBe(2);
      expect(cartApi!.itemCount).toBe(2);
    });
  });

  describe("Carrinho com itens", () => {
    it("exibe itens e link Finalizar Compra quando há itens no localStorage", () => {
      const item = createMockCartItem();
      localStorage.setItem("cart", JSON.stringify([item]));
      localStorage.setItem(
        "selectedShipping",
        JSON.stringify({ id: "shipping-1", name: "PAC", price: 25, deadline: "5 dias", company: "Correios" })
      );

      render(
        <AllProviders>
          <Routes>
            <Route path="/carrinho" element={<Cart />} />
          </Routes>
        </AllProviders>
      );

      expect(screen.getByText("Bota Teste")).toBeInTheDocument();
      const finalizarLink = screen.getByRole("link", { name: /Finalizar Compra/i });
      expect(finalizarLink).toBeInTheDocument();
      expect(finalizarLink).toHaveAttribute("href", "/checkout/start");
    });
  });

  describe("CheckoutStart com carrinho vazio", () => {
    it("redireciona para /carrinho e exibe a página do carrinho", async () => {
      render(
        <AllProviders initialEntry="/checkout/start">
          <Routes>
            <Route path="/carrinho" element={<Cart />} />
            <Route path="/checkout/start" element={<CheckoutStart />} />
          </Routes>
        </AllProviders>
      );

      // CheckoutStart com carrinho vazio chama navigate('/carrinho') no useEffect.
      // Aguardamos a troca de rota e o texto do carrinho vazio aparecer.
      expect(await screen.findByText(/Seu carrinho está vazio/i)).toBeInTheDocument();
    });
  });
});
