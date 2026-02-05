 import { ReactNode } from 'react';
 import { Header } from './Header';
 import { Footer } from './Footer';
 
 interface StoreLayoutProps {
   children: ReactNode;
 }
 
 export function StoreLayout({ children }: StoreLayoutProps) {
   return (
     <div className="min-h-screen flex flex-col">
       <Header />
       <main className="flex-1">{children}</main>
       <Footer />
     </div>
   );
 }