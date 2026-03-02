import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Search, Eye, MoreHorizontal, Calendar, DollarSign, ArrowUpDown, Filter, Download, Upload, SlidersHorizontal, ShoppingCart, Trash2, RefreshCw, Clock } from 'lucide-react';
import { HelpHint } from '@/components/HelpHint';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { useIsMobile } from '@/hooks/use-mobile';
import { exportToCSV } from '@/lib/csv';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { Order } from '@/types/database';
import { logAudit, generateCorrelationId } from '@/lib/auditLogger';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Orders() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [minValue, setMinValue] = useState<string>('');
  const [maxValue, setMaxValue] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const isMobile = useIsMobile();
  const [orderToDeleteTest, setOrderToDeleteTest] = useState<Order | null>(null);
  const [reconcileOrderId, setReconcileOrderId] = useState<string | null>(null);
  const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') + '/functions/v1';

  const ADMIN_ORDERS_PAGE_SIZE = 50;
  const ADMIN_ORDERS_TIMEOUT_MS = 15000;

  const { data: orders, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), ADMIN_ORDERS_TIMEOUT_MS);
      });
      const fetchPromise = (async () => {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false })
          .range(0, ADMIN_ORDERS_PAGE_SIZE - 1);
        if (error) throw error;
        return data as Order[];
      })();
      return Promise.race([fetchPromise, timeoutPromise]);
    },
  });

  const { data: orderItems, isLoading: orderItemsLoading } = useQuery({
    queryKey: ['admin-order-items', selectedOrder?.id],
    queryFn: async () => {
      if (!selectedOrder?.id) return [];
      const { data, error } = await supabase
        .from('order_items')
        .select('id, product_name, variant_info, quantity, unit_price, total_price, title_snapshot, image_snapshot')
        .eq('order_id', selectedOrder.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedOrder?.id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' }) => {
      const correlationId = generateCorrelationId();
      if (status === 'cancelled') {
        const { data, error } = await supabase.rpc('cancel_order_return_stock' as any, { p_order_id: id });
        if (error) throw error;
        if (data && typeof data === 'object' && (data as { success?: boolean }).success === false) {
          const msg = (data as { message?: string }).message || 'Não foi possível cancelar o pedido.';
          throw new Error(msg);
        }
        await logAudit({ action: 'update', resourceType: 'order', resourceId: id, resourceName: 'cancelled', newValues: { status: 'cancelled' }, correlationId });
        return;
      }
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
      await logAudit({ action: 'update', resourceType: 'order', resourceId: id, resourceName: status, newValues: { status }, correlationId });
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      toast({ title: status === 'cancelled' ? 'Pedido cancelado e estoque devolvido!' : 'Status atualizado!' });
    },
    onError: (err: Error) => {
      toast({ title: err.message || 'Erro ao atualizar status', variant: 'destructive' });
    },
  });

  const runReconcile = async (orderId: string) => {
    setReconcileOrderId(orderId);
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) {
      toast({ title: 'Erro', description: 'Sessão não encontrada.', variant: 'destructive' });
      setReconcileOrderId(null);
      return;
    }
    try {
      const res = await fetch(`${FUNCTIONS_URL}/reconcile-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_id: orderId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: 'Erro ao conciliar', description: body?.error || res.statusText, variant: 'destructive' });
        return;
      }
      if (body.ok) {
        toast({ title: 'Conciliação OK', description: `Status: ${body.previous_status} → ${body.new_status}` });
        queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
        if (selectedOrder?.id === orderId) queryClient.invalidateQueries({ queryKey: ['admin-order-items', orderId] });
      } else {
        toast({ title: 'Nada a atualizar', description: body?.message || body?.reason || 'Stripe não está com status succeeded.', variant: 'default' });
      }
    } catch (e) {
      toast({ title: 'Erro', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setReconcileOrderId(null);
    }
  };

  const deleteOrderTestMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.functions.invoke('admin-commerce-action', {
        body: { action: 'delete_order_test', order_id: orderId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { ok: boolean; order_number: string };
    },
    onSuccess: (data, orderId) => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      setOrderToDeleteTest(null);
      setSelectedOrder(null);
      logAudit({
        action: 'delete',
        resourceType: 'order',
        resourceId: orderId,
        resourceName: data?.order_number ?? orderId,
        newValues: { reason: 'modo teste', stock_restored: true },
      });
      toast({ title: 'Pedido excluído (modo teste)', description: 'Estoque devolvido. Use apenas em ambiente de teste.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' });
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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-warning/20 text-warning-foreground border-warning',
    processing: 'bg-blue-100 text-blue-800',
    shipped: 'bg-purple-100 text-purple-800',
    delivered: 'bg-success/20 text-success border-success',
    cancelled: 'bg-destructive/20 text-destructive',
  };

  const statusLabels: Record<string, string> = {
    pending: 'Pendente',
    processing: 'Processando',
    shipped: 'Enviado',
    delivered: 'Entregue',
    cancelled: 'Cancelado',
  };

  const getProviderLabel = (provider: string | null | undefined): string => {
    if (provider === 'stripe') return 'Stripe';
    if (provider === 'appmax') return 'Appmax';
    if (provider === 'yampi') return 'Yampi';
    return 'Site';
  };

  // Apply filters (null-safe: order_number/shipping_name can be null)
  const searchLower = searchQuery.toLowerCase();
  let filteredOrders = orders?.filter(o =>
    (o.order_number ?? '').toLowerCase().includes(searchLower) ||
    (o.shipping_name ?? '').toLowerCase().includes(searchLower)
  ) || [];

  // Status filter
  if (statusFilter !== 'all') {
    filteredOrders = filteredOrders.filter(o => o.status === statusFilter);
  }

  // Date filter
  if (dateFrom) {
    filteredOrders = filteredOrders.filter(o => new Date(o.created_at) >= dateFrom);
  }
  if (dateTo) {
    const endOfDay = new Date(dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    filteredOrders = filteredOrders.filter(o => new Date(o.created_at) <= endOfDay);
  }

  // Value filter
  if (minValue) {
    filteredOrders = filteredOrders.filter(o => Number(o.total_amount) >= Number(minValue));
  }
  if (maxValue) {
    filteredOrders = filteredOrders.filter(o => Number(o.total_amount) <= Number(maxValue));
  }

  // Sort
  switch (sortBy) {
    case 'oldest':
      filteredOrders.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      break;
    case 'value-asc':
      filteredOrders.sort((a, b) => Number(a.total_amount) - Number(b.total_amount));
      break;
    case 'value-desc':
      filteredOrders.sort((a, b) => Number(b.total_amount) - Number(a.total_amount));
      break;
    case 'newest':
    default:
      filteredOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      break;
  }

  const clearFilters = () => {
    setStatusFilter('all');
    setSortBy('newest');
    setDateFrom(undefined);
    setDateTo(undefined);
    setMinValue('');
    setMaxValue('');
    setSearchQuery('');
  };

  const hasActiveFilters = statusFilter !== 'all' || dateFrom || dateTo || minValue || maxValue;

  const handleExport = () => {
    if (!orders) return;
    const exportData = orders.map(o => ({
      numero: o.order_number,
      cliente: o.shipping_name,
      cidade: o.shipping_city,
      estado: o.shipping_state,
      status: statusLabels[o.status] || o.status,
      subtotal: o.subtotal,
      frete: o.shipping_cost,
      desconto: o.discount_amount,
      total: o.total_amount,
      data: new Date(o.created_at).toLocaleDateString('pt-BR'),
      rastreio: o.tracking_code || '',
    }));
    exportToCSV(exportData, 'pedidos');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Importação de CSV em desenvolvimento — funcionalidade em breve
    e.target.value = '';
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-3xl font-bold">Pedidos</h1>
            <HelpHint helpKey="admin.orders" />
          </div>
          <p className="text-xs md:text-sm text-muted-foreground">Gerencie os pedidos da sua loja</p>
        </div>
        {isMobile ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0 h-8 px-2">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" /> Exportar
              </DropdownMenuItem>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex w-full">
                      <DropdownMenuItem disabled className="opacity-70">
                        <Upload className="h-4 w-4 mr-2" /> Importar (em breve)
                      </DropdownMenuItem>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Funcionalidade em desenvolvimento</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" /> Exportar
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="outline" size="sm" disabled>
                      <Upload className="h-4 w-4 mr-2" /> Importar (em breve)
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Funcionalidade em desenvolvimento</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      {/* Search + filter toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar pedido ou cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
        <Button
          variant={showFilters || hasActiveFilters ? "default" : "outline"}
          size="sm"
          className="shrink-0 h-9"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {!isMobile && <span className="ml-2">Filtros</span>}
          {hasActiveFilters && <span className="ml-1 text-[10px] bg-background text-foreground rounded-full h-4 w-4 flex items-center justify-center">!</span>}
        </Button>
      </div>

      {/* Collapsible filters */}
      {showFilters && (
        <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-xs md:text-sm md:w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(statusLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-9 text-xs md:text-sm md:w-[160px]">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Mais recentes</SelectItem>
              <SelectItem value="oldest">Mais antigos</SelectItem>
              <SelectItem value="value-desc">Maior valor</SelectItem>
              <SelectItem value="value-asc">Menor valor</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs md:text-sm">
                <Calendar className="h-3.5 w-3.5 mr-1" /> Período
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4" align="start">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">De:</p>
                  <CalendarComponent mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} />
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Até:</p>
                  <CalendarComponent mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs md:text-sm">
                <DollarSign className="h-3.5 w-3.5 mr-1" /> Valor
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-4" align="start">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Valor mínimo:</p>
                  <Input type="number" placeholder="R$ 0,00" value={minValue} onChange={(e) => setMinValue(e.target.value)} />
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Valor máximo:</p>
                  <Input type="number" placeholder="R$ 10.000,00" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-9 text-xs col-span-2 md:col-span-1" onClick={clearFilters}>
              Limpar filtros
            </Button>
          )}
        </div>
      )}

      {/* Active filters badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5">
          {statusFilter !== 'all' && <Badge variant="secondary" className="text-[10px] md:text-xs">Status: {statusLabels[statusFilter]}</Badge>}
          {dateFrom && <Badge variant="secondary" className="text-[10px] md:text-xs">De: {format(dateFrom, 'dd/MM/yyyy')}</Badge>}
          {dateTo && <Badge variant="secondary" className="text-[10px] md:text-xs">Até: {format(dateTo, 'dd/MM/yyyy')}</Badge>}
          {minValue && <Badge variant="secondary" className="text-[10px] md:text-xs">Min: {formatPrice(Number(minValue))}</Badge>}
          {maxValue && <Badge variant="secondary" className="text-[10px] md:text-xs">Max: {formatPrice(Number(maxValue))}</Badge>}
        </div>
      )}

      {/* Orders list */}
      {isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
          <p className="text-sm text-destructive font-medium">
            Não foi possível carregar os pedidos. {error instanceof Error && error.message === 'timeout' ? 'A requisição demorou muito.' : ''}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : isMobile ? (
        /* Mobile: card layout */
        <div className="space-y-2">
          {isLoading ? (
            <p className="text-center py-8 text-sm text-muted-foreground">Carregando...</p>
          ) : filteredOrders?.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">Nenhum pedido encontrado</p>
          ) : (
            filteredOrders?.map((order) => (
              <div key={order.id} className="border rounded-lg p-3 space-y-2" onClick={() => setSelectedOrder(order)}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{order.order_number}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] px-1 py-0">{getProviderLabel((order as any).provider)}</Badge>
                    <Badge className={`${statusColors[order.status]} text-[10px] px-1.5 py-0.5`}>
                      {statusLabels[order.status]}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate mr-2">{order.shipping_name}</span>
                  <span className="shrink-0">{formatDate(order.created_at)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{formatPrice(Number(order.total_amount))}</span>
                  <Select
                    value={order.status}
                    onValueChange={(value) => {
                      updateStatusMutation.mutate({ id: order.id, status: value as any });
                    }}
                    disabled={updateStatusMutation.isPending && updateStatusMutation.variables?.id === order.id}
                  >
                    <SelectTrigger className="w-[110px] h-7 text-[10px]" onClick={(e) => e.stopPropagation()}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Desktop: table layout */
        <div className="bg-background rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Checkout</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">Carregando...</TableCell>
                </TableRow>
              ) : filteredOrders?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <AdminEmptyState
                      icon={ShoppingCart}
                      title="Nenhum pedido"
                      description={hasActiveFilters ? 'Nenhum pedido corresponde aos filtros aplicados. Tente alterar os critérios.' : 'Ainda não há pedidos na loja.'}
                      action={hasActiveFilters ? { label: 'Limpar filtros', onClick: clearFilters } : undefined}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders?.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.order_number}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{order.shipping_name}</p>
                        <p className="text-sm text-muted-foreground">{order.shipping_city} - {order.shipping_state}</p>
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(order.created_at)}</TableCell>
                    <TableCell className="font-medium">{formatPrice(Number(order.total_amount))}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-normal">{getProviderLabel((order as any).provider)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={order.status}
                        onValueChange={(value) => updateStatusMutation.mutate({ id: order.id, status: value as any })}
                        disabled={updateStatusMutation.isPending && updateStatusMutation.variables?.id === order.id}
                      >
                        <SelectTrigger className="w-[140px]">
                          <Badge className={statusColors[order.status]}>
                            {statusLabels[order.status]}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(statusLabels).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(order)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Order details dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base md:text-lg">Pedido {selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                {(selectedOrder as any).customer_email && (
                  <span>Email: {(selectedOrder as any).customer_email}</span>
                )}
                <Badge variant="outline" className="text-xs">{getProviderLabel((selectedOrder as any).provider)}</Badge>
              </div>
              {orderItemsLoading ? (
                <p className="text-sm text-muted-foreground">Carregando itens...</p>
              ) : orderItems && orderItems.length > 0 ? (
                <div>
                  <h3 className="font-medium mb-2">Itens do pedido</h3>
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Produto</TableHead>
                          <TableHead className="text-xs w-16">Qtd</TableHead>
                          <TableHead className="text-xs text-right">Unit.</TableHead>
                          <TableHead className="text-xs text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-sm">
                              <span className="font-medium">{item.title_snapshot || item.product_name}</span>
                              {item.variant_info && (
                                <span className="text-muted-foreground block text-xs">{item.variant_info}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{item.quantity}</TableCell>
                            <TableCell className="text-sm text-right">{formatPrice(Number(item.unit_price))}</TableCell>
                            <TableCell className="text-sm text-right font-medium">{formatPrice(Number(item.total_price))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium mb-2">Endereço de Entrega</h3>
                  <p>{selectedOrder.shipping_name ?? '—'}</p>
                  <p className="text-muted-foreground">
                    {selectedOrder.shipping_address}<br />
                    {selectedOrder.shipping_city} - {selectedOrder.shipping_state}<br />
                    CEP: {selectedOrder.shipping_zip}
                  </p>
                  {selectedOrder.shipping_phone && <p>Tel: {selectedOrder.shipping_phone}</p>}
                </div>
                <div>
                  <h3 className="font-medium mb-2">Resumo</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>{formatPrice(Number(selectedOrder.subtotal))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Frete:</span>
                      <span>{formatPrice(Number(selectedOrder.shipping_cost))}</span>
                    </div>
                    {selectedOrder.discount_amount > 0 && (
                      <div className="flex justify-between text-primary">
                        <span>Desconto:</span>
                        <span>-{formatPrice(Number(selectedOrder.discount_amount))}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold pt-2 border-t">
                      <span>Total:</span>
                      <span>{formatPrice(Number(selectedOrder.total_amount))}</span>
                    </div>
                  </div>
                </div>
              </div>
              {selectedOrder.tracking_code && (
                <div>
                  <h3 className="font-medium mb-2">Rastreamento</h3>
                  <p className="text-muted-foreground">{selectedOrder.tracking_code}</p>
                </div>
              )}
              {selectedOrder.notes && (
                <div>
                  <h3 className="font-medium mb-2">Observações</h3>
                  <p className="text-muted-foreground">{selectedOrder.notes}</p>
                </div>
              )}
              {/* PR6: Timeline do pedido */}
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Timeline
                </h3>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>Criado em {format(new Date(selectedOrder.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</li>
                  <li>Última atualização: {format(new Date(selectedOrder.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}{(selectedOrder as any).last_webhook_event ? ` (${(selectedOrder as any).last_webhook_event})` : ''}</li>
                </ul>
              </div>
              {/* PR6: Conciliação — sync status com Stripe */}
              {(selectedOrder as any).provider === 'stripe' && (selectedOrder as any).transaction_id && (
                <div className="pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => runReconcile(selectedOrder.id)}
                    disabled={reconcileOrderId !== null}
                  >
                    {reconcileOrderId === selectedOrder.id ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Conciliar com Stripe
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Consulta o status do pagamento no Stripe e atualiza o pedido (ex.: pagou mas webhook não chegou).
                  </p>
                </div>
              )}
              <div className="pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-amber-600 border-amber-200 hover:bg-amber-50"
                  onClick={() => setOrderToDeleteTest(selectedOrder)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir pedido (modo teste)
                </Button>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Restaura estoque e remove o pedido. Use apenas em ambiente de teste.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!orderToDeleteTest} onOpenChange={() => !deleteOrderTestMutation.isPending && setOrderToDeleteTest(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pedido (modo teste)</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido <strong>{orderToDeleteTest?.order_number}</strong> será excluído permanentemente. O estoque dos itens será devolvido.
              Esta ação é irreversível. Use apenas em ambiente de teste.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteOrderTestMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => orderToDeleteTest && deleteOrderTestMutation.mutate(orderToDeleteTest.id)}
              disabled={deleteOrderTestMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteOrderTestMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
