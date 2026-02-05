 import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
 import { CartItem, Product, ProductVariant } from '@/types/database';
 
 interface CartContextType {
   items: CartItem[];
   addItem: (product: Product, variant: ProductVariant, quantity?: number) => void;
   removeItem: (variantId: string) => void;
   updateQuantity: (variantId: string, quantity: number) => void;
   clearCart: () => void;
   itemCount: number;
   subtotal: number;
 }
 
 const CartContext = createContext<CartContextType | undefined>(undefined);
 
 export function CartProvider({ children }: { children: ReactNode }) {
   const [items, setItems] = useState<CartItem[]>(() => {
     const stored = localStorage.getItem('cart');
     return stored ? JSON.parse(stored) : [];
   });
 
   useEffect(() => {
     localStorage.setItem('cart', JSON.stringify(items));
   }, [items]);
 
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
 
   const clearCart = () => setItems([]);
 
   const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
 
   const subtotal = items.reduce((sum, item) => {
     const price = item.product.sale_price || item.product.base_price;
     return sum + (Number(price) + Number(item.variant.price_modifier || 0)) * item.quantity;
   }, 0);
 
   return (
     <CartContext.Provider value={{
       items,
       addItem,
       removeItem,
       updateQuantity,
       clearCart,
       itemCount,
       subtotal,
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