import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { Package, ShoppingCart, Users, Tags, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{
    products: any[];
    orders: any[];
    customers: any[];
    coupons: any[];
  }>({ products: [], orders: [], customers: [], coupons: [] });
  const navigate = useNavigate();

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults({ products: [], orders: [], customers: [], coupons: [] });
      return;
    }

    const timer = setTimeout(async () => {
      const q = `%${query}%`;
      const [products, orders, customers, coupons] = await Promise.all([
        supabase.from('products').select('id, name, slug, base_price, sale_price').ilike('name', q).limit(5),
        supabase.from('orders').select('id, order_number, shipping_name, total_amount, status').or(`order_number.ilike.${q},shipping_name.ilike.${q}`).limit(5),
        supabase.from('customers').select('id, full_name, email').or(`full_name.ilike.${q},email.ilike.${q}`).limit(5),
        supabase.from('coupons').select('id, code, discount_value, discount_type').ilike('code', q).limit(3),
      ]);

      setResults({
        products: products.data || [],
        orders: orders.data || [],
        customers: customers.data || [],
        coupons: coupons.data || [],
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const go = useCallback((path: string) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  }, [navigate]);

  const formatPrice = (p: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p);

  const hasResults = results.products.length + results.orders.length + results.customers.length + results.coupons.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar produtos, pedidos, clientes..." value={query} onValueChange={setQuery} />
      <CommandList>
        {query.length < 2 ? (
          <CommandGroup heading="Atalhos">
            <CommandItem onSelect={() => go('/admin/produtos')}><Package className="h-4 w-4 mr-2" />Produtos <kbd className="ml-auto text-xs bg-muted px-1.5 py-0.5 rounded">⌘P</kbd></CommandItem>
            <CommandItem onSelect={() => go('/admin/pedidos')}><ShoppingCart className="h-4 w-4 mr-2" />Pedidos <kbd className="ml-auto text-xs bg-muted px-1.5 py-0.5 rounded">⌘O</kbd></CommandItem>
            <CommandItem onSelect={() => go('/admin/clientes')}><Users className="h-4 w-4 mr-2" />Clientes <kbd className="ml-auto text-xs bg-muted px-1.5 py-0.5 rounded">⌘C</kbd></CommandItem>
            <CommandItem onSelect={() => go('/admin/produtos')}><Plus className="h-4 w-4 mr-2" />Novo Produto <kbd className="ml-auto text-xs bg-muted px-1.5 py-0.5 rounded">⌘N</kbd></CommandItem>
          </CommandGroup>
        ) : !hasResults ? (
          <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        ) : (
          <>
            {results.products.length > 0 && (
              <CommandGroup heading="Produtos">
                {results.products.map(p => (
                  <CommandItem key={p.id} onSelect={() => go('/admin/produtos')}>
                    <Package className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="flex-1">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{formatPrice(Number(p.sale_price || p.base_price))}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.orders.length > 0 && (
              <CommandGroup heading="Pedidos">
                {results.orders.map(o => (
                  <CommandItem key={o.id} onSelect={() => go('/admin/pedidos')}>
                    <ShoppingCart className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="font-mono mr-2">{o.order_number}</span>
                    <span className="flex-1 text-sm">{o.shipping_name}</span>
                    <span className="text-xs text-muted-foreground">{formatPrice(Number(o.total_amount))}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.customers.length > 0 && (
              <CommandGroup heading="Clientes">
                {results.customers.map(c => (
                  <CommandItem key={c.id} onSelect={() => go('/admin/clientes')}>
                    <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="flex-1">{c.full_name}</span>
                    <span className="text-xs text-muted-foreground">{c.email}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.coupons.length > 0 && (
              <CommandGroup heading="Cupons">
                {results.coupons.map(c => (
                  <CommandItem key={c.id} onSelect={() => go('/admin/cupons')}>
                    <Tags className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="font-mono font-bold mr-2">{c.code}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.discount_type === 'percentage' ? `${c.discount_value}%` : formatPrice(Number(c.discount_value))}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
