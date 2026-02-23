import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download } from 'lucide-react';
import { exportToCSV } from '@/lib/csv';

const ACTION_LABELS: Record<string, string> = {
  create: 'Criação',
  update: 'Atualização',
  delete: 'Exclusão',
  export: 'Exportação',
  login: 'Login',
};

const RESOURCE_LABELS: Record<string, string> = {
  product: 'Produto',
  order: 'Pedido',
  customer: 'Cliente',
  coupon: 'Cupom',
  category: 'Categoria',
  admin_member: 'Membro',
};

export default function AuditLog() {
  const [filterAction, setFilterAction] = useState('all');
  const [filterResource, setFilterResource] = useState('all');

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-log', filterAction, filterResource],
    queryFn: async () => {
      let q = supabase
        .from('admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (filterAction !== 'all') q = q.eq('action', filterAction);
      if (filterResource !== 'all') q = q.eq('resource_type', filterResource);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Log de Auditoria</h1>
          <p className="text-muted-foreground">Registro de todas as ações administrativas</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => logs && exportToCSV(logs.map(l => ({
            data: new Date(l.created_at).toLocaleString('pt-BR'),
            usuario: l.user_email || '—',
            acao: ACTION_LABELS[l.action] || l.action,
            recurso: RESOURCE_LABELS[l.resource_type] || l.resource_type,
            nome: l.resource_name || '—',
          })), 'auditoria')}
          disabled={!logs?.length}
        >
          <Download className="h-4 w-4 mr-2" />Exportar CSV
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Ação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            <SelectItem value="create">Criação</SelectItem>
            <SelectItem value="update">Atualização</SelectItem>
            <SelectItem value="delete">Exclusão</SelectItem>
            <SelectItem value="export">Exportação</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterResource} onValueChange={setFilterResource}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Recurso" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="product">Produto</SelectItem>
            <SelectItem value="order">Pedido</SelectItem>
            <SelectItem value="coupon">Cupom</SelectItem>
            <SelectItem value="category">Categoria</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-background rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Recurso</TableHead>
              <TableHead>Nome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell></TableRow>
            ) : !logs?.length ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum registro</TableCell></TableRow>
            ) : logs.map(log => (
              <TableRow key={log.id}>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}
                </TableCell>
                <TableCell className="text-sm">{log.user_email || '—'}</TableCell>
                <TableCell>
                  <Badge variant={log.action === 'delete' ? 'destructive' : 'secondary'}>
                    {ACTION_LABELS[log.action] || log.action}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{RESOURCE_LABELS[log.resource_type] || log.resource_type}</TableCell>
                <TableCell className="text-sm font-medium">{log.resource_name || log.resource_id || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
