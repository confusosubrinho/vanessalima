import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { CartItem, Product, ProductVariant, Coupon, ShippingOption } from '@/types/database';
import { saveAbandonedCart } from '@/lib/utmTracker';
import { getCartItemUnitPrice } from '@/lib/cartPricing';
import { computeCouponDiscount } from '@/lib/couponDiscount';

function safeParse<T>(key: string, fallback: T, validate?: (parsed: unknown) => parsed is T): T {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored) as unknown;
    if (validate && !validate(parsed)) return fallback;
    return (parsed as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function isValidCartItem(x: unknown): x is CartItem {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.product === 'object' && o.product !== null &&
    typeof (o.product as Record<string, unknown>).id === 'string' &&
    typeof o.variant === 'object' && o.variant !== null &&
    typeof (o.variant as Record<string, unknown>).id === 'string' &&
    typeof o.quantity === 'number' && o.quantity > 0
  );
}

function safeParseCart(): CartItem[] {
  const parsed = safeParse<unknown>('cart', []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidCartItem);
}

function safeParseCoupon(): Coupon | null {
  const parsed = safeParse<unknown>('appliedCoupon', null);
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.discount_type !== 'string' || (o.discount_value !== undefined && typeof o.discount_value !== 'number')) return null;
  return parsed as Coupon;
}

function safeParseShipping(): ShippingOption | null {
  const parsed = safeParse<unknown>('selectedShipping', null);
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.price !== 'number') return null;
  return parsed as ShippingOption;
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // quota exceeded or storage disabled
  }
}

 interface CartContextType {
   items: CartItem[];
   addItem: (product: Product, variant: ProductVariant, quantity?: number) => void;
   removeItem: (variantId: string) => void;
   updateQuantity: (variantId: string, quantity: number) => void;
   clearCart: () => void;
   itemCount: number;
   subtotal: number;
   isCartOpen: boolean;
   setIsCartOpen: (open: boolean) => void;
   appliedCoupon: Coupon | null;
   applyCoupon: (coupon: Coupon) => void;
   removeCoupon: () => void;
   discount: number;
   selectedShipping: ShippingOption | null;
   setSelectedShipping: (shipping: ShippingOption | null) => void;
   shippingZip: string;
   setShippingZip: (zip: string) => void;
   total: number;
 }
 
 const CartContext = createContext<CartContextType | undefined>(undefined);
 
 export function CartProvider({ children }: { children: ReactNode }) {
   const [items, setItems] = useState<CartItem[]>(() => safeParseCart());
 
   const [isCartOpen, setIsCartOpen] = useState(false);
   const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(() => safeParseCoupon());
   const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(() => safeParseShipping());
   const [shippingZip, setShippingZip] = useState(() => {
     try {
       return localStorage.getItem('shippingZip') || '';
     } catch {
       return '';
     }
   });
 
  // Save cart to localStorage
  useEffect(() => {
    safeSetItem('cart', JSON.stringify(items));
  }, [items]);

  // Track abandoned carts (debounced)
  const abandonedTimeout = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (items.length === 0) return;
    if (abandonedTimeout.current) clearTimeout(abandonedTimeout.current);
    abandonedTimeout.current = setTimeout(() => {
      const cartData = items.map(i => ({
        product: { id: i.product.id, name: i.product.name, slug: i.product.slug },
        variant: { id: i.variant.id, size: i.variant.size, color: i.variant.color },
        quantity: i.quantity,
        price: getCartItemUnitPrice(i),
      }));
      const sub = items.reduce((sum, item) => sum + getCartItemUnitPrice(item) * item.quantity, 0);
      saveAbandonedCart(cartData, sub);
    }, 30000); // Save after 30s of inactivity
    return () => { if (abandonedTimeout.current) clearTimeout(abandonedTimeout.current); };
  }, [items]);
 
   useEffect(() => {
     if (appliedCoupon) {
       safeSetItem('appliedCoupon', JSON.stringify(appliedCoupon));
     } else {
       try { localStorage.removeItem('appliedCoupon'); } catch { /* noop */ }
     }
   }, [appliedCoupon]);
 
   useEffect(() => {
     if (selectedShipping) {
       safeSetItem('selectedShipping', JSON.stringify(selectedShipping));
     } else {
       try { localStorage.removeItem('selectedShipping'); } catch { /* noop */ }
     }
   }, [selectedShipping]);
 
   useEffect(() => {
     safeSetItem('shippingZip', shippingZip);
   }, [shippingZip]);
 
   const addItem = (product: Product, variant: ProductVariant, quantity = 1) => {
     setItems(prev => {
       const existing = prev.find(item => item.variant.id === variant.id);
       if (existing) {
         return prev.map(item =>
           item.variant.id === variant.id
             ? { ...item, quantity: item.quantity + quantity }
             : item
         );
       }
       return [...prev, { product, variant, quantity }];
     });
     setIsCartOpen(true);
   };
 
   const removeItem = (variantId: string) => {
     setItems(prev => prev.filter(item => item.variant.id !== variantId));
   };
 
   const updateQuantity = (variantId: string, quantity: number) => {
     if (quantity <= 0) {
       removeItem(variantId);
       return;
     }
     setItems(prev =>
       prev.map(item =>
         item.variant.id === variantId ? { ...item, quantity } : item
       )
     );
   };
 
   const clearCart = () => {
     setItems([]);
     setAppliedCoupon(null);
     setSelectedShipping(null);
   };
 
   const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
 
   const subtotal = items.reduce((sum, item) => {
    return sum + getCartItemUnitPrice(item) * item.quantity;
   }, 0);
 
   const applyCoupon = (coupon: Coupon) => {
     setAppliedCoupon(coupon);
   };
 
   const removeCoupon = () => {
     setAppliedCoupon(null);
   };
 
  const rawDiscount = computeCouponDiscount(appliedCoupon, items, subtotal);
  const discount = Math.min(subtotal, Math.max(0, rawDiscount));
 
  const total = Math.max(0, subtotal - discount) + (selectedShipping?.price || 0);
 
   return (
     <CartContext.Provider value={{
       items,
       addItem,
       removeItem,
       updateQuantity,
       clearCart,
       itemCount,
       subtotal,
       isCartOpen,
       setIsCartOpen,
       appliedCoupon,
       applyCoupon,
       removeCoupon,
       discount,
       selectedShipping,
       setSelectedShipping,
       shippingZip,
       setShippingZip,
       total,
     }}>
       {children}
     </CartContext.Provider>
   );
 }
 
 export function useCart() {
   const context = useContext(CartContext);
   if (!context) {
     throw new Error('useCart must be used within a CartProvider');
   }
   return context;
 }