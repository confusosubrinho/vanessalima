 import { useState } from 'react';
 import { Link, useNavigate } from 'react-router-dom';
 import { Search, User, ShoppingBag, Menu, X, Phone, MessageCircle } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
 import { useCart } from '@/contexts/CartContext';
 import { useCategories } from '@/hooks/useProducts';
 import logo from '@/assets/logo.png';
 
 export function Header() {
   const navigate = useNavigate();
   const { itemCount, items, subtotal } = useCart();
   const { data: categories } = useCategories();
   const [searchQuery, setSearchQuery] = useState('');
   const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
 
   const handleSearch = (e: React.FormEvent) => {
     e.preventDefault();
     if (searchQuery.trim()) {
       navigate(`/busca?q=${encodeURIComponent(searchQuery)}`);
     }
   };
 
   const formatPrice = (price: number) => {
     return new Intl.NumberFormat('pt-BR', {
       style: 'currency',
       currency: 'BRL',
     }).format(price);
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
 
           {/* Search */}
           <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-lg">
             <div className="relative w-full">
               <Input
                 type="search"
                 placeholder="O que você procura?"
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="input-search w-full pr-10"
               />
               <Button
                 type="submit"
                 variant="ghost"
                 size="icon"
                 className="absolute right-0 top-0 h-full"
               >
                 <Search className="h-4 w-4" />
               </Button>
             </div>
           </form>
 
           {/* Actions */}
           <div className="flex items-center gap-2">
             <Link to="/conta">
               <Button variant="ghost" size="icon" className="hidden md:flex">
                 <User className="h-5 w-5" />
               </Button>
             </Link>
 
             <Sheet>
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
               <SheetContent>
                 <SheetHeader>
                   <SheetTitle>Carrinho de Compras</SheetTitle>
                 </SheetHeader>
                 <div className="mt-4">
                   {items.length === 0 ? (
                     <div className="text-center py-8">
                       <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                       <p className="text-muted-foreground">Seu carrinho está vazio</p>
                       <Button asChild className="mt-4">
                         <Link to="/">Continuar comprando</Link>
                       </Button>
                     </div>
                   ) : (
                     <div className="space-y-4">
                       {items.map((item) => (
                         <div key={item.variant.id} className="flex gap-3 border-b pb-3">
                           <img
                             src={item.product.images?.[0]?.url || '/placeholder.svg'}
                             alt={item.product.name}
                             className="w-16 h-16 object-cover rounded"
                           />
                           <div className="flex-1">
                             <p className="font-medium text-sm">{item.product.name}</p>
                             <p className="text-xs text-muted-foreground">
                               Tam: {item.variant.size} | Qtd: {item.quantity}
                             </p>
                             <p className="text-sm font-bold mt-1">
                               {formatPrice((item.product.sale_price || item.product.base_price) * item.quantity)}
                             </p>
                           </div>
                         </div>
                       ))}
                       <div className="border-t pt-4">
                         <div className="flex justify-between font-bold text-lg">
                           <span>Subtotal:</span>
                           <span>{formatPrice(subtotal)}</span>
                         </div>
                         <Button asChild className="w-full mt-4">
                           <Link to="/checkout">Finalizar Compra</Link>
                         </Button>
                       </div>
                     </div>
                   )}
                 </div>
               </SheetContent>
             </Sheet>
           </div>
         </div>
 
         {/* Mobile search */}
         <form onSubmit={handleSearch} className="md:hidden mt-4">
           <div className="relative">
             <Input
               type="search"
               placeholder="O que você procura?"
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="input-search w-full pr-10"
             />
             <Button type="submit" variant="ghost" size="icon" className="absolute right-0 top-0 h-full">
               <Search className="h-4 w-4" />
             </Button>
           </div>
         </form>
       </div>
 
       {/* Navigation */}
       <nav className="border-t bg-background">
         <div className="container-custom">
           <div className="hidden md:flex items-center justify-between py-3">
             <div className="flex items-center gap-6">
               <Link to="/categorias" className="nav-link flex items-center gap-2">
                 <Menu className="h-4 w-4" />
                 Todas Categorias
               </Link>
               {categories?.slice(0, 7).map((category) => (
                 <Link
                   key={category.id}
                   to={`/categoria/${category.slug}`}
                   className="nav-link"
                 >
                   {category.name}
                 </Link>
               ))}
             </div>
             <Link to="/outlet" className="bg-secondary text-secondary-foreground px-4 py-2 rounded-full text-sm font-medium hover:bg-secondary/90 transition-colors">
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