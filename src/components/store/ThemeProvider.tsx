import { useEffect } from 'react';
import { useSiteTheme } from '@/hooks/useSiteTheme';
import { useStoreSettingsPublic } from '@/hooks/useStoreContact';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useSiteTheme();
  const { data: storePublic } = useStoreSettingsPublic();

  useEffect(() => {
    const raw = storePublic as { favicon_url?: string; updated_at?: string } | null;
    const url = raw?.favicon_url;
    if (!url) return;
    // Cache-bust: append updated_at so browser never serves stale favicon
    const bust = raw?.updated_at ? `?v=${encodeURIComponent(raw.updated_at)}` : `?v=${Date.now()}`;
    const fullUrl = `${url}${bust}`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = url.toLowerCase().endsWith('.ico') ? 'image/x-icon' : 'image/png';
    link.href = fullUrl;
  }, [storePublic]);

  return <>{children}</>;
}
