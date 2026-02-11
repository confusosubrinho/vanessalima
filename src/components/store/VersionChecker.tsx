import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION } from '@/lib/appVersion';

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

        const serverVersion = (data as any)?.app_version;
        if (serverVersion && serverVersion !== '' && serverVersion !== APP_VERSION && !shown.current) {
          shown.current = true;
          // Force reload to get latest version
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          }
          window.location.reload();
        }
      } catch {
        // Silently fail
      }
    };

    const timer = setInterval(check, 60000);
    // Initial check after 5s
    const initial = setTimeout(check, 5000);

    return () => {
      clearInterval(timer);
      clearTimeout(initial);
    };
  }, []);

  return null;
}
