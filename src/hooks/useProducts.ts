import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Product, Category, Banner, StoreSettings } from '@/types/database';
import { logApiError } from '@/lib/errorLogger';
 
export function useProducts(categorySlug?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['products', categorySlug],
    enabled: options?.enabled !== false,
    staleTime: 1000 * 60 * 5, // 5 min - reduz requisições ao navegar
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

 export function useSearchProducts(searchTerm: string) {
   const escaped = searchTerm.replace(/[%_\\]/g, '\\$&');
   return useQuery({
     queryKey: ['products', 'search', searchTerm],
     enabled: searchTerm.length > 0,
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
         .or(`name.ilike.%${escaped}%,description.ilike.%${escaped}%`)
         .order('created_at', { ascending: false })
         .limit(100);
       if (error) throw error;
       return (data as Product[]) || [];
     },
     staleTime: 1000 * 60 * 2,
   });
 }

/** Busca leve para o dropdown do header; resultado em cache evita nova requisição ao digitar de novo. */
export function useSearchPreviewProducts(searchTerm: string) {
  const trimmed = searchTerm.trim();
  const escaped = trimmed.replace(/[%_\\]/g, '\\$&');
  return useQuery({
    queryKey: ['products', 'search-preview', trimmed],
    enabled: trimmed.length >= 2,
    staleTime: 1000 * 60 * 2, // 2 min - mesma busca não repete request
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          name,
          slug,
          base_price,
          sale_price,
          images:product_images(url, is_primary)
        `)
        .eq('is_active', true)
        .ilike('name', `%${escaped}%`)
        .limit(6);
      if (error) throw error;
      return (data as Product[]) || [];
    },
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: ['product', slug],
    staleTime: 1000 * 60 * 5, // 5 min - produto não muda a todo momento
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
     refetchOnMount: 'always', // evita tela de erro por cache antigo ao navegar de outro produto
     retry: 2,
     retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
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
    staleTime: 1000 * 60 * 10, // 10 min - catálogo raramente muda
    refetchOnMount: false,
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
      refetchOnMount: false,
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
      staleTime: 1000 * 60 * 10,
      refetchOnMount: false,
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