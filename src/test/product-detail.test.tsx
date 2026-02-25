/**
 * Testes da página de detalhe do produto: slug da URL, estados de loading/erro.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProductDetail from "@/pages/ProductDetail";
import type { Product } from "@/types/database";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/utmTracker", () => ({ saveAbandonedCart: vi.fn() }));
vi.mock("@/hooks/useHaptics", () => ({ useHaptics: () => ({ success: vi.fn() }) }));
vi.mock("@/components/store/StoreLayout", () => ({ StoreLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="store-layout">{children}</div> }));
vi.mock("@/components/store/ShippingCalculator", () => ({ ShippingCalculator: () => null }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
    })),
  },
}));

const mockProduct: Product = {
  id: "prod-1",
  name: "Produto Teste",
  slug: "produto-teste",
  description: "Descrição",
  base_price: 100,
  sale_price: null,
  cost: null,
  sku: null,
  category_id: "cat-1",
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
  category: { id: "cat-1", name: "Cat", slug: "cat", description: null, image_url: null, display_order: 0, is_active: true, created_at: "", updated_at: "" },
  images: [{ id: "img-1", product_id: "prod-1", url: "/img.jpg", alt_text: null, display_order: 0, is_primary: true, product_variant_id: null, created_at: "" }],
  variants: [{ id: "v1", product_id: "prod-1", size: "38", color: null, color_hex: null, stock_quantity: 5, price_modifier: 0, base_price: null, sale_price: null, sku: null, is_active: true, created_at: "" }],
};

const useProductMock = vi.fn((slug: string) => ({
  data: slug ? mockProduct : undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock("@/hooks/useProducts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useProducts")>();
  return {
    ...actual,
    useProduct: (slug: string) => useProductMock(slug),
    useStoreSettings: () => ({ data: {}, isLoading: false }),
  };
});
vi.mock("@/hooks/usePricingConfig", () => ({ usePricingConfig: () => ({ data: null, isLoading: false }) }));
vi.mock("@/hooks/useFavorites", () => ({ useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn(), isAuthenticated: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/contexts/CartContext", () => ({ useCart: () => ({ addItem: vi.fn(), setIsCartOpen: vi.fn() }) }));
vi.mock("@/hooks/useRecentProducts", () => ({ useRecentProducts: () => ({ data: [] }), useRelatedProducts: () => ({ data: [] }) }));
vi.mock("react-helmet-async", () => ({ Helmet: ({ children }: any) => children }));
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn((opts: { queryKey?: unknown[] }) => {
      if (opts.queryKey?.[0] === "product-review-stats") return { data: null };
      if (opts.queryKey?.[0] === "buy-together") return { data: [] };
      return { data: null };
    }),
  };
});

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderProductDetail(entry = "/produto/produto-teste") {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/produto/:slug" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ProductDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProductMock.mockImplementation((slug: string) => ({
      data: slug ? mockProduct : undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
  });

  it("não lança erro ao montar com rota /produto/:slug", () => {
    expect(() => renderProductDetail()).not.toThrow();
  });

  it("com slug na URL chama useProduct com esse slug", async () => {
    renderProductDetail("/produto/produto-teste");
    await waitFor(() => {
      expect(useProductMock).toHaveBeenCalledWith("produto-teste");
    });
  });

  it("em loading exibe skeleton", async () => {
    useProductMock.mockImplementation(() => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }));
    renderProductDetail("/produto/qualquer");
    await waitFor(() => {
      expect(useProductMock).toHaveBeenCalledWith("qualquer");
    });
    const skeleton = document.querySelector(".animate-pulse");
    expect(skeleton).toBeTruthy();
  });

  it("produto carregado com slug igual à URL exibe nome do produto", async () => {
    renderProductDetail("/produto/produto-teste");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Produto Teste", level: 1 })).toBeInTheDocument();
    });
  });
});
