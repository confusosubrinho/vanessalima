import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminNotification } from '@/hooks/useNotifications';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Bell, Trash2, CheckCheck, ShoppingCart, PackageX, Star } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

const TYPE_LABELS: Record<string, string> = {
  new_order: 'Pedido',
  low_stock: 'Estoque',
  new_review: 'Avaliação',
  cart_recovered: 'Carrinho',
  new_customer: 'Cliente',
};
const TYPE_COLORS: Record<string, string> = {
  new_order: 'bg-green-100 text-green-700',
  low_stock: 'bg-red-100 text-red-700',
  new_review: 'bg-yellow-100 text-yellow-700',
  cart_recovered: 'bg-blue-100 text-blue-700',
  new_customer: 'bg-purple-100 text-purple-700',
};

export default function Notifications() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-notifications-all', typeFilter, statusFilter, page],
    queryFn: async () => {
      let q = supabase
        .from('admin_notifications' as any)
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (typeFilter !== 'all') q = q.eq('type', typeFilter);
      if (statusFilter === 'unread') q = q.eq('is_read', false);
      if (statusFilter === 'read') q = q.eq('is_read', true);

      const { data: rows, count, error } = await q;
      if (error) throw error;
      return { rows: (rows as unknown as AdminNotification[]) || [], total: count || 0 };
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: 'read' | 'unread' | 'delete' }) => {
      if (action === 'delete') {
        const { error } = await supabase.from('admin_notifications' as any).delete().in('id', ids);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('admin_notifications' as any).update({ is_read: action === 'read' }).in('id', ids);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
      setSelected(new Set());
      toast({ title: 'Atualizado!' });
    },
  });

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (!data?.rows) return;
    if (selected.size === data.rows.length) setSelected(new Set());
    else setSelected(new Set(data.rows.map(r => r.id)));
  };

  const totalPages = Math.ceil((data?.total || 0) / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-3xl font-bold">Notificações</h1>
        <p className="text-sm text-muted-foreground">Central de notificações do admin</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="new_order">Pedidos</SelectItem>
            <SelectItem value="low_stock">Estoque</SelectItem>
            <SelectItem value="new_review">Avaliações</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="unread">Não lidas</SelectItem>
            <SelectItem value="read">Lidas</SelectItem>
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <div className="flex gap-1 ml-auto">
            <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ ids: [...selected], action: 'read' })}>
              <CheckCheck className="h-4 w-4 mr-1" />Marcar lidas
            </Button>
            <Button size="sm" variant="destructive" onClick={() => bulkMutation.mutate({ ids: [...selected], action: 'delete' })}>
              <Trash2 className="h-4 w-4 mr-1" />Excluir
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : !data?.rows.length ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <Bell className="h-12 w-12 mb-3 opacity-30" />
              <p>Nenhuma notificação encontrada</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 text-xs text-muted-foreground">
                <Checkbox checked={selected.size === data.rows.length && data.rows.length > 0} onCheckedChange={toggleAll} />
                <span className="flex-1">{selected.size > 0 ? `${selected.size} selecionadas` : 'Selecionar'}</span>
              </div>
              {data.rows.map(n => (
                <button
                  key={n.id}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-muted/30 transition-colors ${!n.is_read ? 'bg-primary/5' : ''}`}
                  onClick={() => { if (n.link) navigate(n.link); }}
                >
                  <Checkbox
                    checked={selected.has(n.id)}
                    onCheckedChange={() => toggleSelect(n.id)}
                    onClick={e => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${!n.is_read ? 'font-semibold' : ''}`}>{n.title}</span>
                      <Badge variant="secondary" className={`text-[10px] ${TYPE_COLORS[n.type] || ''}`}>
                        {TYPE_LABELS[n.type] || n.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{n.message}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <span className="text-sm text-muted-foreground self-center">{page + 1} de {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Próximo</Button>
        </div>
      )}
    </div>
  );
}
