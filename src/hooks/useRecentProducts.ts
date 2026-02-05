 import { useQuery } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { Product } from '@/types/database';
 
 export function useRecentProducts(currentProductId?: string) {
   return useQuery({
     queryKey: ['products', 'recent', currentProductId],
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
         .order('created_at', { ascending: false })
         .limit(8);
 
       if (currentProductId) {
         query = query.neq('id', currentProductId);
       }
 
       const { data, error } = await query;
       if (error) throw error;
       return data as Product[];
     },
   });
 }
 
 export function useRelatedProducts(categoryId?: string | null, currentProductId?: string) {
   return useQuery({
     queryKey: ['products', 'related', categoryId, currentProductId],
     queryFn: async () => {
       if (!categoryId) return [];
 
       let query = supabase
         .from('products')
         .select(`
           *,
           category:categories(*),
           images:product_images(*),
           variants:product_variants(*)
         `)
         .eq('is_active', true)
         .eq('category_id', categoryId)
         .limit(8);
 
       if (currentProductId) {
         query = query.neq('id', currentProductId);
       }
 
       const { data, error } = await query;
       if (error) throw error;
       return data as Product[];
     },
     enabled: !!categoryId,
   });
 }