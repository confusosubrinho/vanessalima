/**
 * Prefetch de chunks de rotas no hover/focus para navegação mais rápida.
 * Cada import() é chamado no máximo uma vez (o bundler cacheia o módulo).
 */

const prefetched = new Set<string>();

function prefetch(key: string, importFn: () => Promise<unknown>) {
  if (prefetched.has(key)) return;
  prefetched.add(key);
  importFn().catch(() => { prefetched.delete(key); });
}

export function prefetchCategoryPage() {
  prefetch('CategoryPage', () => import('@/pages/CategoryPage'));
}

export function prefetchSearchPage() {
  prefetch('SearchPage', () => import('@/pages/SearchPage'));
}

export function prefetchCartPage() {
  prefetch('Cart', () => import('@/pages/Cart'));
}

export function prefetchCheckoutPage() {
  prefetch('Checkout', () => import('@/pages/Checkout'));
}

export function prefetchCheckoutStartPage() {
  prefetch('CheckoutStart', () => import('@/pages/CheckoutStart'));
}

export function prefetchProductDetailPage() {
  prefetch('ProductDetail', () => import('@/pages/ProductDetail'));
}
