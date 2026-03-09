import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  featured_image_url: string | null;
  status: 'draft' | 'published';
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  author_name: string | null;
  category_tag: string | null;
  tags: string[];
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface BlogSettings {
  id: string;
  is_active: boolean;
  posts_per_page: number;
  created_at: string;
  updated_at: string;
}

export function useBlogSettings() {
  return useQuery({
    queryKey: ['blog-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as BlogSettings | null;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useBlogPosts(onlyPublished = true) {
  return useQuery({
    queryKey: ['blog-posts', onlyPublished ? 'published' : 'all'],
    queryFn: async () => {
      let query = supabase
        .from('blog_posts')
        .select('*')
        .order('published_at', { ascending: false, nullsFirst: false });

      if (onlyPublished) {
        query = query.eq('status', 'published');
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as BlogPost[]) || [];
    },
    staleTime: 1000 * 60 * 2,
  });
}

export function useBlogPost(slug: string) {
  return useQuery({
    queryKey: ['blog-post', slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw error;
      return data as BlogPost | null;
    },
    staleTime: 1000 * 60 * 5,
  });
}
