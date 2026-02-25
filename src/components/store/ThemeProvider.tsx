import { useEffect } from 'react';
import { useSiteTheme } from '@/hooks/useSiteTheme';
import { useStoreSettingsPublic } from '@/hooks/useStoreContact';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useSiteTheme();
  const { data: storePublic } = useStoreSettingsPublic();

  useEffect(() => {
    const url = (storePublic as { favicon_url?: string } | null)?.favicon_url;
    if (!url) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = url.toLowerCase().endsWith('.ico') ? 'image/x-icon' : 'image/png';
    link.href = url;
  }, [storePublic]);

  return <>{children}</>;
}
