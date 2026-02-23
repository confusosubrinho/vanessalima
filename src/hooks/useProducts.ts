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
            // Also find child categories
            const { data: childCategories } = await supabase
              .from('categories')
              .select('id')
              .eq('parent_category_id', category.id);
            
            const categoryIds = [category.id, ...(childCategories?.map(c => c.id) || [])];
            query = query.in('category_id', categoryIds);
          }
        }
 
      const { data, error } = await query;
      if (error) {
        if (error.message?.includes('JWT expired')) {
          await supabase.auth.signOut();
          const { data: retryData, error: retryError } = await query;
          if (retryError) throw retryError;
          return (retryData as Product[]) || [];
        }
        logApiError('useProducts', error, { categorySlug });
        throw error;
      }
      return (data as Product[]) || [];
     },
   });
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
        return (data as Product[]) || [];
      },
      staleTime: 1000 * 60 * 5,
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
      staleTime: 1000 * 60 * 10,
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
      staleTime: 1000 * 60 * 5,
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
      staleTime: 1000 * 60 * 10,
    });
  }