import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { CartItem, Product, ProductVariant, Coupon, ShippingOption } from '@/types/database';
import { saveAbandonedCart } from '@/lib/utmTracker';
 
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
   const [items, setItems] = useState<CartItem[]>(() => {
     const stored = localStorage.getItem('cart');
     return stored ? JSON.parse(stored) : [];
   });
 
   const [isCartOpen, setIsCartOpen] = useState(false);
   const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(() => {
     const stored = localStorage.getItem('appliedCoupon');
     return stored ? JSON.parse(stored) : null;
   });
   const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(() => {
     const stored = localStorage.getItem('selectedShipping');
     return stored ? JSON.parse(stored) : null;
   });
   const [shippingZip, setShippingZip] = useState(() => {
     return localStorage.getItem('shippingZip') || '';
   });
 
  // Save cart to localStorage
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(items));
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
        price: Number(i.product.sale_price || i.product.base_price),
      }));
       const sub = items.reduce((sum, item) => {
         let variantPrice: number;
         if (item.variant.sale_price && Number(item.variant.sale_price) > 0) {
           variantPrice = Number(item.variant.sale_price);
         } else if (item.variant.base_price && Number(item.variant.base_price) > 0) {
           variantPrice = Number(item.variant.base_price);
         } else {
           variantPrice = Number(item.product.sale_price || item.product.base_price) + Number(item.variant.price_modifier || 0);
         }
         return sum + variantPrice * item.quantity;
       }, 0);
      saveAbandonedCart(cartData, sub);
    }, 30000); // Save after 30s of inactivity
    return () => { if (abandonedTimeout.current) clearTimeout(abandonedTimeout.current); };
  }, [items]);
 
   useEffect(() => {
     if (appliedCoupon) {
       localStorage.setItem('appliedCoupon', JSON.stringify(appliedCoupon));
     } else {
       localStorage.removeItem('appliedCoupon');
     }
   }, [appliedCoupon]);
 
   useEffect(() => {
     if (selectedShipping) {
       localStorage.setItem('selectedShipping', JSON.stringify(selectedShipping));
     } else {
       localStorage.removeItem('selectedShipping');
     }
   }, [selectedShipping]);
 
   useEffect(() => {
     localStorage.setItem('shippingZip', shippingZip);
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
     let variantPrice: number;
     if (item.variant.sale_price && Number(item.variant.sale_price) > 0) {
       variantPrice = Number(item.variant.sale_price);
     } else if (item.variant.base_price && Number(item.variant.base_price) > 0) {
       variantPrice = Number(item.variant.base_price);
     } else {
       const productPrice = item.product.sale_price || item.product.base_price;
       variantPrice = Number(productPrice) + Number(item.variant.price_modifier || 0);
     }
     return sum + variantPrice * item.quantity;
   }, 0);
 
   const applyCoupon = (coupon: Coupon) => {
     setAppliedCoupon(coupon);
   };
 
   const removeCoupon = () => {
     setAppliedCoupon(null);
   };
 
   const discount = appliedCoupon
     ? appliedCoupon.discount_type === 'percentage'
       ? (subtotal * appliedCoupon.discount_value) / 100
       : appliedCoupon.discount_value
     : 0;
 
   const total = subtotal - discount + (selectedShipping?.price || 0);
 
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