import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION } from '@/lib/appVersion';

const RELOAD_KEY = 'version_check_reloaded';

export function VersionChecker() {
  const shown = useRef(false);

  useEffect(() => {
    localStorage.setItem('app_version', APP_VERSION);

    const check = async () => {
      try {
        const { data } = await supabase
          .from('store_settings_public')
          .select('app_version')
          .limit(1)
          .maybeSingle();

        const serverVersion = (data as { app_version?: string } | null)?.app_version;
        if (!serverVersion || serverVersion === '' || serverVersion === APP_VERSION || shown.current) return;

        const alreadyReloadedFor = sessionStorage.getItem(RELOAD_KEY);
        if (alreadyReloadedFor === serverVersion) return;

        shown.current = true;
        sessionStorage.setItem(RELOAD_KEY, serverVersion);

        // Clear lazy-retry flags so the fresh load can retry if needed
        try {
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith('lazy-retry-reloaded')) {
              sessionStorage.removeItem(key);
            }
          }
        } catch { /* ignore */ }

        // Clear old persist cache keys
        try {
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('VANESSA_LIMA_QUERY_CACHE')) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(k => localStorage.removeItem(k));
        } catch { /* ignore */ }

        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        window.location.reload();
      } catch {
        // Silently fail
      }
    };

    const timer = setInterval(check, 60000);
    const initial = setTimeout(check, 5000);

    return () => {
      clearInterval(timer);
      clearTimeout(initial);
    };
  }, []);

  return null;
}
