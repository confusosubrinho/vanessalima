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
       <AnnouncementBar />
       <Header />
       <main className="flex-1">{children}</main>
       <Footer />
     </div>
   );
 }