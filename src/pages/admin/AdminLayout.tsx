import { useState, useEffect, lazy, Suspense } from 'react';
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
  BarChart3,
  PenSquare,
  Menu,
  Store,
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import logoFallback from '@/assets/logo.png';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useQuery } from '@tanstack/react-query';

const SetupWizard = lazy(() => import('@/components/admin/SetupWizard').then(m => ({ default: m.SetupWizard })));

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
      { title: 'Galeria de Mídia', url: '/admin/galeria' },
    ]
  },
  { title: 'Pedidos', url: '/admin/pedidos', icon: ShoppingCart },
  { title: 'Clientes', url: '/admin/clientes', icon: Users },
  {
    title: 'Vendas & Analytics',
    icon: BarChart3,
    children: [
      { title: 'Análise de Vendas', url: '/admin/vendas' },
      { title: 'Tráfego & UTM', url: '/admin/trafego' },
      { title: 'Registro Manual', url: '/admin/registro-manual' },
      { title: 'Carrinhos Abandonados', url: '/admin/carrinhos-abandonados' },
    ]
  },
  { 
    title: 'Marketing', 
    icon: Tags,
    children: [
      { title: 'Cupons', url: '/admin/cupons' },
      { title: 'Email Automações', url: '/admin/email-automations' },
    ]
  },
  { 
    title: 'Aparência', 
    icon: PenSquare,
    children: [
      { title: 'Personalização da Home', url: '/admin/personalizacao' },
      { title: 'Tema Visual', url: '/admin/tema' },
      { title: 'Redes Sociais', url: '/admin/redes-sociais' },
      { title: 'Páginas Institucionais', url: '/admin/paginas' },
    ]
  },
  { 
    title: 'Configurações', 
    icon: Settings,
    children: [
      { title: 'Loja', url: '/admin/configuracoes' },
      { title: 'Juros e Cartões', url: '/admin/precos' },
      { title: 'Integrações', url: '/admin/integracoes' },
      { title: 'Código Externo', url: '/admin/configuracoes/codigo' },
      { title: 'Manual de Conversões', url: '/admin/configuracoes/conversoes' },
      { title: 'Logs do Sistema', url: '/admin/logs' },
      { title: 'Saúde do Sistema', url: '/admin/saude' },
      { title: 'Otimização & Limpeza', url: '/admin/otimizacao' },
      { title: 'Central de Ajuda', url: '/admin/ajuda' },
    ]
  },
];

// Bottom tab bar items for mobile - most used screens
const mobileTabItems = [
  { title: 'Home', url: '/admin', icon: LayoutDashboard },
  { title: 'Produtos', url: '/admin/produtos', icon: Package },
  { title: 'Pedidos', url: '/admin/pedidos', icon: ShoppingCart },
  { title: 'Vendas', url: '/admin/vendas', icon: BarChart3 },
];

