import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface HomePageSection {
  id: string;
  section_key: string;
  section_type: string;
  label: string;
  is_active: boolean;
  display_order: number;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Native section keys that cannot be deleted
export const NATIVE_SECTION_KEYS = [
  'banner_carousel',
  'features_bar',
  'category_grid',
  'product_sections',
  'highlight_banners',
  'shop_by_size',
  'instagram_feed',
  'customer_testimonials',
  'newsletter',
];

export function useHomePageSections() {
  return useQuery({
    queryKey: ['home-page-sections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('home_page_sections' as any)
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data as unknown as HomePageSection[]) || [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useAdminHomePageSections() {
  return useQuery({
    queryKey: ['admin-home-page-sections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('home_page_sections' as any)
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data as unknown as HomePageSection[]) || [];
    },
  });
}
