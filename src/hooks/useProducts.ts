import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Product, Category, Banner, StoreSettings } from '@/types/database';
import { logApiError } from '@/lib/errorLogger';
 
 export function useProducts(categorySlug?: string) {
   return useQuery({
     queryKey: ['products', categorySlug],
     queryFn: async () => {
       let query = supabase
         .from('products')
         .select(`
           *,
           category:categories(*),
           images:product_images(*),
           variants:product_variants(*)
         `)
         .eq('is_active', true)
         .order('created_at', { ascending: false });
 
       if (categorySlug) {
         const { data: category } = await supabase
           .from('categories')
           .select('id')
           .eq('slug', categorySlug)
           .single();
         
         if (category) {
           query = query.eq('category_id', category.id);
         }
       }
 
      const { data, error } = await query;
      if (error) {
        if (error.message?.includes('JWT expired')) {
          await supabase.auth.signOut();
          const { data: retryData, error: retryError } = await query;
          if (retryError) throw retryError;
          return (retryData as Product[])?.filter(p => hasStock(p)) || [];
        }
        logApiError('useProducts', error, { categorySlug });
        throw error;
      }
      // Only return products that have at least one variant with stock > 0
      return (data as Product[])?.filter(p => hasStock(p)) || [];
     },
   });
 }

 // Helper: check if product has any variant with stock
 function hasStock(product: Product): boolean {
   const variants = (product as any).variants;
   if (!variants || variants.length === 0) return true; // no variants = assume available
   return variants.some((v: any) => v.stock_quantity > 0 && v.is_active !== false);
 }
 
 export function useProduct(slug: string) {
   return useQuery({
     queryKey: ['product', slug],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('products')
         .select(`
           *,
           category:categories(*),
           images:product_images(*),
           variants:product_variants(*)
         `)
         .eq('slug', slug)
         .single();
       
       if (error) throw error;
       return data as Product;
     },
     enabled: !!slug,
   });
 }
 
 export function useFeaturedProducts() {
   return useQuery({
     queryKey: ['products', 'featured'],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('products')
         .select(`
           *,
           category:categories(*),
           images:product_images(*),
           variants:product_variants(*)
         `)
         .eq('is_active', true)
         .eq('is_featured', true)
         .order('created_at', { ascending: false })
         .limit(20);
       
       if (error) throw error;
       return (data as Product[])?.filter(p => hasStock(p)) || [];
     },
   });
 }
 
 export function useCategories() {
   return useQuery({
     queryKey: ['categories'],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('categories')
         .select('*')
         .eq('is_active', true)
         .order('display_order', { ascending: true });
       
       if (error) throw error;
       return data as Category[];
     },
   });
 }
 
 export function useBanners() {
   return useQuery({
     queryKey: ['banners'],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('banners')
         .select('*')
         .eq('is_active', true)
         .order('display_order', { ascending: true });
       
       if (error) throw error;
       return data as Banner[];
     },
   });
 }
 
 export function useStoreSettings() {
   return useQuery({
     queryKey: ['store-settings'],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('store_settings')
         .select('*')
         .single();
       
       if (error) throw error;
       return data as StoreSettings;
     },
   });
 }