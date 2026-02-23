import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SiteTheme {
  id: string;
  primary_color: string;
  primary_color_dark: string;
  primary_color_light: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  font_heading: string;
  border_radius: string;
  shadow_intensity: string;
  updated_at: string;
}

function hexToHSL(hex: string): string {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function darkenHex(hex: string, amount = 15): string {
  hex = hex.replace('#', '');
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  r = Math.max(0, r - amount);
  g = Math.max(0, g - amount);
  b = Math.max(0, b - amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function lightenHex(hex: string): string {
  hex = hex.replace('#', '');
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  r = Math.min(255, Math.round(r + (255 - r) * 0.85));
  g = Math.min(255, Math.round(g + (255 - g) * 0.85));
  b = Math.min(255, Math.round(b + (255 - b) * 0.85));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function loadGoogleFont(family: string) {
  const id = `gfont-${family.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@300;400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

function applyThemeToDOM(theme: SiteTheme) {
  const root = document.documentElement;
  const primaryHSL = hexToHSL(theme.primary_color);
  const darkHSL = hexToHSL(theme.primary_color_dark || darkenHex(theme.primary_color));
  const lightHSL = hexToHSL(theme.primary_color_light || lightenHex(theme.primary_color));
  const accentHSL = hexToHSL(theme.accent_color);

  // Primary
  root.style.setProperty('--primary', primaryHSL);
  root.style.setProperty('--ring', primaryHSL);
  root.style.setProperty('--sidebar-primary', primaryHSL);
  root.style.setProperty('--sidebar-ring', primaryHSL);
  
  // Success = primary
  root.style.setProperty('--success', darkHSL);

  // Accent derived from primary
  root.style.setProperty('--accent', lightHSL);
  root.style.setProperty('--accent-foreground', darkHSL);

  // Fonts
  if (theme.font_family) {
    loadGoogleFont(theme.font_family);
    root.style.setProperty('--font-base', `'${theme.font_family}', sans-serif`);
    document.body.style.fontFamily = `'${theme.font_family}', sans-serif`;
  }
  if (theme.font_heading) {
    loadGoogleFont(theme.font_heading);
    root.style.setProperty('--font-heading', `'${theme.font_heading}', sans-serif`);
    document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(el => {
      (el as HTMLElement).style.fontFamily = `'${theme.font_heading}', sans-serif`;
    });
  }

  // Border radius
  const radiusMap: Record<string, string> = {
    none: '0',
    small: '0.25rem',
    medium: '0.5rem',
    large: '0.75rem',
    full: '1rem',
  };
  if (theme.border_radius && radiusMap[theme.border_radius]) {
    root.style.setProperty('--radius', radiusMap[theme.border_radius]);
  }
}

export function useSiteTheme() {
  const query = useQuery({
    queryKey: ['site-theme'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_theme')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as SiteTheme | null;
    },
    staleTime: 1000 * 60 * 30, // 30 min
  });

  useEffect(() => {
    if (query.data) {
      applyThemeToDOM(query.data);
    }
  }, [query.data]);

  return query;
}

export { hexToHSL, darkenHex, lightenHex, applyThemeToDOM };
