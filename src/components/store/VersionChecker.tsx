import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION } from '@/lib/appVersion';

const RELOAD_KEY = 'version_check_reloaded';

export function VersionChecker() {
  const shown = useRef(false);

  useEffect(() => {
    // Store current version
    localStorage.setItem('app_version', APP_VERSION);

    const check = async () => {
      try {
        const { data } = await supabase
          .from('store_settings')
          .select('app_version')
          .limit(1)
          .maybeSingle();

        const serverVersion = (data as { app_version?: string } | null)?.app_version;
        if (!serverVersion || serverVersion === '' || serverVersion === APP_VERSION || shown.current) return;

        // Evitar loop: se já recarregamos uma vez para esta versão do servidor e ainda estamos na mesma build, não recarregar de novo
        const alreadyReloadedFor = sessionStorage.getItem(RELOAD_KEY);
        if (alreadyReloadedFor === serverVersion) return;

        shown.current = true;
        sessionStorage.setItem(RELOAD_KEY, serverVersion);
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
