 import { ReactNode } from 'react';
 import { Header } from './Header';
 import { Footer } from './Footer';
 import { AnnouncementBar } from './AnnouncementBar';

 interface StoreLayoutProps {
   children: ReactNode;
 }

 export function StoreLayout({ children }: StoreLayoutProps) {
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