function useStoreLogo() {
  return useQuery({
    queryKey: ['store-logo'],
    queryFn: async () => {
      const { data } = await supabase
        .from('store_settings')
        .select('header_logo_url, logo_url, store_name')
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 1000 * 60 * 10,
  });
}

function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const { data: storeSettings } = useStoreLogo();
  const logoSrc = storeSettings?.header_logo_url || storeSettings?.logo_url || logoFallback;

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
          <img src={logoSrc} alt={storeSettings?.store_name || 'Loja'} className="h-8 max-w-[140px] object-contain" />
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
                            isGroupActive(item.children) && "bg-primary/15 text-primary font-semibold"
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

// Mobile full-screen menu as a sheet drawer
function MobileMenuSheet() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const { data: storeSettings } = useStoreLogo();
  const logoSrc = storeSettings?.header_logo_url || storeSettings?.logo_url || logoFallback;

  useEffect(() => {
    // Auto-expand active group
    menuItems.forEach(item => {
      if (item.children?.some(child => location.pathname === child.url)) {
        setOpenGroups(prev => prev.includes(item.title) ? prev : [...prev, item.title]);
      }
    });
  }, [location.pathname]);

  // Close sheet on navigation
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const toggleGroup = (title: string) => {
    setOpenGroups(prev => 
      prev.includes(title) ? prev.filter(g => g !== title) : [...prev, title]
    );
  };

  const isActiveRoute = (url?: string) => url ? location.pathname === url : false;
  const isGroupActive = (children?: { url: string }[]) => children?.some(c => location.pathname === c.url) ?? false;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <img src={logoSrc} alt={storeSettings?.store_name || 'Loja'} className="h-7 max-w-[140px] object-contain" />
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <nav className="p-2 space-y-1">
            {menuItems.map((item) => (
              item.children ? (
                <div key={item.title}>
                  <button
                    onClick={() => toggleGroup(item.title)}
                    className={cn(
                      "flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm transition-colors",
                      isGroupActive(item.children)
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <item.icon className="h-4 w-4" />
                      {item.title}
                    </span>
                    <ChevronDown className={cn(
                      "h-4 w-4 transition-transform",
                      openGroups.includes(item.title) && "rotate-180"
                    )} />
                  </button>
                  {openGroups.includes(item.title) && (
                    <div className="ml-7 mt-1 space-y-0.5 border-l-2 border-muted pl-3">
                      {item.children.map((child) => (
                        <Link
                          key={child.url}
                          to={child.url}
                          className={cn(
                            "block px-3 py-2 rounded-md text-sm transition-colors",
                            isActiveRoute(child.url)
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          )}
                        >
                          {child.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={item.title}
                  to={item.url!}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                    isActiveRoute(item.url)
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </Link>
              )
            ))}
          </nav>
        </ScrollArea>
        <div className="p-3 border-t">
          <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Mobile bottom tab bar
function MobileBottomBar() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t safe-area-pb">
      <div className="flex items-center justify-around h-14">
        {mobileTabItems.map((item) => {
          const isActive = location.pathname === item.url;
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
              <span className="text-[10px] font-medium">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// Get current page title for mobile header
function getPageTitle(pathname: string): string {
  for (const item of menuItems) {
    if (item.url === pathname) return item.title;
    if (item.children) {
      const child = item.children.find(c => c.url === pathname);
      if (child) return child.title;
    }
  }
  return 'Admin';
}

const ADMIN_SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  const { data: setupData } = useQuery({
    queryKey: ['store-setup'],
    queryFn: async () => {
      const { data } = await supabase.from('store_setup').select('*').limit(1).maybeSingle();
      return data;
    },
    enabled: isAdmin === true,
  });

  useEffect(() => {
    if (setupData && !setupData.setup_completed) {
      setShowWizard(true);
    }
  }, [setupData]);

  useEffect(() => {
    checkAdmin();

    let timeoutId: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        await supabase.auth.signOut();
        navigate('/admin/login');
      }, ADMIN_SESSION_TIMEOUT_MS);
    };
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(timeoutId);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
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

  const wizardOverlay = showWizard ? (
    <Suspense fallback={null}>
      <SetupWizard onComplete={() => setShowWizard(false)} />
    </Suspense>
  ) : null;

  // Mobile layout: top header + content + bottom tab bar
  if (isMobile) {
    return (
      <>
        {wizardOverlay}
        <div className="min-h-screen flex flex-col bg-background">
          <header className="sticky top-0 z-40 h-12 border-b bg-background flex items-center px-3 gap-2">
            <MobileMenuSheet />
            <h1 className="text-sm font-semibold flex-1 truncate">{getPageTitle(location.pathname)}</h1>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
              <Link to="/" target="_blank">
                <Store className="h-3.5 w-3.5 mr-1" />
                Loja
              </Link>
            </Button>
          </header>
          <main className="flex-1 p-3 pb-20 overflow-x-hidden">
            <Outlet />
          </main>
          <MobileBottomBar />
        </div>
      </>
    );
  }

  // Desktop layout: sidebar + content
  return (
    <>
      {wizardOverlay}
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
    </>
  );
}
