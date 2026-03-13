import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Package, ShoppingCart, Users, DollarSign, Settings2, TrendingUp, TrendingDown, Plus, Clock, Star, AlertTriangle } from 'lucide-react';
import { formatPrice, ORDER_STATUS_CHART_COLORS, ORDER_STATUS_LABELS } from '@/lib/formatters';
import { HelpHint } from '@/components/HelpHint';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { Link, useNavigate } from 'react-router-dom';
import { useNotifications, useUnreadCount } from '@/hooks/useNotifications';
import { formatDistanceToNow, subDays, format, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PERIOD_OPTIONS = [
  { value: '1', label: 'Hoje' },
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
];

const STATUS_COLORS = ORDER_STATUS_CHART_COLORS;
const STATUS_LABELS = ORDER_STATUS_LABELS;

function StoreHealthCard() {
  const { data: health } = useQuery({
    queryKey: ['store-health-score'],
    queryFn: async () => {
      const [settings, theme, products] = await Promise.all([
        supabase.from('store_settings').select('store_name, logo_url, contact_whatsapp').limit(1).maybeSingle(),
        supabase.from('site_theme').select('id').limit(1).maybeSingle(),
        supabase.from('products').select('id', { count: 'exact' }).limit(1),
      ]);
      return [
        { label: 'Nome da loja definido', ok: !!settings.data?.store_name && settings.data.store_name !== 'Minha Loja' },
        { label: 'Logo enviado', ok: !!settings.data?.logo_url },
        { label: 'WhatsApp configurado', ok: !!settings.data?.contact_whatsapp },
        { label: 'Tema personalizado', ok: !!theme.data?.id },
        { label: 'Primeiro produto cadastrado', ok: (products.count || 0) > 0 },
      ];
    },
    staleTime: 1000 * 60 * 5,
  });
  if (!health) return null;
  const completed = health.filter(c => c.ok).length;
  if (completed === 5) return null;
  const pct = (completed / 5) * 100;
  const color = completed <= 2 ? 'text-red-500' : completed <= 4 ? 'text-amber-500' : 'text-green-500';
  return (
    <Card>
      <CardHeader className="p-3 md:p-6 pb-2">
        <CardTitle className="text-sm md:text-base flex items-center gap-2">
          <Settings2 className="h-4 w-4" />Configuração da Loja <span className={`text-xs font-normal ${color}`}>{completed}/5</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 md:p-6 pt-0 space-y-3">
        <Progress value={pct} className="h-2" />
        <div className="space-y-1.5">{health.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span>{item.ok ? '✅' : '⬜'}</span>
            <span className={item.ok ? 'text-muted-foreground line-through' : ''}>{item.label}</span>
          </div>
        ))}</div>
        <Button variant="outline" size="sm" asChild><Link to="/admin/configuracoes">Completar configuração</Link></Button>
      </CardContent>
    </Card>
  );
}

// formatPrice imported from @/lib/formatters

type RechartsModule = typeof import('recharts');

