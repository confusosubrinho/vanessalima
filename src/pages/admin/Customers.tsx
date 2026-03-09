import { useState, useRef } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatPrice, formatDate } from '@/lib/formatters';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Search, Eye, Mail, Phone, Calendar, DollarSign, ArrowUpDown, ShoppingBag, Download, Upload, Loader2, CheckCircle, AlertCircle, Users, MoreHorizontal, MessageCircle, Pencil, Save, X, MapPin, Package, Cake } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { exportToCSV, parseCSV, readFileAsText } from '@/lib/csv';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Customer } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  processing: 'Processando',
  paid: 'Pago',
  shipped: 'Enviado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};
const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
};

function getWhatsAppNumber(phone: string | null) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55')) return digits;
  return '55' + digits;
}

export default function Customers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [sortBy, setSortBy] = useState<string>('newest');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [minSpent, setMinSpent] = useState<string>('');
  const [maxSpent, setMaxSpent] = useState<string>('');
  const [minOrders, setMinOrders] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  const isMobile = useIsMobile();
  const [currentPage, setCurrentPage] = useState(1);
  const CUSTOMERS_PER_PAGE = 50;

  const { data: customersResult, isLoading } = useQuery({
    queryKey: ['admin-customers', currentPage, sortBy],
    queryFn: async () => {
      const from = (currentPage - 1) * CUSTOMERS_PER_PAGE;
      const to = from + CUSTOMERS_PER_PAGE - 1;

      let sortCol = 'created_at';
      let ascending = false;
      switch (sortBy) {
        case 'oldest': sortCol = 'created_at'; ascending = true; break;
        case 'spent-desc': sortCol = 'total_spent'; ascending = false; break;
        case 'spent-asc': sortCol = 'total_spent'; ascending = true; break;
        case 'orders-desc': sortCol = 'total_orders'; ascending = false; break;
        case 'orders-asc': sortCol = 'total_orders'; ascending = true; break;
        case 'name-asc': sortCol = 'full_name'; ascending = true; break;
        case 'name-desc': sortCol = 'full_name'; ascending = false; break;
        case 'newest': default: sortCol = 'created_at'; ascending = false; break;
      }

      const { data, error, count } = await supabase
        .from('customers')
        .select('*', { count: 'exact' })
        .order(sortCol, { ascending })
        .range(from, to);
      if (error) throw error;
      return { customers: (data || []) as Customer[], total: count || 0 };
    },
  });

  const customers = customersResult?.customers;
  const totalCustomers = customersResult?.total || 0;

  // formatPrice and formatDate imported from @/lib/formatters

  // Apply filters (null-safe: full_name/email can be null)
  const searchLower = searchQuery.toLowerCase();
  let filteredCustomers = customers?.filter(c =>
    (c.full_name ?? '').toLowerCase().includes(searchLower) ||
    (c.email ?? '').toLowerCase().includes(searchLower)
  ) || [];

  // Date filter
  if (dateFrom) {
    filteredCustomers = filteredCustomers.filter(c => new Date(c.created_at) >= dateFrom);
  }
  if (dateTo) {
    const endOfDay = new Date(dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    filteredCustomers = filteredCustomers.filter(c => new Date(c.created_at) <= endOfDay);
  }

  // Spent filter
  if (minSpent) {
    filteredCustomers = filteredCustomers.filter(c => Number(c.total_spent) >= Number(minSpent));
  }
  if (maxSpent) {
    filteredCustomers = filteredCustomers.filter(c => Number(c.total_spent) <= Number(maxSpent));
  }

  // Orders filter
  if (minOrders) {
    filteredCustomers = filteredCustomers.filter(c => (c.total_orders || 0) >= Number(minOrders));
  }

  // Sort is now done server-side, no client-side sort needed

  const clearFilters = () => {
    setSortBy('newest');
    setDateFrom(undefined);
    setDateTo(undefined);
    setMinSpent('');
    setMaxSpent('');
    setMinOrders('');
    setSearchQuery('');
  };

  const hasActiveFilters = dateFrom || dateTo || minSpent || maxSpent || minOrders;
  const importRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    if (!customers) return;
    const exportData = customers.map(c => ({
      nome: c.full_name,
      email: c.email,
      telefone: c.phone || '',
      pedidos: c.total_orders,
      total_gasto: c.total_spent,
      desde: new Date(c.created_at).toLocaleDateString('pt-BR'),
    }));
    exportToCSV(exportData, 'clientes');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);

    try {
      const text = await readFileAsText(file);
      
      // Parse semicolon-separated Tray CSV
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        toast({ title: 'CSV vazio ou inválido', variant: 'destructive' });
        return;
      }

      // Parse header to find column indices
      const parseRow = (line: string) => line.split(';').map(cell => cell.replace(/^"|"$/g, '').trim());
      const header = parseRow(lines[0]);
      
      const col = (name: string) => {
        const variants: Record<string, string[]> = {
          name: ['Nome cliente', 'nome cliente', 'Nome'],
          email: ['E-mail', 'e-mail', 'Email', 'email'],
          phone: ['Telefone principal', 'telefone principal', 'Telefone', 'telefone'],
          phone2: ['Telefone 2', 'telefone 2'],
          birthday: ['Data nascimento', 'data nascimento'],
          orders: ['Total pedidos', 'total pedidos'],
          date: ['Data cadastro', 'data cadastro'],
        };
        const keys = variants[name] || [name];
        for (const k of keys) {
          // Normalize accents for matching (CSV may have encoding issues)
          const idx = header.findIndex(h => {
            const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            return norm(h) === norm(k) || h.includes(k) || k.includes(h);
          });
          if (idx >= 0) return idx;
        }
        return -1;
      };

      const nameIdx = col('name');
      const emailIdx = col('email');
      const phoneIdx = col('phone');
      const phone2Idx = col('phone2');
      const birthdayIdx = col('birthday');
      const ordersIdx = col('orders');
      const dateIdx = col('date');

      if (nameIdx < 0 || emailIdx < 0) {
        toast({ title: 'Colunas obrigatórias não encontradas', description: 'O CSV precisa ter "Nome cliente" e "E-mail"', variant: 'destructive' });
        return;
      }

      // Get existing emails to skip duplicates
      const { data: existingCustomers } = await supabase.from('customers').select('email');
      const existingEmails = new Set((existingCustomers || []).map(c => c.email.toLowerCase()));

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      const batch: any[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cells = parseRow(lines[i]);
        const name = cells[nameIdx];
        const email = cells[emailIdx];

        if (!name || !email || !email.includes('@')) {
          skipped++;
          continue;
        }

        if (existingEmails.has(email.toLowerCase())) {
          skipped++;
          continue;
        }

        // Parse phone - remove quotes and apostrophes
        let phone = phoneIdx >= 0 ? cells[phoneIdx]?.replace(/'/g, '') : '';
        if (!phone && phone2Idx >= 0) phone = cells[phone2Idx]?.replace(/'/g, '') || '';

        // Parse birthday (DD/MM/YYYY → YYYY-MM-DD)
        let birthday: string | null = null;
        if (birthdayIdx >= 0 && cells[birthdayIdx]) {
          const parts = cells[birthdayIdx].split('/');
          if (parts.length === 3 && parts[2].length === 4) {
            birthday = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }

        // Parse registration date
        let createdAt: string | undefined;
        if (dateIdx >= 0 && cells[dateIdx]) {
          const parts = cells[dateIdx].split('/');
          if (parts.length === 3 && parts[2].length === 4) {
            createdAt = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}T00:00:00Z`;
          }
        }

        const totalOrders = ordersIdx >= 0 ? parseInt(cells[ordersIdx]) || 0 : 0;

        batch.push({
          full_name: name,
          email: email.toLowerCase(),
          phone: phone || null,
          birthday: birthday,
          total_orders: totalOrders,
          total_spent: 0,
          ...(createdAt ? { created_at: createdAt } : {}),
        });

        existingEmails.add(email.toLowerCase());
        imported++;
      }

      // Insert in batches of 50
      for (let i = 0; i < batch.length; i += 50) {
        const chunk = batch.slice(i, i + 50);
        const { error } = await supabase.from('customers').insert(chunk);
        if (error) {
          errors.push(`Lote ${Math.floor(i / 50) + 1}: ${error.message}`);
        }
      }

      setImportResult({ imported, skipped, errors });
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
      toast({
        title: 'Importação concluída!',
        description: `${imported} importados, ${skipped} ignorados${errors.length > 0 ? `, ${errors.length} erros` : ''}`,
      });
    } catch (err: any) {
      toast({ title: 'Erro na importação', description: err.message, variant: 'destructive' });
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-3xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Visualize os clientes da sua loja</p>
        </div>
        {isMobile ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="h-4 w-4 mr-2" />
                Ações
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => importRef.current?.click()} disabled={importing}>
                {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {importing ? 'Importando...' : 'Importar Tray'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
            <label>
              <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport} disabled={importing} />
              <Button variant="outline" size="sm" asChild disabled={importing}>
                <span>
                  {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  {importing ? 'Importando...' : 'Importar Tray'}
                </span>
              </Button>
            </label>
          </div>
        )}
        <input ref={isMobile ? importRef : undefined} type="file" accept=".csv" className="hidden" onChange={handleImport} disabled={importing} />
      </div>

      {/* Import result */}
      {importResult && (
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Resultado da Importação</p>
            <button onClick={() => setImportResult(null)} className="ml-auto text-muted-foreground hover:text-foreground text-xs">✕</button>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-primary font-medium">{importResult.imported} importados</span>
            <span className="text-muted-foreground">{importResult.skipped} ignorados (duplicados/inválidos)</span>
            {importResult.errors.length > 0 && (
              <span className="text-destructive">{importResult.errors.length} erros</span>
            )}
          </div>
          {importResult.errors.length > 0 && (
            <div className="text-xs text-destructive space-y-1 mt-2">
              {importResult.errors.map((err, i) => (
                <p key={i} className="flex items-start gap-1"><AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />{err}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[180px]">
            <ArrowUpDown className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Mais recentes</SelectItem>
            <SelectItem value="oldest">Mais antigos</SelectItem>
            <SelectItem value="spent-desc">Maior gasto</SelectItem>
            <SelectItem value="spent-asc">Menor gasto</SelectItem>
            <SelectItem value="orders-desc">Mais pedidos</SelectItem>
            <SelectItem value="orders-asc">Menos pedidos</SelectItem>
            <SelectItem value="name-asc">Nome A-Z</SelectItem>
            <SelectItem value="name-desc">Nome Z-A</SelectItem>
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Calendar className="h-4 w-4 mr-2" />
              Período
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="start">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Cliente desde:</p>
                <CalendarComponent
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  locale={ptBR}
                />
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Até:</p>
                <CalendarComponent
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  locale={ptBR}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <DollarSign className="h-4 w-4 mr-2" />
              Total Gasto
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-4" align="start">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Valor mínimo:</p>
                <Input
                  type="number"
                  placeholder="R$ 0,00"
                  value={minSpent}
                  onChange={(e) => setMinSpent(e.target.value)}
                />
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Valor máximo:</p>
                <Input
                  type="number"
                  placeholder="R$ 10.000,00"
                  value={maxSpent}
                  onChange={(e) => setMaxSpent(e.target.value)}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <ShoppingBag className="h-4 w-4 mr-2" />
              Pedidos
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-4" align="start">
            <div>
              <p className="text-sm font-medium mb-2">Mínimo de pedidos:</p>
              <Input
                type="number"
                placeholder="0"
                value={minOrders}
                onChange={(e) => setMinOrders(e.target.value)}
              />
            </div>
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Active filters display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {dateFrom && (
            <Badge variant="secondary">
              Desde: {format(dateFrom, 'dd/MM/yyyy')}
            </Badge>
          )}
          {dateTo && (
            <Badge variant="secondary">
              Até: {format(dateTo, 'dd/MM/yyyy')}
            </Badge>
          )}
          {minSpent && (
            <Badge variant="secondary">
              Min gasto: {formatPrice(Number(minSpent))}
            </Badge>
          )}
          {maxSpent && (
            <Badge variant="secondary">
              Max gasto: {formatPrice(Number(maxSpent))}
            </Badge>
          )}
          {minOrders && (
            <Badge variant="secondary">
              Min pedidos: {minOrders}
            </Badge>
          )}
        </div>
      )}

      {(() => {
        const totalCustomerPages = Math.ceil(totalCustomers / CUSTOMERS_PER_PAGE);
        // Client-side filters applied on current page data
        const paginatedCustomers = filteredCustomers;

        return (
          <>
            {isMobile ? (
              /* Mobile card layout */
              <div className="space-y-2">
                {isLoading ? (
                  <p className="text-center py-8 text-muted-foreground">Carregando...</p>
                ) : paginatedCustomers.length === 0 ? (
                  <AdminEmptyState
                    icon={Users}
                    title="Nenhum cliente"
                    description={hasActiveFilters ? 'Nenhum cliente corresponde aos filtros.' : 'Ainda não há clientes cadastrados.'}
                    action={hasActiveFilters ? { label: 'Limpar filtros', onClick: clearFilters } : undefined}
                  />
                ) : (
                  paginatedCustomers.map((customer) => (
                    <div key={customer.id} className="bg-background border rounded-lg p-3 flex items-center gap-3" onClick={() => setSelectedCustomer(customer)}>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{customer.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground">{customer.total_orders} pedidos</span>
                          <span className="text-xs font-medium text-primary">{formatPrice(Number(customer.total_spent))}</span>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="shrink-0">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* Desktop table layout */
              <div className="bg-background rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Pedidos</TableHead>
                      <TableHead>Total Gasto</TableHead>
                      <TableHead>Desde</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">Carregando...</TableCell>
                      </TableRow>
                    ) : paginatedCustomers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="p-0">
                          <AdminEmptyState
                            icon={Users}
                            title="Nenhum cliente"
                            description={hasActiveFilters ? 'Nenhum cliente corresponde aos filtros. Tente alterar os critérios.' : 'Ainda não há clientes cadastrados.'}
                            action={hasActiveFilters ? { label: 'Limpar filtros', onClick: clearFilters } : undefined}
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedCustomers.map((customer) => (
                        <TableRow key={customer.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{customer.full_name}</p>
                              <p className="text-sm text-muted-foreground">{customer.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>{customer.phone || '-'}</TableCell>
                          <TableCell>{customer.total_orders}</TableCell>
                          <TableCell className="font-medium">{formatPrice(Number(customer.total_spent))}</TableCell>
                          <TableCell>{formatDate(customer.created_at)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => setSelectedCustomer(customer)}>
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

            {/* Pagination */}
            {totalCustomerPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>‹</Button>
                <span className="text-sm text-muted-foreground">
                  Página {currentPage} de {totalCustomerPages} ({totalCustomers} clientes)
                </span>
                <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => setCurrentPage(p => Math.min(totalCustomerPages, p + 1))} disabled={currentPage === totalCustomerPages}>›</Button>
              </div>
            )}
          </>
        );
      })()}

      {/* Customer details sheet */}
      <CustomerDetailSheet
        customer={selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
      />
    </div>
  );
}

function CustomerDetailSheet({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBirthday, setEditBirthday] = useState('');

  // Fetch orders with items when customer is selected
  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['customer-orders', customer?.id],
    enabled: !!customer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, status, total_amount, created_at, yampi_created_at, shipping_address, shipping_city, shipping_state, shipping_zip, shipping_name, payment_method, order_items(product_name, quantity, unit_price, image_snapshot, variant_info)')
        .eq('customer_id', customer!.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (fields: { full_name: string; phone: string | null; birthday: string | null }) => {
      const { error } = await supabase
        .from('customers')
        .update(fields)
        .eq('id', customer!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Cliente atualizado!' });
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
      setEditing(false);
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao atualizar', description: err.message, variant: 'destructive' });
    },
  });

  const startEditing = () => {
    if (!customer) return;
    setEditName(customer.full_name);
    setEditPhone(customer.phone || '');
    setEditBirthday(customer.birthday || '');
    setEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate({
      full_name: editName,
      phone: editPhone || null,
      birthday: editBirthday || null,
    });
  };

  // Derive address from most recent order
  const latestOrder = orders?.[0];
  const address = latestOrder
    ? `${latestOrder.shipping_address}, ${latestOrder.shipping_city} - ${latestOrder.shipping_state}, ${latestOrder.shipping_zip}`
    : null;

  const avgTicket = customer && customer.total_orders > 0
    ? Number(customer.total_spent) / customer.total_orders
    : 0;

  const firstOrderDate = orders?.length ? orders[orders.length - 1].yampi_created_at || orders[orders.length - 1].created_at : null;
  const lastOrderDate = orders?.length ? orders[0].yampi_created_at || orders[0].created_at : null;

  const getOrderDate = (o: any): string => (o.yampi_created_at as string) || o.created_at;

  return (
    <Sheet open={!!customer} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalhes do Cliente</SheetTitle>
        </SheetHeader>
        {customer && (
          <div className="space-y-5 mt-4">
            {/* Info section */}
            <div className="space-y-2">
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Nome</label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Telefone</label>
                    <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="(00) 00000-0000" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Data de nascimento</label>
                    <Input type="date" value={editBirthday} onChange={e => setEditBirthday(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                      {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={updateMutation.isPending}>
                      <X className="h-4 w-4 mr-1" /> Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{customer.full_name}</h3>
                      <p className="text-sm text-muted-foreground">Cliente desde {formatDate(customer.created_at)}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={startEditing}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{customer.email}</span>
                  </div>
                  {customer.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>{customer.phone}</span>
                    </div>
                  )}
                  {customer.birthday && (
                    <div className="flex items-center gap-2 text-sm">
                      <Cake className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>{format(new Date(customer.birthday + 'T12:00:00'), 'dd/MM/yyyy')}</span>
                    </div>
                  )}
                  {address && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">{address}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {customer.phone && (
                <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50" asChild>
                  <a href={`https://wa.me/${getWhatsAppNumber(customer.phone)}?text=${encodeURIComponent(`Olá ${customer.full_name}!`)}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                  </a>
                </Button>
              )}
              <Button size="sm" variant="outline" asChild>
                <a href={`mailto:${customer.email}`}>
                  <Mail className="h-4 w-4 mr-1" /> Email
                </a>
              </Button>
            </div>

            <Separator />

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold">{customer.total_orders}</p>
                <p className="text-xs text-muted-foreground">Pedidos</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{formatPrice(Number(customer.total_spent))}</p>
                <p className="text-xs text-muted-foreground">Total gasto</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{formatPrice(avgTicket)}</p>
                <p className="text-xs text-muted-foreground">Ticket médio</p>
              </div>
            </div>

            {firstOrderDate && lastOrderDate && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Primeira compra: {formatDate(firstOrderDate)}</span>
                <span>Última: {formatDate(lastOrderDate)}</span>
              </div>
            )}

            <Separator />

            {/* Purchase History */}
            <div>
              <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                <Package className="h-4 w-4" /> Histórico de Compras
              </h4>
              {ordersLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !orders?.length ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum pedido encontrado.</p>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {orders.map((order) => (
                    <div key={order.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">#{order.order_number}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[order.status] || 'bg-muted text-muted-foreground'}`}>
                            {statusLabels[order.status] || order.status}
                          </span>
                        </div>
                        <span className="font-semibold text-sm">{formatPrice(Number(order.total_amount))}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDate(getOrderDate(order))}</p>
                      {/* Order items */}
                      {(order as any).order_items?.length > 0 && (
                        <div className="space-y-1 pt-1">
                          {(order as any).order_items.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              {item.image_snapshot && (
                                <img src={item.image_snapshot} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="truncate">{item.product_name}</p>
                                {item.variant_info && <p className="text-muted-foreground">{item.variant_info}</p>}
                              </div>
                              <span className="shrink-0 text-muted-foreground">{item.quantity}x {formatPrice(Number(item.unit_price))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
