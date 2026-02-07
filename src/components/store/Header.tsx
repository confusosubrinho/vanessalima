import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, ShoppingBag, Menu, X, Phone, MessageCircle, ChevronDown, Trash2, Plus, Minus, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useCart } from '@/contexts/CartContext';
import { useCategories, useProducts } from '@/hooks/useProducts';
import logo from '@/assets/logo.png';
import { ShippingCalculator } from './ShippingCalculator';
import { CouponInput } from './CouponInput';
import { SearchPreview } from './SearchPreview';

export function Header() {
  const navigate = useNavigate();
  const { itemCount, items, subtotal, removeItem, updateQuantity, isCartOpen, setIsCartOpen, discount, selectedShipping, total } = useCart();
  const { data: categories } = useCategories();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeMegaMenu, setActiveMegaMenu] = useState<string | null>(null);
  const megaMenuRef = useRef<HTMLDivElement>(null);

  // Fetch products for each category for mega menu
  const { data: allProducts } = useProducts();

  const handleSearch = (query: string) => {
    navigate(`/busca?q=${encodeURIComponent(query)}`);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  };

  // Close mega menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (megaMenuRef.current && !megaMenuRef.current.contains(event.target as Node)) {
        setActiveMegaMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const mainCategories = categories?.slice(0, 7) || [];

  // Get products for a category
  const getProductsForCategory = (categoryId: string) => {
    return allProducts?.filter(p => p.category_id === categoryId)?.slice(0, 4) || [];
  };

  return (
    <header className="sticky top-0 z-50 bg-background shadow-sm">
      {/* Top bar */}
      <div className="bg-primary text-primary-foreground text-sm py-2">
        <div className="container-custom flex items-center justify-between">
          <div className="hidden md:flex items-center gap-4">
            <a href="tel:42991120205" className="flex items-center gap-1 hover:underline">
              <Phone className="h-3 w-3" />
              42 99112-0205
            </a>
            <a href="https://wa.me/5542991120205" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
              <MessageCircle className="h-3 w-3" />
              WhatsApp
            </a>
          </div>
          <div className="text-center flex-1 md:flex-none">
            <span className="font-medium">Frete grátis para compras acima de R$ 399*</span>
          </div>
          <div className="hidden md:block">
            <span>Parcelamos em até 6x sem juros</span>
          </div>
        </div>
      </div>

      {/* Main header */}
      <div className="container-custom py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Mobile menu */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>

          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            <img src={logo} alt="Vanessa Lima Shoes" className="h-10 md:h-14" />
          </Link>

          {/* Search with Preview */}
          <SearchPreview onSearch={handleSearch} className="hidden md:flex flex-1 max-w-lg" />

          {/* Actions */}
          <div className="flex items-center gap-1">
            <div className="hidden md:flex items-center gap-1 text-sm mr-2">
              <MessageCircle className="h-4 w-4" />
              <span className="text-muted-foreground">Atendimento</span>
            </div>
            <Link to="/conta" className="hidden md:flex items-center gap-1 text-sm mr-2 hover:text-primary transition-colors">
              <User className="h-4 w-4" />
              <span>Minha Conta</span>
            </Link>

            <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <ShoppingBag className="h-5 w-5" />
                  {itemCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center">
                      {itemCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-lg">
                <SheetHeader>
                  <SheetTitle>Carrinho de Compras</SheetTitle>
                </SheetHeader>
                <div className="mt-4 flex flex-col h-[calc(100vh-8rem)]">
                  {items.length === 0 ? (
                    <div className="text-center py-8">
                      <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Seu carrinho está vazio</p>
                      <Button asChild className="mt-4">
                        <Link to="/">Continuar comprando</Link>
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                        {items.map((item) => (
                          <div key={item.variant.id} className="flex gap-3 border-b pb-4">
                            <img
                              src={item.product.images?.[0]?.url || '/placeholder.svg'}
                              alt={item.product.name}
                              className="w-20 h-20 object-cover rounded-lg"
                            />
                            <div className="flex-1">
                              <div className="flex justify-between">
                                <div>
                                  <p className="font-medium">{item.product.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    Tamanho: {item.variant.size}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeItem(item.variant.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <div className="flex items-center border rounded-lg">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => updateQuantity(item.variant.id, item.quantity - 1)}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-8 text-center text-sm">{item.quantity}</span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => updateQuantity(item.variant.id, item.quantity + 1)}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                                <p className="font-bold">
                                  {formatPrice(Number(item.product.sale_price || item.product.base_price) * item.quantity)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="border-t pt-4 space-y-3 mt-auto">
                        {/* Coupon Input */}
                        <CouponInput compact />
                        
                        {/* Shipping Calculator */}
                        <div className="pt-2 border-t">
                          <div className="flex items-center gap-2 text-sm font-medium mb-2">
                            <Tag className="h-4 w-4 text-primary" />
                            <span>Calcular Frete</span>
                          </div>
                          <ShippingCalculator compact />
                        </div>
                        
                        {/* Totals */}
                        <div className="pt-3 border-t space-y-2">
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
                              <span className="text-muted-foreground">Frete ({selectedShipping.name}):</span>
                              <span>{selectedShipping.price === 0 ? 'Grátis' : formatPrice(selectedShipping.price)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-lg font-bold pt-2 border-t">
                            <span>Total:</span>
                            <span>{formatPrice(total)}</span>
                          </div>
                        </div>
                        
                        <Button asChild className="w-full">
                          <Link to="/checkout" onClick={() => setIsCartOpen(false)}>Finalizar Compra</Link>
                        </Button>
                        <Button asChild variant="outline" className="w-full">
                          <Link to="/carrinho" onClick={() => setIsCartOpen(false)}>Ver Carrinho Completo</Link>
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Mobile search with Preview */}
        <div className="md:hidden mt-4">
          <SearchPreview onSearch={handleSearch} />
        </div>
      </div>

      {/* Navigation with Mega Menu */}
      <nav className="border-t bg-background relative" ref={megaMenuRef}>
        <div className="container-custom">
          <div className="hidden md:flex items-center justify-between">
            <div className="flex items-center">
              {/* All Categories */}
              <div
                className="relative"
                onMouseEnter={() => setActiveMegaMenu('all')}
                onMouseLeave={() => setActiveMegaMenu(null)}
              >
                <button className="nav-link flex items-center gap-2 py-4 px-4 hover:bg-muted transition-colors">
                  <Menu className="h-4 w-4" />
                  Todas Categorias
                  <ChevronDown className="h-3 w-3" />
                </button>
                
                {activeMegaMenu === 'all' && (
                  <div className="absolute top-full left-0 w-[600px] bg-background border rounded-lg shadow-xl z-50 p-6 grid grid-cols-3 gap-6 animate-fade-in">
                    {categories?.map((category) => (
                      <Link
                        key={category.id}
                        to={`/categoria/${category.slug}`}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors group"
                        onClick={() => setActiveMegaMenu(null)}
                      >
                        <img
                          src={category.image_url || '/placeholder.svg'}
                          alt={category.name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                        <span className="font-medium group-hover:text-primary transition-colors">{category.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Individual category links with mega menu showing products */}
              {mainCategories.map((category) => {
                const categoryProducts = getProductsForCategory(category.id);
                
                return (
                  <div
                    key={category.id}
                    className="relative"
                    onMouseEnter={() => setActiveMegaMenu(category.slug)}
                    onMouseLeave={() => setActiveMegaMenu(null)}
                  >
                    <Link
                      to={`/categoria/${category.slug}`}
                      className="nav-link flex items-center gap-1 py-4 px-3 hover:bg-muted transition-colors"
                    >
                      {category.name}
                    </Link>
                    
                    {activeMegaMenu === category.slug && (
                      <div className="absolute top-full left-0 w-[600px] bg-background border rounded-lg shadow-xl z-50 p-6 animate-fade-in">
                        <div className="flex gap-6">
                          <div className="w-1/3">
                            <h3 className="font-bold text-lg mb-3">{category.name}</h3>
                            <p className="text-sm text-muted-foreground mb-4">{category.description}</p>
                            <Link
                              to={`/categoria/${category.slug}`}
                              className="inline-flex items-center text-primary font-medium hover:underline"
                              onClick={() => setActiveMegaMenu(null)}
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
                                    onClick={() => setActiveMegaMenu(null)}
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
                    )}
                  </div>
                );
              })}
            </div>
            <Link to="/outlet" className="bg-secondary text-secondary-foreground px-4 py-2 my-2 rounded-full text-sm font-medium hover:bg-secondary/90 transition-colors flex items-center gap-1">
              <span className="text-lg">✨</span>
              ✨ Outlet
            </Link>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-background animate-slide-up">
          <div className="container-custom py-4 space-y-2">
            <Link
              to="/categorias"
              className="block py-2 nav-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              Todas Categorias
            </Link>
            {categories?.map((category) => (
              <Link
                key={category.id}
                to={`/categoria/${category.slug}`}
                className="block py-2 nav-link"
                onClick={() => setMobileMenuOpen(false)}
              >
                {category.name}
              </Link>
            ))}
            <Link
              to="/outlet"
              className="block py-2 text-primary font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              ✨ Outlet
            </Link>
            <Link
              to="/conta"
              className="block py-2 nav-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              Minha Conta
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
