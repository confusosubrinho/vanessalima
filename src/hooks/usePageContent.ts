import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PageContent {
  id: string;
  page_slug: string;
  page_title: string;
  content: string | null;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
}

export function usePageContent(slug: string) {
  return useQuery({
    queryKey: ['page-content', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('page_contents')
        .select('*')
        .eq('page_slug', slug)
        .maybeSingle();
      if (error) throw error;
      return data as PageContent | null;
    },
    staleTime: 1000 * 60 * 10,
    enabled: !!slug,
  });
}
