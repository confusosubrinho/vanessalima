/**
 * Preload da imagem LCP (primeiro banner) para que o navegador descubra o recurso
 * o mais cedo possível e melhore o LCP (PageSpeed: "solicitação detectável no documento").
 */
import { supabase } from '@/integrations/supabase/client';

const PRELOAD_ID = 'lcp-banner-preload';

export function preloadLcpImage(): void {
  if (typeof document === 'undefined' || !document.head) return;
  const url = (import.meta.env?.VITE_SUPABASE_URL ?? '').trim();
  if (!url || url.includes('placeholder')) return;

  Promise.resolve(
    supabase
      .from('banners')
      .select('image_url, mobile_image_url, show_on_mobile')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .limit(1)
      .maybeSingle()
  )
    .then(({ data }) => {
      if (!data?.image_url) return;
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const imageUrl =
        isMobile && data.mobile_image_url
          ? data.mobile_image_url
          : data.image_url;
      if (!imageUrl || imageUrl.startsWith('placeholder')) return;
      let link = document.getElementById(PRELOAD_ID) as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.id = PRELOAD_ID;
        link.rel = 'preload';
        link.as = 'image';
        document.head.appendChild(link);
      }
      link.href = imageUrl;
    })
    .catch(() => {});
}
