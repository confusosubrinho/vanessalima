import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Search, Eye, Mail, Phone, Calendar, DollarSign, ArrowUpDown, ShoppingBag } from 'lucide-react';
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

export default function Customers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [sortBy, setSortBy] = useState<string>('newest');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [minSpent, setMinSpent] = useState<string>('');
  const [maxSpent, setMaxSpent] = useState<string>('');
  const [minOrders, setMinOrders] = useState<string>('');

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Clientes</h1>
        <p className="text-muted-foreground">Visualize os clientes da sua loja</p>
      </div>

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
