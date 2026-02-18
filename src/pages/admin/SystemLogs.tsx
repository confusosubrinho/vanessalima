import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, Download, Filter, Loader2, RefreshCw, Search, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { HelpHint } from '@/components/HelpHint';

const SCOPES = ['all', 'bling', 'appmax', 'pricing', 'admin', 'auth', 'general', 'export', 'sync'] as const;
const LEVELS = ['all', 'info', 'warning', 'error', 'critical'] as const;

export default function SystemLogs() {
  const queryClient = useQueryClient();
  const [scopeFilter, setScopeFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['app-logs', scopeFilter, levelFilter, searchQuery, page],
    queryFn: async () => {
      let query = supabase
        .from('app_logs' as any)
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (scopeFilter !== 'all') query = query.eq('scope', scopeFilter);
      if (levelFilter !== 'all') query = query.eq('level', levelFilter);
      if (searchQuery) query = query.ilike('message', `%${searchQuery}%`);

      const { data, error, count } = await query;
      if (error) throw error;
      return { logs: data as any[], total: count || 0 };
    },
    refetchInterval: 15000,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('app_logs' as any).delete().lt('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['app-logs'] }),
  });

  const exportLogs = () => {
    if (!data?.logs) return;
    const csv = [
      'Data;Nível;Escopo;Mensagem;Correlation ID',
      ...data.logs.map((l: any) =>
        `${format(new Date(l.created_at), 'dd/MM/yyyy HH:mm:ss')};${l.level};${l.scope};"${(l.message || '').replace(/"/g, '""')}";${l.correlation_id || ''}`
      ),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const levelBadge = (level: string) => {
    const map: Record<string, string> = {
      info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      error: 'bg-destructive/10 text-destructive',
      critical: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300 font-bold',
    };
    return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${map[level] || 'bg-muted text-muted-foreground'}`}>{level}</span>;
  };

  const totalPages = Math.ceil((data?.total || 0) / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Logs do Sistema
          <HelpHint helpKey="admin.logs" />
        </h1>
        <p className="text-sm text-muted-foreground">Registros de operações, erros e integrações</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
                placeholder="Buscar nos logs..."
                className="pl-9 h-9"
              />
            </div>
            <Select value={scopeFilter} onValueChange={v => { setScopeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Escopo" /></SelectTrigger>
              <SelectContent>
                {SCOPES.map(s => <SelectItem key={s} value={s}>{s === 'all' ? 'Todos' : s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={levelFilter} onValueChange={v => { setLevelFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Nível" /></SelectTrigger>
              <SelectContent>
                {LEVELS.map(l => <SelectItem key={l} value={l}>{l === 'all' ? 'Todos' : l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['app-logs'] })}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button size="sm" variant="outline" onClick={exportLogs} disabled={!data?.logs?.length}>
              <Download className="h-3.5 w-3.5 mr-1" />
              CSV
            </Button>
            <Button size="sm" variant="destructive" onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Limpar +7d
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-[140px]">Data</TableHead>
                  <TableHead className="text-xs w-[70px]">Nível</TableHead>
                  <TableHead className="text-xs w-[80px]">Escopo</TableHead>
                  <TableHead className="text-xs">Mensagem</TableHead>
                  <TableHead className="text-xs w-[100px]">Correlation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : (data?.logs || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">Nenhum log encontrado</TableCell>
                  </TableRow>
                ) : (
                  (data?.logs || []).map((log: any) => (
                    <TableRow key={log.id} className="text-[11px]">
                      <TableCell className="py-1.5 font-mono">{format(new Date(log.created_at), 'dd/MM HH:mm:ss', { locale: ptBR })}</TableCell>
                      <TableCell className="py-1.5">{levelBadge(log.level)}</TableCell>
                      <TableCell className="py-1.5">
                        <Badge variant="secondary" className="text-[10px]">{log.scope}</Badge>
                      </TableCell>
                      <TableCell className="py-1.5 max-w-[400px] truncate" title={log.message}>{log.message}</TableCell>
                      <TableCell className="py-1.5 font-mono text-muted-foreground text-[10px] truncate max-w-[100px]">{log.correlation_id || '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t text-xs">
              <span className="text-muted-foreground">{data?.total || 0} registros</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7 text-xs">Anterior</Button>
                <span className="px-2 py-1 text-muted-foreground">Página {page + 1}/{totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-7 text-xs">Próxima</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
