import { ReactNode, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { AnnouncementBar } from './AnnouncementBar';

interface StoreLayoutProps {
  children: ReactNode;
}

const PENDING_UPDATE_KEY = 'pending_version_update';

export function StoreLayout({ children }: StoreLayoutProps) {
  const location = useLocation();
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname;
      if (sessionStorage.getItem(PENDING_UPDATE_KEY)) {
        sessionStorage.removeItem(PENDING_UPDATE_KEY);
        window.location.replace(window.location.href);
      }
    }
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Pular para o conteúdo
      </a>
      <AnnouncementBar />
      <Header />
      <main id="main-content" className="flex-1" tabIndex={-1}>{children}</main>
      <Footer />
    </div>
  );
}