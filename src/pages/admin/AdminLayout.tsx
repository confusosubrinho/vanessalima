 import { useState, useEffect } from 'react';
 import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
 import { 
   LayoutDashboard, 
   Package, 
   ShoppingCart, 
   Users, 
   Tags, 
   Image, 
   Settings, 
   LogOut,
   Menu,
   ChevronDown,
   FolderOpen
 } from 'lucide-react';
 import { supabase } from '@/integrations/supabase/client';
 import { Button } from '@/components/ui/button';
 import { 
   SidebarProvider, 
   Sidebar, 
   SidebarContent, 
   SidebarGroup, 
   SidebarGroupLabel, 
   SidebarGroupContent, 
   SidebarMenu, 
   SidebarMenuItem, 
   SidebarMenuButton,
   SidebarTrigger,
   useSidebar
 } from '@/components/ui/sidebar';
 import logo from '@/assets/logo.png';
 
 const menuItems = [
   { title: 'Dashboard', url: '/admin', icon: LayoutDashboard },
   { title: 'Produtos', url: '/admin/produtos', icon: Package },
   { title: 'Pedidos', url: '/admin/pedidos', icon: ShoppingCart },
   { title: 'Clientes', url: '/admin/clientes', icon: Users },
   { title: 'Categorias', url: '/admin/categorias', icon: FolderOpen },
   { title: 'Cupons', url: '/admin/cupons', icon: Tags },
   { title: 'Banners', url: '/admin/banners', icon: Image },
   { title: 'Configurações', url: '/admin/configuracoes', icon: Settings },
 ];
 
 function AdminSidebar() {
   const location = useLocation();
   const navigate = useNavigate();
   const { state } = useSidebar();
   const isCollapsed = state === 'collapsed';
 
   const handleLogout = async () => {
     await supabase.auth.signOut();
     navigate('/admin/login');
   };
 
   return (
     <Sidebar className="border-r bg-sidebar" collapsible="icon">
       <div className="p-4 border-b">
         <Link to="/admin" className="flex items-center gap-2">
           <img src={logo} alt="Admin" className="h-8" />
           {!isCollapsed && <span className="font-bold text-sm">Admin</span>}
         </Link>
       </div>
       <SidebarContent>
         <SidebarGroup>
           <SidebarGroupLabel>Menu</SidebarGroupLabel>
           <SidebarGroupContent>
             <SidebarMenu>
               {menuItems.map((item) => (
                 <SidebarMenuItem key={item.title}>
                   <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                     <Link to={item.url} className="flex items-center gap-2">
                       <item.icon className="h-4 w-4" />
                       <span>{item.title}</span>
                     </Link>
                   </SidebarMenuButton>
                 </SidebarMenuItem>
               ))}
             </SidebarMenu>
           </SidebarGroupContent>
         </SidebarGroup>
       </SidebarContent>
       <div className="mt-auto p-4 border-t">
         <Button variant="ghost" className="w-full justify-start" onClick={handleLogout}>
           <LogOut className="h-4 w-4 mr-2" />
           {!isCollapsed && 'Sair'}
         </Button>
       </div>
     </Sidebar>
   );
 }
 
 export default function AdminLayout() {
   const navigate = useNavigate();
   const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
 
   useEffect(() => {
     checkAdmin();
   }, []);
 
   const checkAdmin = async () => {
     const { data: { session } } = await supabase.auth.getSession();
     if (!session) {
       navigate('/admin/login');
       return;
     }
 
     const { data: roles } = await supabase
       .from('user_roles')
       .select('role')
       .eq('user_id', session.user.id)
       .eq('role', 'admin');
 
     if (!roles || roles.length === 0) {
       navigate('/admin/login');
       return;
     }
 
     setIsAdmin(true);
   };
 
   if (isAdmin === null) {
     return (
       <div className="min-h-screen flex items-center justify-center">
         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
       </div>
     );
   }
 
   return (
     <SidebarProvider>
       <div className="min-h-screen flex w-full">
         <AdminSidebar />
         <div className="flex-1 flex flex-col">
           <header className="h-14 border-b bg-background flex items-center px-4 gap-4">
             <SidebarTrigger />
             <div className="flex-1" />
             <Button variant="outline" size="sm" asChild>
               <Link to="/" target="_blank">Ver Loja</Link>
             </Button>
           </header>
           <main className="flex-1 p-6 bg-muted/30 overflow-auto">
             <Outlet />
           </main>
         </div>
       </div>
     </SidebarProvider>
   );
 }