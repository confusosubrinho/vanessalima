import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface HelpArticle {
  id: string;
  key: string;
  title: string;
  content: string;
  audience: string;
  created_at: string;
  updated_at: string;
}

export function useHelpArticle(key: string) {
  return useQuery({
    queryKey: ['help-article', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('help_articles')
        .select('*')
        .eq('key', key)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as HelpArticle | null;
    },
    staleTime: 1000 * 60 * 10, // 10 min cache
    gcTime: 1000 * 60 * 15,
    enabled: !!key,
  });
}

export function useHelpArticles() {
  return useQuery({
    queryKey: ['help-articles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('help_articles')
        .select('*')
        .order('key', { ascending: true });
      if (error) throw error;
      return (data as unknown as HelpArticle[]) || [];
    },
    staleTime: 1000 * 60 * 5,
  });
}
