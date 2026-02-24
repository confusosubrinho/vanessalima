import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, ShoppingBag, Menu, Phone, MessageCircle, ChevronDown, Trash2, Plus, Minus, HelpCircle, Percent, Truck, Heart, Star, Sparkles, Gift, Tag, Flame, Zap, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

import { useCart } from '@/contexts/CartContext';
import { useCategories, useProducts } from '@/hooks/useProducts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import defaultLogo from '@/assets/logo.png';
import { ShippingCalculator } from './ShippingCalculator';
import { CouponInput } from './CouponInput';
import { SearchPreview } from './SearchPreview';
import { CartProductSuggestions } from './CartProductSuggestions';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Percent, Star, Sparkles, Heart, Gift, Tag, Flame, Zap, Crown, ShoppingBag,
};

const DROPDOWN_CLOSE_DELAY = 200; // ms

function useDropdown() {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  }, []);

  const handleLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setOpen(false), DROPDOWN_CLOSE_DELAY);
  }, []);

  const close = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(false);
  }, []);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  return { open, handleEnter, handleLeave, close };
}

export function Header() {
  const navigate = useNavigate();
  const { itemCount, items, subtotal, removeItem, updateQuantity, isCartOpen, setIsCartOpen, discount, selectedShipping, total } = useCart();
  const { data: categories } = useCategories();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const megaMenuRef = useRef<HTMLDivElement>(null);

  // Dropdown controllers with delay
  const atendimentoDD = useDropdown();
  const allCategoriesDD = useDropdown();
  const [activeCatSlug, setActiveCatSlug] = useState<string | null>(null);
  const catTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCatEnter = useCallback((slug: string) => {
    if (catTimeoutRef.current) clearTimeout(catTimeoutRef.current);
    setActiveCatSlug(slug);
  }, []);

  const handleCatLeave = useCallback(() => {
    catTimeoutRef.current = setTimeout(() => setActiveCatSlug(null), DROPDOWN_CLOSE_DELAY);
  }, []);

  useEffect(() => {
    return () => { if (catTimeoutRef.current) clearTimeout(catTimeoutRef.current); };
  }, []);

  // Fetch header settings from public view
  const { data: headerSettings } = useQuery({
    queryKey: ['store-settings-public'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_settings_public' as any)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    staleTime: 5 * 60 * 1000,
  });

  const logo = headerSettings?.header_logo_url || headerSettings?.logo_url || defaultLogo;
  const subheadText = headerSettings?.header_subhead_text || 'Frete grátis para compras acima de R$ 399*';
  const highlightText = headerSettings?.header_highlight_text || 'Bijuterias';
  const highlightUrl = headerSettings?.header_highlight_url || '/bijuterias';
  const highlightIconName = headerSettings?.header_highlight_icon || 'Percent';
  const HighlightIcon = ICON_MAP[highlightIconName] || Percent;
  const menuOrder: string[] = (headerSettings?.header_menu_order as string[]) || [];
  const FREE_SHIPPING_THRESHOLD = headerSettings?.free_shipping_threshold || 399;

  // Fetch products for each category for mega menu
  const { data: allProducts } = useProducts();

  const handleSearch = (query: string) => {
    navigate(`/busca?q=${encodeURIComponent(query)}`);
  };

  const formatPrice = useCallback((price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  }, []);

  // Close mega menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (megaMenuRef.current && !megaMenuRef.current.contains(event.target as Node)) {
        setActiveCatSlug(null);
        allCategoriesDD.close();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [allCategoriesDD]);

  // Order categories by header_menu_order if set
  const orderedCategories = (() => {
    const cats = categories || [];
    if (!menuOrder || menuOrder.length === 0) return cats;
    const ordered = menuOrder.map(id => cats.find(c => c.id === id)).filter(Boolean) as typeof cats;
    const remaining = cats.filter(c => !menuOrder.includes(c.id));
    return [...ordered, ...remaining];
  })();
  const mainCategories = orderedCategories.slice(0, 7);

  // Get products for a category
  const getProductsForCategory = (categoryId: string) => {
    return allProducts?.filter(p => p.category_id === categoryId)?.slice(0, 4) || [];
  };

  // Free shipping progress
  const remainingForFreeShipping = FREE_SHIPPING_THRESHOLD - subtotal;
  const hasFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  const freeShippingProgress = Math.min((subtotal / FREE_SHIPPING_THRESHOLD) * 100, 100);

  return (
    <header className="sticky top-0 z-50 bg-background shadow-sm">
      {/* Top bar - Promo */}
      <div className="bg-primary text-primary-foreground text-xs sm:text-sm py-1.5 sm:py-2">
        <div className="container-custom flex items-center justify-center">
          <span className="font-medium text-center">{subheadText}</span>
        </div>
      </div>

      {/* Main header - 3-zone layout */}
      <div className="container-custom py-2 sm:py-3">
        <div className="flex items-center gap-3">
          {/* LEFT ZONE: Hamburger (mobile) + Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Mobile hamburger */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden flex-shrink-0"
                >
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] p-0 flex flex-col">
                <SheetHeader className="p-4 border-b">
                  <SheetTitle className="flex items-center gap-2">
                    <img src={logo} alt="Vanessa Lima" className="h-8" />
                  </SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto py-2">
                  <div className="space-y-0.5 px-2">
                    {mainCategories.map((category) => (
                      <Link
                        key={category.id}
                        to={`/categoria/${category.slug}`}
                        className="flex items-center gap-3 py-3 px-3 hover:bg-muted rounded-lg transition-colors"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {category.image_url && (
                          <img src={category.image_url} alt={category.name} className="w-8 h-8 rounded-full object-cover" />
                        )}
                        <span className="font-medium text-sm">{category.name}</span>
                      </Link>
                    ))}
                  </div>
                  <div className="px-2 mt-2">
                    <Link
                      to={highlightUrl}
                      className="flex items-center gap-3 py-3 px-4 bg-secondary text-secondary-foreground rounded-lg font-medium text-sm"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <HighlightIcon className="h-4 w-4" />
                      {highlightText}
                    </Link>
                  </div>
                  <div className="border-t mt-4 pt-3 px-2 space-y-0.5">
                    <Link to="/favoritos" className="flex items-center gap-3 py-3 px-3 hover:bg-muted rounded-lg transition-colors" onClick={() => setMobileMenuOpen(false)}>
                      <Heart className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Favoritos</span>
                    </Link>
                    <Link to="/conta" className="flex items-center gap-3 py-3 px-3 hover:bg-muted rounded-lg transition-colors" onClick={() => setMobileMenuOpen(false)}>
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Minha Conta</span>
                    </Link>
                    <Link to="/atendimento" className="flex items-center gap-3 py-3 px-3 hover:bg-muted rounded-lg transition-colors" onClick={() => setMobileMenuOpen(false)}>
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Atendimento</span>
                    </Link>
                    <Link to="/rastreio" className="flex items-center gap-3 py-3 px-3 hover:bg-muted rounded-lg transition-colors" onClick={() => setMobileMenuOpen(false)}>
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Rastrear Pedido</span>
                    </Link>
                    <Link to="/faq" className="flex items-center gap-3 py-3 px-3 hover:bg-muted rounded-lg transition-colors" onClick={() => setMobileMenuOpen(false)}>
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Perguntas Frequentes</span>
                    </Link>
                  </div>
                </div>
                <div className="border-t p-4">
                  {headerSettings?.contact_whatsapp && (
                    <a
                      href={`https://wa.me/${(headerSettings.contact_whatsapp as string).replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 py-2.5 bg-[#25D366] text-white rounded-full font-medium text-sm"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Fale pelo WhatsApp
                    </a>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            {/* Logo */}
            <Link to="/" className="flex-shrink-0">
              <img src={logo} alt="Vanessa Lima Shoes" className="h-8 md:h-12" />
            </Link>
          </div>

          {/* CENTER ZONE: Search (desktop) */}
          <div className="hidden md:flex flex-1 justify-center max-w-xl mx-auto">
            <SearchPreview onSearch={handleSearch} className="w-full" />
          </div>

          {/* RIGHT ZONE: Icons */}
          <div className="flex items-center gap-1 sm:gap-2 md:gap-3 flex-shrink-0 ml-auto">
            <Link to="/favoritos" className="hidden md:flex items-center justify-center w-10 h-10 hover:text-primary transition-colors rounded-full hover:bg-muted" title="Favoritos">
              <Heart className="h-5 w-5" />
            </Link>

            {/* Atendimento dropdown with delay */}
            <div
              className="hidden md:flex relative"
              onMouseEnter={atendimentoDD.handleEnter}
              onMouseLeave={atendimentoDD.handleLeave}
            >
              <Link
                to="/atendimento"
                className="flex items-center gap-1.5 text-sm hover:text-primary transition-colors px-2 py-1.5 rounded-md hover:bg-muted"
              >
                <HelpCircle className="h-5 w-5" />
                <span className="font-medium hidden lg:inline">Ajuda</span>
                <ChevronDown className="h-3 w-3" />
              </Link>
              {atendimentoDD.open && (
                <div
                  className="absolute top-full right-0 pt-1 z-50"
                  onMouseEnter={atendimentoDD.handleEnter}
                  onMouseLeave={atendimentoDD.handleLeave}
                >
                  <div className="bg-background border rounded-lg shadow-xl py-2 w-52 animate-fade-in">
                    <Link to="/rastreio" className="block px-4 py-2.5 text-sm hover:bg-muted transition-colors" onClick={atendimentoDD.close}>
                      📦 Rastrear Pedido
                    </Link>
                    <Link to="/atendimento" className="block px-4 py-2.5 text-sm hover:bg-muted transition-colors" onClick={atendimentoDD.close}>
                      💬 Fale Conosco
                    </Link>
                    <Link to="/faq" className="block px-4 py-2.5 text-sm hover:bg-muted transition-colors" onClick={atendimentoDD.close}>
                      ❓ Perguntas Frequentes
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <Link to="/conta" className="hidden md:flex items-center gap-1.5 text-sm hover:text-primary transition-colors px-2 py-1.5 rounded-md hover:bg-muted" title="Minha Conta">
              <User className="h-5 w-5" />
              <span className="font-medium hidden lg:inline">Conta</span>
            </Link>

            {/* Mobile icons */}
            <Link to="/conta" className="md:hidden flex items-center justify-center w-10 h-10 min-w-[44px] min-h-[44px]">
              <User className="h-5 w-5" />
            </Link>

            {/* Cart */}
            <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="relative rounded-full border-2 border-primary bg-primary text-primary-foreground hover:bg-primary/90 min-w-[44px] min-h-[44px]">
                  <ShoppingBag className="h-5 w-5" />
                  {itemCount > 0 && (
                    <span className="absolute -top-2 -right-2 bg-secondary text-secondary-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold animate-scale-bounce" key={itemCount}>
                      {itemCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[85vw] max-w-lg flex flex-col p-0">
                <SheetHeader className="p-4 pb-0">
                  <SheetTitle>Carrinho de Compras</SheetTitle>
                </SheetHeader>
                
                {items.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Seu carrinho está vazio</p>
                    <Button asChild className="mt-4">
                      <Link to="/">Continuar comprando</Link>
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Scrollable area */}
                    <div className="flex-1 overflow-y-auto px-4 pb-2">
                      {/* Free shipping progress bar */}
                      <div className="bg-muted/50 rounded-lg p-3 mb-4 mt-2">
                        {hasFreeShipping ? (
                          <p className="text-sm text-primary font-medium text-center">
                            🎉 Parabéns! Você ganhou frete grátis!
                          </p>
                        ) : (
                          <>
                            <p className="text-sm text-center mb-2">
                              Faltam <span className="font-bold text-primary">{formatPrice(remainingForFreeShipping)}</span> para frete grátis
                            </p>
                            <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                              <div
                                className="bg-primary h-2.5 rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${freeShippingProgress}%` }}
                              />
                            </div>
                          </>
                        )}
                      </div>

                      {/* Cart items */}
                      <div className="space-y-3">
                        {items.map((item) => (
                          <div key={item.variant.id} className="flex gap-3 border-b pb-3">
                            <img
                              src={item.product.images?.[0]?.url || '/placeholder.svg'}
                              alt={item.product.name}
                              className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between gap-1">
                                <div className="min-w-0">
                                  <p className="font-medium text-sm line-clamp-1">{item.product.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Tam: {item.variant.size}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeItem(item.variant.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <div className="flex items-center justify-between mt-1.5">
                                <div className="flex items-center border rounded-lg">
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.variant.id, item.quantity - 1)}>
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-5 text-center text-xs">{item.quantity}</span>
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.variant.id, item.quantity + 1)}>
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                                <p className="font-bold text-sm">
                                  {formatPrice(Number(item.product.sale_price || item.product.base_price) * item.quantity)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Product suggestions - desktop only */}
                      {!isMobile && (
                        <div className="pt-3 border-t">
                          <CartProductSuggestions compact />
                        </div>
                      )}
                    </div>

                    {/* Fixed bottom: totals + buttons */}
                    <div className="border-t px-4 py-3 space-y-2 bg-background">
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Subtotal:</span>
                          <span>{formatPrice(subtotal)}</span>
                        </div>
                        {discount > 0 && (
                          <div className="flex justify-between text-sm text-primary">
                            <span>Desconto:</span>
                            <span>-{formatPrice(discount)}</span>
                          </div>
                        )}
                        {selectedShipping && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Frete:</span>
                            <span>{selectedShipping.price === 0 ? 'Grátis' : formatPrice(selectedShipping.price)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-base font-bold pt-1 border-t">
                          <span>Total:</span>
                          <span>{formatPrice(total)}</span>
                        </div>
                      </div>
                      
                      <Button asChild className="w-full" size="sm">
                        <Link to="/checkout/start" onClick={() => setIsCartOpen(false)}>Finalizar Compra</Link>
                      </Button>
                      <Button asChild variant="outline" className="w-full" size="sm">
                        <Link to="/carrinho" onClick={() => setIsCartOpen(false)}>Ver Carrinho Completo</Link>
                      </Button>
                    </div>
                  </>
                )}
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Mobile search */}
        <div className="md:hidden mt-2">
          <SearchPreview onSearch={handleSearch} />
        </div>
      </div>

      {/* Navigation with Mega Menu */}
      <nav className="border-t bg-background relative" ref={megaMenuRef}>
        <div className="container-custom">
          <div className="hidden md:flex items-center w-full">
            {/* All Categories - with delay */}
            <div
              className="relative flex-shrink-0"
              onMouseEnter={allCategoriesDD.handleEnter}
              onMouseLeave={allCategoriesDD.handleLeave}
            >
              <button className="nav-link flex items-center gap-2 py-4 px-4 hover:bg-muted transition-colors">
                <Menu className="h-4 w-4" />
                Todas Categorias
                <ChevronDown className="h-3 w-3" />
              </button>
              
              {allCategoriesDD.open && (
                <div
                  className="absolute top-full left-0 pt-1 z-50"
                  onMouseEnter={allCategoriesDD.handleEnter}
                  onMouseLeave={allCategoriesDD.handleLeave}
                >
                  <div
                    className="bg-background border rounded-lg shadow-xl p-6 grid grid-cols-3 sm:grid-cols-4 gap-4 animate-fade-in"
                    style={{ width: 'min(900px, 90vw)', maxHeight: '70vh', overflowY: 'auto' }}
                    ref={(el) => {
                      if (el) {
                        const rect = el.getBoundingClientRect();
                        if (rect.right > window.innerWidth - 16) {
                          el.style.left = 'auto';
                          el.style.right = '0';
                        }
                      }
                    }}
                  >
                    {categories?.map((category) => (
                      <Link
                        key={category.id}
                        to={`/categoria/${category.slug}`}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors group"
                        onClick={allCategoriesDD.close}
                      >
                        {category.image_url && (
                          <img src={category.image_url} alt={category.name} className="w-10 h-10 rounded-md object-cover" />
                        )}
                        <span className="font-medium group-hover:text-primary transition-colors">{category.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Individual category links - centered */}
            <div className="flex-1 flex items-center justify-center">
              {mainCategories.map((category) => {
                const categoryProducts = getProductsForCategory(category.id);
                
                return (
                  <div
                    key={category.id}
                    className="relative flex-shrink-0"
                    onMouseEnter={() => handleCatEnter(category.slug)}
                    onMouseLeave={handleCatLeave}
                  >
                    <Link
                      to={`/categoria/${category.slug}`}
                      className="nav-link flex items-center gap-1 py-4 px-3 hover:bg-muted transition-colors whitespace-nowrap"
                    >
                      {category.name}
                    </Link>
                    
                    {activeCatSlug === category.slug && (
                      <div
                        className="absolute top-full pt-1 z-50"
                        style={{
                          left: '50%',
                          transform: 'translateX(-50%)',
                        }}
                        onMouseEnter={() => handleCatEnter(category.slug)}
                        onMouseLeave={handleCatLeave}
                      >
                        <div
                          className="bg-background border rounded-lg shadow-xl p-6 animate-fade-in w-[min(800px,80vw)]"
                          style={{ maxWidth: 'calc(100vw - 2rem)' }}
                          ref={(el) => {
                            if (el) {
                              const rect = el.getBoundingClientRect();
                              if (rect.right > window.innerWidth - 16) {
                                el.style.left = 'auto';
                                el.style.right = '0';
                                el.style.transform = 'none';
                              }
                              if (rect.left < 16) {
                                el.style.left = '0';
                                el.style.transform = 'none';
                              }
                            }
                          }}
                        >
                          <div className="flex gap-6">
                            <div className="w-1/3">
                              <h3 className="font-bold text-lg mb-3">{category.name}</h3>
                              <p className="text-sm text-muted-foreground mb-4">{category.description}</p>
                              <Link
                                to={`/categoria/${category.slug}`}
                                className="inline-flex items-center text-primary font-medium hover:underline"
                                onClick={() => { setActiveCatSlug(null); }}
                              >
                                Ver todos os produtos →
                              </Link>
                            </div>
                            
                            {/* Products grid in mega menu */}
                            <div className="flex-1 grid grid-cols-2 gap-3">
                              {categoryProducts.length > 0 ? (
                                categoryProducts.map((product) => {
                                  const primaryImage = product.images?.find(img => img.is_primary) || product.images?.[0];
                                  return (
                                    <Link
                                      key={product.id}
                                      to={`/produto/${product.slug}`}
                                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors"
                                      onClick={() => setActiveCatSlug(null)}
                                    >
                                      <img
                                        src={primaryImage?.url || '/placeholder.svg'}
                                        alt={product.name}
                                        className="w-12 h-12 rounded-lg object-cover"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium line-clamp-1">{product.name}</p>
                                        <p className="text-sm text-primary font-bold">
                                          {formatPrice(Number(product.sale_price || product.base_price))}
                                        </p>
                                      </div>
                                    </Link>
                                  );
                                })
                              ) : (
                                <div className="col-span-2 text-center text-muted-foreground py-4">
                                  <img
                                    src={category.image_url || '/placeholder.svg'}
                                    alt={category.name}
                                    className="w-24 h-24 rounded-lg object-cover mx-auto"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Highlight button - right side */}
            <Link to={highlightUrl} className="flex-shrink-0 flex items-center gap-1.5 py-2 px-5 bg-secondary text-secondary-foreground rounded-full hover:bg-secondary/80 transition-colors font-medium text-sm ml-2">
              <HighlightIcon className="h-3.5 w-3.5" />
              {highlightText}
            </Link>
          </div>
        </div>
      </nav>

    </header>
  );
}
