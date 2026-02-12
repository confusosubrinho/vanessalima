import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SocialLink {
  id: string;
  name: string;
  url: string;
  icon_type: 'default' | 'custom';
  icon_image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useSocialLinks() {
  return useQuery({
    queryKey: ['social-links'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_links' as any)
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data as unknown as SocialLink[]) || [];
    },
    staleTime: 1000 * 60 * 10,
  });
}

export function useSocialLinksAdmin() {
  return useQuery({
    queryKey: ['social-links-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_links' as any)
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data as unknown as SocialLink[]) || [];
    },
  });
}
