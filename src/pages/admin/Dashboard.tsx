 import { useQuery } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { Package, ShoppingCart, Users, DollarSign, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 
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
 
   return (
     <div className="space-y-6">
       <div>
         <h1 className="text-3xl font-bold">Dashboard</h1>
         <p className="text-muted-foreground">Visão geral da sua loja</p>
       </div>
 
       {/* Stats cards */}
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
             <DollarSign className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">{formatPrice(stats?.revenue || 0)}</div>
             <p className="text-xs text-muted-foreground">
               <span className="text-green-600 flex items-center gap-1">
                 <ArrowUpRight className="h-3 w-3" /> +12% este mês
               </span>
             </p>
           </CardContent>
         </Card>
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Pedidos</CardTitle>
             <ShoppingCart className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">{stats?.orders || 0}</div>
             <p className="text-xs text-muted-foreground">
               {stats?.pendingOrders || 0} pendentes
             </p>
           </CardContent>
         </Card>
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Produtos</CardTitle>
             <Package className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">{stats?.products || 0}</div>
             <p className="text-xs text-muted-foreground">Cadastrados</p>
           </CardContent>
         </Card>
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Clientes</CardTitle>
             <Users className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">{stats?.customers || 0}</div>
             <p className="text-xs text-muted-foreground">Cadastrados</p>
           </CardContent>
         </Card>
       </div>
 
       {/* Recent orders */}
       <Card>
         <CardHeader>
           <CardTitle>Pedidos Recentes</CardTitle>
         </CardHeader>
         <CardContent>
           {recentOrders?.length === 0 ? (
             <p className="text-muted-foreground text-center py-8">Nenhum pedido ainda</p>
           ) : (
             <div className="space-y-4">
               {recentOrders?.map((order) => (
                 <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg">
                   <div>
                     <p className="font-medium">{order.order_number}</p>
                     <p className="text-sm text-muted-foreground">{order.shipping_name}</p>
                   </div>
                   <div className="text-right">
                     <p className="font-medium">{formatPrice(Number(order.total_amount))}</p>
                     <span className={`text-xs px-2 py-1 rounded-full ${statusColors[order.status]}`}>
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