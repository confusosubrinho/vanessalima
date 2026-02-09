import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Search, Eye, Mail, Phone, Calendar, DollarSign, ArrowUpDown, ShoppingBag, Download, Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { exportToCSV, parseCSV, readFileAsText } from '@/lib/csv';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Customer } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

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

  const { data: customers, isLoading } = useQuery({
    queryKey: ['admin-customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Customer[];
    },
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR');
  };

  // Apply filters
  let filteredCustomers = customers?.filter(c =>
    c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
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

  // Sort
  switch (sortBy) {
    case 'oldest':
      filteredCustomers.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      break;
    case 'spent-desc':
      filteredCustomers.sort((a, b) => Number(b.total_spent) - Number(a.total_spent));
      break;
    case 'spent-asc':
      filteredCustomers.sort((a, b) => Number(a.total_spent) - Number(b.total_spent));
      break;
    case 'orders-desc':
      filteredCustomers.sort((a, b) => (b.total_orders || 0) - (a.total_orders || 0));
      break;
    case 'orders-asc':
      filteredCustomers.sort((a, b) => (a.total_orders || 0) - (b.total_orders || 0));
      break;
    case 'name-asc':
      filteredCustomers.sort((a, b) => a.full_name.localeCompare(b.full_name));
      break;
    case 'name-desc':
      filteredCustomers.sort((a, b) => b.full_name.localeCompare(a.full_name));
      break;
    case 'newest':
    default:
      filteredCustomers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      break;
  }

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">Visualize os clientes da sua loja</p>
        </div>
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
            ) : filteredCustomers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum cliente encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredCustomers?.map((customer) => (
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

      {/* Customer details dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes do Cliente</DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-lg">{selectedCustomer.full_name}</h3>
                <p className="text-muted-foreground">Cliente desde {formatDate(selectedCustomer.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${selectedCustomer.email}`} className="text-primary hover:underline">
                  {selectedCustomer.email}
                </a>
              </div>
              {selectedCustomer.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${selectedCustomer.phone}`} className="text-primary hover:underline">
                    {selectedCustomer.phone}
                  </a>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-sm text-muted-foreground">Total de Pedidos</p>
                  <p className="text-2xl font-bold">{selectedCustomer.total_orders}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Gasto</p>
                  <p className="text-2xl font-bold">{formatPrice(Number(selectedCustomer.total_spent))}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
