import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Users, 
  Tags, 
  Settings, 
  LogOut,
  ChevronDown,
  Plug,
  BarChart3,
  BookOpen,
  PenSquare
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
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarTrigger,
  useSidebar
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import logo from '@/assets/logo.png';
import { cn } from '@/lib/utils';

interface MenuItem {
  title: string;
  url?: string;
  icon: any;
  children?: { title: string; url: string }[];
}

const menuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/admin', icon: LayoutDashboard },
  { 
    title: 'Catálogo', 
    icon: Package,
    children: [
      { title: 'Produtos', url: '/admin/produtos' },
      { title: 'Categorias', url: '/admin/categorias' },
    ]
  },
  { title: 'Pedidos', url: '/admin/pedidos', icon: ShoppingCart },
  { title: 'Clientes', url: '/admin/clientes', icon: Users },
  {
    title: 'Vendas',
    icon: BarChart3,
    children: [
      { title: 'Análise de Vendas', url: '/admin/vendas' },
      { title: 'Registro Manual', url: '/admin/registro-manual' },
    ]
  },
  { 
    title: 'Marketing', 
    icon: Tags,
    children: [
      { title: 'Cupons', url: '/admin/cupons' },
      { title: 'Banners Principais', url: '/admin/banners' },
      { title: 'Banners Destaque', url: '/admin/banners-destaque' },
    ]
  },
  { title: 'Integrações', url: '/admin/integracoes', icon: Plug },
  { 
    title: 'Configurações', 
    icon: Settings,
    children: [
      { title: 'Loja', url: '/admin/configuracoes' },
      { title: 'Código Externo', url: '/admin/configuracoes/codigo' },
      { title: 'Manual de Conversões', url: '/admin/configuracoes/conversoes' },
    ]
  },
];

function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  // Auto-expand groups based on current route
  useEffect(() => {
    const groupsToOpen: string[] = [];
    menuItems.forEach(item => {
      if (item.children?.some(child => location.pathname === child.url)) {
        groupsToOpen.push(item.title);
      }
    });
    setOpenGroups(prev => [...new Set([...prev, ...groupsToOpen])]);
  }, [location.pathname]);

  const toggleGroup = (title: string) => {
    setOpenGroups(prev => 
      prev.includes(title) 
        ? prev.filter(g => g !== title)
        : [...prev, title]
    );
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  const isActiveRoute = (url?: string) => {
    if (!url) return false;
    return location.pathname === url;
  };

  const isGroupActive = (children?: { url: string }[]) => {
    if (!children) return false;
    return children.some(child => location.pathname === child.url);
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
          <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                item.children ? (
                  <Collapsible
                    key={item.title}
                    open={openGroups.includes(item.title)}
                    onOpenChange={() => toggleGroup(item.title)}
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton 
                          className={cn(
                            "w-full justify-between",
                            isGroupActive(item.children) && "bg-muted"
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </span>
                          <ChevronDown className={cn(
                            "h-4 w-4 transition-transform",
                            openGroups.includes(item.title) && "rotate-180"
                          )} />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.children.map((child) => (
                            <SidebarMenuSubItem key={child.url}>
                              <SidebarMenuSubButton 
                                asChild 
                                isActive={isActiveRoute(child.url)}
                              >
                                <Link to={child.url}>{child.title}</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActiveRoute(item.url)}>
                      <Link to={item.url!} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
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
          <main className="flex-1 p-6 bg-background overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
