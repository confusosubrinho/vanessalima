import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, CheckCircle, Trash2, RefreshCw, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface ErrorLog {
  id: string;
  error_type: string;
  error_message: string;
  error_stack: string | null;
  error_context: Record<string, any>;
  page_url: string;
  user_id: string | null;
  user_agent: string;
  severity: string;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

export function ErrorLogsPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['admin-error-logs', severityFilter, typeFilter],
    queryFn: async () => {
      let query = supabase
        .from('error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (severityFilter !== 'all') {
        query = query.eq('severity', severityFilter);
      }
      if (typeFilter !== 'all') {
        query = query.eq('error_type', typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as unknown as ErrorLog[]) || [];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from('error_logs').update({
        is_resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: session?.user?.id,
      }).eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-error-logs'] });
      toast({ title: 'Erro marcado como resolvido' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('error_logs').delete().eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-error-logs'] });
      toast({ title: 'Log removido' });
    },
  });

  const clearResolvedMutation = useMutation({
    mutationFn: async () => {
      await supabase.from('error_logs').delete().eq('is_resolved', true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-error-logs'] });
      toast({ title: 'Logs resolvidos limpos' });
    },
  });

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Crítico</Badge>;
      case 'error': return <Badge className="bg-orange-500">Erro</Badge>;
      case 'warning': return <Badge className="bg-yellow-500 text-black">Aviso</Badge>;
      default: return <Badge variant="secondary">Info</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      api_error: 'API',
      client_error: 'Cliente',
      auth_error: 'Auth',
      network_error: 'Rede',
      render_error: 'Render',
    };
    return <Badge variant="outline">{labels[type] || type}</Badge>;
  };

  const unresolvedCount = logs?.filter(l => !l.is_resolved).length || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Logs de Erros
            {unresolvedCount > 0 && (
              <Badge variant="destructive">{unresolvedCount} não resolvido(s)</Badge>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            Monitore erros da aplicação em tempo real
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => clearResolvedMutation.mutate()}>
            <Trash2 className="h-4 w-4 mr-1" />
            Limpar Resolvidos
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Severidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="critical">Crítico</SelectItem>
              <SelectItem value="error">Erro</SelectItem>
              <SelectItem value="warning">Aviso</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="api_error">API</SelectItem>
            <SelectItem value="client_error">Cliente</SelectItem>
            <SelectItem value="auth_error">Auth</SelectItem>
            <SelectItem value="network_error">Rede</SelectItem>
            <SelectItem value="render_error">Render</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Logs list */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando logs...</div>
      ) : !logs?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
          <p className="font-medium">Nenhum erro encontrado!</p>
          <p className="text-sm">Tudo está funcionando corretamente.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`border rounded-lg p-3 space-y-2 ${
                log.is_resolved ? 'opacity-50 bg-muted/30' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {getSeverityBadge(log.severity)}
                  {getTypeBadge(log.error_type)}
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {!log.is_resolved && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-green-600"
                      onClick={() => resolveMutation.mutate(log.id)}
                      title="Marcar como resolvido"
                    >
                      <CheckCircle className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => deleteMutation.mutate(log.id)}
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <p className="text-sm font-medium break-all">{log.error_message}</p>

              {log.page_url && (
                <p className="text-xs text-muted-foreground truncate">
                  Página: {log.page_url}
                </p>
              )}

              {log.error_context && Object.keys(log.error_context).length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Detalhes técnicos
                  </summary>
                  <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                    {JSON.stringify(log.error_context, null, 2)}
                  </pre>
                </details>
              )}

              {log.error_stack && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Stack trace
                  </summary>
                  <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto whitespace-pre-wrap">
                    {log.error_stack}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
