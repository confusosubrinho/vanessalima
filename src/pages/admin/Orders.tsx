import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Search, Eye, MoreHorizontal, Calendar, DollarSign, ArrowUpDown, Filter, Download, Upload, SlidersHorizontal } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { exportToCSV, parseCSV, readFileAsText } from '@/lib/csv';
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
import { useToast } from '@/hooks/use-toast';
import { Order } from '@/types/database';
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

  const { data: orders, isLoading } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Order[];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' }) => {
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      toast({ title: 'Status atualizado!' });
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

  // Apply filters
  let filteredOrders = orders?.filter(o =>
    o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.shipping_name.toLowerCase().includes(searchQuery.toLowerCase())
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
  const importRef = useRef<HTMLInputElement>(null);

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
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await readFileAsText(file);
    const rows = parseCSV(text);
    console.log(`${rows.length} pedidos lidos`);
    if (importRef.current) importRef.current.value = '';
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-bold">Pedidos</h1>
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
              <DropdownMenuItem onClick={() => importRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Importar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" /> Exportar
            </Button>
            <label>
              <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
              <Button variant="outline" size="sm" asChild>
                <span><Upload className="h-4 w-4 mr-2" /> Importar</span>
              </Button>
            </label>
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
      {isMobile ? (
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
                  <Badge className={`${statusColors[order.status]} text-[10px] px-1.5 py-0.5`}>
                    {statusLabels[order.status]}
                  </Badge>
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
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">Carregando...</TableCell>
                </TableRow>
              ) : filteredOrders?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhum pedido encontrado
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
                      <Select
                        value={order.status}
                        onValueChange={(value) => updateStatusMutation.mutate({ id: order.id, status: value as any })}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium mb-2">Endereço de Entrega</h3>
                  <p>{selectedOrder.shipping_name}</p>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
