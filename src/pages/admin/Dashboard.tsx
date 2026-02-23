 import { useQuery } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
import { Package, ShoppingCart, Users, DollarSign, Settings2 } from 'lucide-react';
import { HelpHint } from '@/components/HelpHint';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useIsMobile } from '@/hooks/use-mobile';
import { Link } from 'react-router-dom';

function StoreHealthCard() {
  const { data: health } = useQuery({
    queryKey: ['store-health-score'],
    queryFn: async () => {
      const [settings, theme, products] = await Promise.all([
        supabase.from('store_settings').select('store_name, logo_url, contact_whatsapp').limit(1).maybeSingle(),
        supabase.from('site_theme').select('id').limit(1).maybeSingle(),
        supabase.from('products').select('id', { count: 'exact' }).limit(1),
      ]);
      const checks = [
        { label: 'Nome da loja definido', ok: !!settings.data?.store_name && settings.data.store_name !== 'Minha Loja' },
        { label: 'Logo enviado', ok: !!settings.data?.logo_url },
        { label: 'WhatsApp configurado', ok: !!settings.data?.contact_whatsapp },
        { label: 'Tema personalizado', ok: !!theme.data?.id },
        { label: 'Primeiro produto cadastrado', ok: (products.count || 0) > 0 },
      ];
      return checks;
    },
    staleTime: 1000 * 60 * 5,
  });

  if (!health) return null;
  const completed = health.filter(c => c.ok).length;
  if (completed === 5) return null; // All done, hide the card

  const pct = (completed / 5) * 100;
  const color = completed <= 2 ? 'text-red-500' : completed <= 4 ? 'text-amber-500' : 'text-green-500';

  return (
    <Card>
      <CardHeader className="p-3 md:p-6 pb-2">
        <CardTitle className="text-sm md:text-base flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Configuração da Loja
          <span className={`text-xs font-normal ${color}`}>{completed}/5</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 md:p-6 pt-0 space-y-3">
        <Progress value={pct} className="h-2" />
        <div className="space-y-1.5">
          {health.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span>{item.ok ? '✅' : '⬜'}</span>
              <span className={item.ok ? 'text-muted-foreground line-through' : ''}>{item.label}</span>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/configuracoes">Completar configuração</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
 
 export default function Dashboard() {
   const { data: stats } = useQuery({
     queryKey: ['admin-stats'],
     queryFn: async () => {
       const [products, orders, customers] = await Promise.all([
         supabase.from('products').select('id', { count: 'exact' }),
         supabase.from('orders').select('id, total_amount, status', { count: 'exact' }),
         supabase.from('customers').select('id', { count: 'exact' }),
       ]);
 
       const totalRevenue = orders.data?.reduce((sum, order) => sum + Number(order.total_amount || 0), 0) || 0;
       const pendingOrders = orders.data?.filter(o => o.status === 'pending').length || 0;
 
       return {
         products: products.count || 0,
         orders: orders.count || 0,
         customers: customers.count || 0,
         revenue: totalRevenue,
         pendingOrders,
       };
     },
   });
 
   const { data: recentOrders } = useQuery({
     queryKey: ['admin-recent-orders'],
     queryFn: async () => {
       const { data } = await supabase
         .from('orders')
         .select('*')
         .order('created_at', { ascending: false })
         .limit(5);
       return data || [];
     },
   });
 
   const formatPrice = (price: number) => {
     return new Intl.NumberFormat('pt-BR', {
       style: 'currency',
       currency: 'BRL',
     }).format(price);
   };
 
   const formatDate = (date: string) => {
     return new Date(date).toLocaleDateString('pt-BR', {
       day: '2-digit',
       month: '2-digit',
       year: 'numeric',
     });
   };
 
   const statusColors: Record<string, string> = {
     pending: 'bg-yellow-100 text-yellow-800',
     processing: 'bg-blue-100 text-blue-800',
     shipped: 'bg-purple-100 text-purple-800',
     delivered: 'bg-green-100 text-green-800',
     cancelled: 'bg-red-100 text-red-800',
   };
 
   const statusLabels: Record<string, string> = {
     pending: 'Pendente',
     processing: 'Processando',
     shipped: 'Enviado',
     delivered: 'Entregue',
     cancelled: 'Cancelado',
   };
 
    const isMobile = useIsMobile();

    return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl md:text-3xl font-bold">Dashboard</h1>
          <HelpHint helpKey="admin.dashboard" />
        </div>
        <p className="text-xs md:text-sm text-muted-foreground">Visão geral da sua loja</p>
      </div>

      {/* Store Setup Health Score */}
      <StoreHealthCard />

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 md:p-6 pb-1 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Receita Total</CardTitle>
              <DollarSign className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
              <div className="text-lg md:text-2xl font-bold truncate">{formatPrice(stats?.revenue || 0)}</div>
              <p className="text-[10px] md:text-xs text-muted-foreground">Total de pedidos</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 md:p-6 pb-1 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Pedidos</CardTitle>
              <ShoppingCart className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
              <div className="text-lg md:text-2xl font-bold">{stats?.orders || 0}</div>
              <p className="text-[10px] md:text-xs text-muted-foreground">
                {stats?.pendingOrders || 0} pendentes
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 md:p-6 pb-1 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Produtos</CardTitle>
              <Package className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
              <div className="text-lg md:text-2xl font-bold">{stats?.products || 0}</div>
              <p className="text-[10px] md:text-xs text-muted-foreground">Cadastrados</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 md:p-6 pb-1 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Clientes</CardTitle>
              <Users className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
              <div className="text-lg md:text-2xl font-bold">{stats?.customers || 0}</div>
              <p className="text-[10px] md:text-xs text-muted-foreground">Cadastrados</p>
            </CardContent>
          </Card>
       </div>
 
        {/* Recent orders */}
        <Card>
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="text-base md:text-lg">Pedidos Recentes</CardTitle>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
            {recentOrders?.length === 0 ? (
              <p className="text-muted-foreground text-center py-6 text-sm">Nenhum pedido ainda</p>
            ) : (
              <div className="space-y-2 md:space-y-4">
                {recentOrders?.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-2.5 md:p-4 border rounded-lg gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{order.order_number}</p>
                      <p className="text-xs text-muted-foreground truncate">{order.shipping_name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-medium text-sm">{formatPrice(Number(order.total_amount))}</p>
                      <span className={`text-[10px] md:text-xs px-1.5 py-0.5 rounded-full ${statusColors[order.status]}`}>
                        {statusLabels[order.status]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
     </div>
   );
 }