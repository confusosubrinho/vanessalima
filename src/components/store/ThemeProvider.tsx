import { useSiteTheme } from '@/hooks/useSiteTheme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useSiteTheme();
  return <>{children}</>;
}