function DashboardCharts({ revenueChart, pieData }: { revenueChart: { date: string; value: number }[] | undefined; pieData: { name: string; value: number; color: string }[] }) {
  const [Recharts, setRecharts] = useState<RechartsModule | null>(null);
  useEffect(() => {
    import('recharts').then(setRecharts);
  }, []);

  if (!Recharts) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-8"><CardContent className="p-3 md:p-6"><Skeleton className="h-[220px] w-full" /></CardContent></Card>
        <Card className="lg:col-span-4"><CardContent className="p-3 md:p-6"><Skeleton className="h-[160px] w-full" /></CardContent></Card>
      </div>
    );
  }

  const { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } = Recharts;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <Card className="lg:col-span-8">
        <CardHeader className="p-3 md:p-6 pb-0"><CardTitle className="text-sm md:text-base">Receita Diária</CardTitle></CardHeader>
        <CardContent className="p-3 md:p-6 pt-2">
          {revenueChart?.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={revenueChart}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} width={50} />
                <Tooltip formatter={(v: number) => formatPrice(v)} />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground text-center py-12">Sem dados no período</p>}
        </CardContent>
      </Card>
      <Card className="lg:col-span-4">
        <CardHeader className="p-3 md:p-6 pb-0"><CardTitle className="text-sm md:text-base">Pedidos por Status</CardTitle></CardHeader>
        <CardContent className="p-3 md:p-6 pt-2 flex flex-col items-center">
          {pieData.length ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-1">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center gap-1 text-[10px]">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.name} ({d.value})
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-sm text-muted-foreground text-center py-12">Sem pedidos</p>}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const [period, setPeriod] = useState('30');
  const navigate = useNavigate();
  const days = Number(period);
  const now = new Date();
  const periodStart = startOfDay(subDays(now, days));
  const prevPeriodStart = startOfDay(subDays(now, days * 2));

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['dashboard-kpis', period],
    queryFn: async () => {
      const [currentOrders, prevOrders, currentCustomers, prevCustomers] = await Promise.all([
        supabase.from('orders').select('id, total_amount, status').not('payment_status', 'is', null).gte('created_at', periodStart.toISOString()),
        supabase.from('orders').select('id, total_amount, status').not('payment_status', 'is', null).gte('created_at', prevPeriodStart.toISOString()).lt('created_at', periodStart.toISOString()),
        supabase.from('customers').select('id', { count: 'exact' }).gte('created_at', periodStart.toISOString()),
        supabase.from('customers').select('id', { count: 'exact' }).gte('created_at', prevPeriodStart.toISOString()).lt('created_at', periodStart.toISOString()),
      ]);
      const activeCurrentOrders = currentOrders.data?.filter(o => o.status !== 'cancelled') || [];
      const activePrevOrders = prevOrders.data?.filter(o => o.status !== 'cancelled') || [];
      const curRevenue = activeCurrentOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const prevRevenue = activePrevOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const curCount = activeCurrentOrders.length;
      const prevCount = activePrevOrders.length;
      const curTicket = curCount > 0 ? curRevenue / curCount : 0;
      const prevTicket = prevCount > 0 ? prevRevenue / prevCount : 0;
      const pct = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);
      return {
        revenue: curRevenue, revenuePct: pct(curRevenue, prevRevenue),
        orders: curCount, ordersPct: pct(curCount, prevCount),
        ticket: curTicket, ticketPct: pct(curTicket, prevTicket),
        customers: currentCustomers.count || 0, customersPct: pct(currentCustomers.count || 0, prevCustomers.count || 0),
        statusCounts: currentOrders.data?.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {} as Record<string, number>) || {},
      };
    },
  });

  const { data: revenueChart } = useQuery({
    queryKey: ['dashboard-revenue-chart', period],
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('created_at, total_amount, status').not('payment_status', 'is', null).gte('created_at', periodStart.toISOString()).neq('status', 'cancelled').order('created_at');
      const byDay: Record<string, number> = {};
      for (let i = 0; i < days; i++) {
        const d = format(subDays(now, days - 1 - i), 'dd/MM');
        byDay[d] = 0;
      }
      data?.forEach(o => {
        const d = format(new Date(o.created_at), 'dd/MM');
        byDay[d] = (byDay[d] || 0) + Number(o.total_amount || 0);
      });
      return Object.entries(byDay).map(([date, value]) => ({ date, value }));
    },
  });

  const { data: topProducts } = useQuery({
    queryKey: ['dashboard-top-products', period],
    queryFn: async () => {
      const { data } = await supabase
        .from('order_items')
        .select('product_id, product_name, quantity')
        .gte('created_at', periodStart.toISOString());
      const map: Record<string, { name: string; qty: number }> = {};
      data?.forEach(i => {
        if (!i.product_id) return;
        if (!map[i.product_id]) map[i.product_id] = { name: i.product_name, qty: 0 };
        map[i.product_id].qty += i.quantity;
      });
      return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5);
    },
  });

  const { data: lowStock } = useQuery({
    queryKey: ['dashboard-low-stock'],
    queryFn: async () => {
      const { data } = await supabase
        .from('product_variants')
        .select('id, size, color, stock_quantity, product_id, products(name)')
        .lte('stock_quantity', 3)
        .eq('is_active', true)
        .limit(10);
      return data || [];
    },
  });

  const { data: notifications } = useNotifications(5);
  const { data: unreadCount } = useUnreadCount();

  const KpiCard = ({ title, value, pct, icon: Icon, prefix }: { title: string; value: number | string; pct: number; icon: any; prefix?: string }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 md:p-6 pb-1 md:pb-2">
        <CardTitle className="text-xs md:text-sm font-medium">{title}</CardTitle>
        <Icon className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="p-3 md:p-6 pt-0">
        <div className="text-lg md:text-2xl font-bold truncate">
          {prefix === 'R$' && typeof value === 'number' ? formatPrice(value) : prefix ? `${prefix}${typeof value === 'number' ? formatPrice(value) : value}` : value}
        </div>
        <div className={`flex items-center text-xs mt-0.5 ${pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {pct >= 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
          {pct >= 0 ? '+' : ''}{pct}% vs anterior
        </div>
      </CardContent>
    </Card>
  );

  const pieData = kpis ? Object.entries(kpis.statusCounts).map(([status, count]) => ({ name: STATUS_LABELS[status] || status, value: count, color: STATUS_COLORS[status] || '#999' })) : [];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-3xl font-bold">Dashboard</h1>
            <HelpHint helpKey="admin.dashboard" />
          </div>
          <p className="text-xs md:text-sm text-muted-foreground">Visão geral da sua loja</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{PERIOD_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <StoreHealthCard />

      {/* KPIs */}
      {kpisLoading ? (
        <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-4 animate-content-in">
          <KpiCard title="Receita" value={kpis?.revenue || 0} pct={kpis?.revenuePct || 0} icon={DollarSign} prefix="R$" />
          <KpiCard title="Pedidos" value={kpis?.orders || 0} pct={kpis?.ordersPct || 0} icon={ShoppingCart} />
          <KpiCard title="Ticket Médio" value={kpis?.ticket || 0} pct={kpis?.ticketPct || 0} icon={DollarSign} prefix="R$" />
          <KpiCard title="Novos Clientes" value={kpis?.customers || 0} pct={kpis?.customersPct || 0} icon={Users} />
        </div>
      )}

      {/* Charts row — Recharts carregado dinamicamente para não ir no bundle da loja */}
      <DashboardCharts revenueChart={revenueChart} pieData={pieData} />

      {/* Row 3: Top products + Notifications + Low stock */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="p-3 md:p-6 pb-2"><CardTitle className="text-sm">Top 5 Produtos</CardTitle></CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            {topProducts?.length ? (
              <div className="space-y-2">
                {topProducts.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground w-4">{i+1}</span>
                    <div className="flex-1 min-w-0"><p className="text-sm truncate">{p.name}</p></div>
                    <Badge variant="secondary" className="text-xs">{p.qty} vendas</Badge>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground text-center py-6">Sem vendas no período</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3 md:p-6 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Notificações {(unreadCount ?? 0) > 0 && <Badge variant="destructive" className="text-[10px]">{unreadCount}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            {notifications?.length ? (
              <div className="space-y-2">
                {notifications.filter(n => !n.is_read).slice(0, 5).map(n => (
                  <button key={n.id} onClick={() => n.link && navigate(n.link)} className="w-full text-left flex gap-2 p-1.5 rounded hover:bg-muted/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{n.title}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}</p>
                    </div>
                  </button>
                ))}
                {notifications.filter(n => !n.is_read).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Tudo em dia! 🎉</p>}
              </div>
            ) : <p className="text-xs text-muted-foreground text-center py-6">Nenhuma notificação</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3 md:p-6 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />Estoque Crítico
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            {lowStock?.length ? (
              <div className="space-y-2">
                {lowStock.map((v: any) => (
                  <div key={v.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate">{v.products?.name} — {v.size}{v.color ? ` / ${v.color}` : ''}</span>
                    <Badge variant={v.stock_quantity === 0 ? 'destructive' : 'secondary'}>{v.stock_quantity}</Badge>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground text-center py-6">Estoque saudável 👍</p>}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="p-3 md:p-6 pb-2"><CardTitle className="text-sm">Ações Rápidas</CardTitle></CardHeader>
        <CardContent className="p-3 md:p-6 pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Button variant="outline" className="h-auto py-3 flex-col gap-1" asChild>
              <Link to="/admin/produtos"><Plus className="h-5 w-5" /><span className="text-xs">Novo Produto</span></Link>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col gap-1" asChild>
              <Link to="/admin/pedidos"><Clock className="h-5 w-5" /><span className="text-xs">Pedidos Pendentes</span></Link>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col gap-1" asChild>
              <Link to="/admin/carrinhos-abandonados"><ShoppingCart className="h-5 w-5" /><span className="text-xs">Carrinhos</span></Link>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col gap-1" asChild>
              <Link to="/admin/avaliacoes"><Star className="h-5 w-5" /><span className="text-xs">Avaliações</span></Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
