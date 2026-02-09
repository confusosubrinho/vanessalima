import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { DollarSign, ShoppingCart, TrendingUp, ArrowUpRight, ArrowDownRight, Package, Users, CreditCard } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const formatPrice = (price: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

export default function SalesDashboard() {
  const [period, setPeriod] = useState('30');

  const startDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(period));
    return d.toISOString();
  }, [period]);

  const { data: orders } = useQuery({
    queryKey: ['sales-orders', period],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .gte('created_at', startDate)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const { data: allOrders } = useQuery({
    queryKey: ['sales-all-orders'],
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('id, total_amount, status, created_at');
      return data || [];
    },
  });

  // Aggregated stats
  const stats = useMemo(() => {
    if (!orders) return { revenue: 0, count: 0, avgTicket: 0, paid: 0, pending: 0 };
    const revenue = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const paid = orders.filter(o => ['delivered', 'shipped', 'processing'].includes(o.status)).reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const pending = orders.filter(o => o.status === 'pending').reduce((s, o) => s + Number(o.total_amount || 0), 0);
    return {
      revenue,
      count: orders.length,
      avgTicket: orders.length ? revenue / orders.length : 0,
      paid,
      pending,
    };
  }, [orders]);

  // Previous period comparison
  const prevStats = useMemo(() => {
    if (!allOrders) return { revenue: 0, count: 0 };
    const prevStart = new Date();
    prevStart.setDate(prevStart.getDate() - parseInt(period) * 2);
    const prevEnd = new Date();
    prevEnd.setDate(prevEnd.getDate() - parseInt(period));
    const prev = allOrders.filter(o => new Date(o.created_at) >= prevStart && new Date(o.created_at) < prevEnd);
    return {
      revenue: prev.reduce((s, o) => s + Number(o.total_amount || 0), 0),
      count: prev.length,
    };
  }, [allOrders, period]);

  const revenueChange = prevStats.revenue ? ((stats.revenue - prevStats.revenue) / prevStats.revenue * 100) : 0;
  const orderChange = prevStats.count ? ((stats.count - prevStats.count) / prevStats.count * 100) : 0;

  // Chart data: daily revenue
  const dailyData = useMemo(() => {
    if (!orders) return [];
    const map: Record<string, number> = {};
    orders.forEach(o => {
      const day = new Date(o.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      map[day] = (map[day] || 0) + Number(o.total_amount || 0);
    });
    return Object.entries(map).reverse().map(([date, value]) => ({ date, value }));
  }, [orders]);

  // Status distribution
  const statusData = useMemo(() => {
    if (!orders) return [];
    const map: Record<string, number> = {};
    const labels: Record<string, string> = { pending: 'Pendente', processing: 'Processando', shipped: 'Enviado', delivered: 'Entregue', cancelled: 'Cancelado' };
    orders.forEach(o => { map[o.status] = (map[o.status] || 0) + 1; });
    return Object.entries(map).map(([key, value]) => ({ name: labels[key] || key, value }));
  }, [orders]);

  // Top products
  const topProducts = useMemo(() => {
    if (!orders) return [];
    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    orders.forEach(o => {
      (o.items as any[])?.forEach((item: any) => {
        const key = item.product_name;
        if (!map[key]) map[key] = { name: key, qty: 0, revenue: 0 };
        map[key].qty += item.quantity;
        map[key].revenue += Number(item.total_price || 0);
      });
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [orders]);

  // Payment method breakdown (from notes field)
  const paymentData = useMemo(() => {
    if (!orders) return [];
    const map: Record<string, { count: number; total: number }> = { pix: { count: 0, total: 0 }, card: { count: 0, total: 0 }, boleto: { count: 0, total: 0 } };
    orders.forEach(o => {
      const match = o.notes?.match(/Pagamento:\s*(\w+)/i);
      const method = match?.[1]?.toLowerCase() || 'outro';
      if (map[method]) {
        map[method].count++;
        map[method].total += Number(o.total_amount || 0);
      }
    });
    const labels: Record<string, string> = { pix: 'PIX', card: 'Cartão', boleto: 'Boleto' };
    return Object.entries(map)
      .filter(([, v]) => v.count > 0)
      .map(([key, v]) => ({ name: labels[key] || key, ...v }));
  }, [orders]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Análise de Vendas</h1>
          <p className="text-muted-foreground">Métricas e relatórios de desempenho</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="365">Último ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(stats.revenue)}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {revenueChange >= 0 ? (
                <span className="text-green-600 flex items-center"><ArrowUpRight className="h-3 w-3" />+{revenueChange.toFixed(1)}%</span>
              ) : (
                <span className="text-red-600 flex items-center"><ArrowDownRight className="h-3 w-3" />{revenueChange.toFixed(1)}%</span>
              )}
              vs período anterior
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pedidos</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.count}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {orderChange >= 0 ? (
                <span className="text-green-600 flex items-center"><ArrowUpRight className="h-3 w-3" />+{orderChange.toFixed(1)}%</span>
              ) : (
                <span className="text-red-600 flex items-center"><ArrowDownRight className="h-3 w-3" />{orderChange.toFixed(1)}%</span>
              )}
              vs período anterior
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(stats.avgTicket)}</div>
            <p className="text-xs text-muted-foreground">por pedido</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Receita Paga</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatPrice(stats.paid)}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-yellow-600">{formatPrice(stats.pending)} pendente</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="products">Por Produto</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receita Diária</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={v => `R$${v}`} />
                    <Tooltip formatter={(v: number) => formatPrice(v)} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Receita" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Status dos Pedidos</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {statusData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top 10 Produtos</CardTitle>
            </CardHeader>
            <CardContent>
              {topProducts.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
              ) : (
                <div className="space-y-3">
                  {topProducts.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>
                        <div>
                          <p className="font-medium text-sm line-clamp-1">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.qty} vendidos</p>
                        </div>
                      </div>
                      <span className="font-bold text-sm">{formatPrice(p.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribuição por Método de Pagamento</CardTitle>
            </CardHeader>
            <CardContent>
              {paymentData.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {paymentData.map((pm, i) => (
                    <Card key={i}>
                      <CardContent className="pt-6 text-center">
                        <p className="font-bold text-lg">{pm.name}</p>
                        <p className="text-2xl font-bold mt-2">{formatPrice(pm.total)}</p>
                        <p className="text-sm text-muted-foreground">{pm.count} pedidos</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
