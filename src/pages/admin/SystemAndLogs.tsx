import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  HardDrive,
  Loader2,
  RefreshCw,
  Server,
  Trash2,
  Wifi,
  XCircle,
  FileText,
  Shield,
  Download,
  Search,
  Eye,
  Play,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useToast } from '@/hooks/use-toast';
import { ErrorLogsPanel } from '@/components/admin/ErrorLogsPanel';
import { HelpHint } from '@/components/HelpHint';
import { APP_VERSION } from '@/lib/appVersion';
import { exportToCSV } from '@/lib/csv';

const SCOPES = ['all', 'bling', 'appmax', 'pricing', 'admin', 'auth', 'general', 'export', 'sync'] as const;
const LEVELS = ['all', 'info', 'warning', 'error', 'critical'] as const;
const SLA_MINUTES = { bling_webhook: 60, bling_cron: 15, errors_threshold: 10 };
const ACTION_LABELS: Record<string, string> = {
  create: 'Criação', update: 'Atualização', delete: 'Exclusão', export: 'Exportação', login: 'Login',
};
const RESOURCE_LABELS: Record<string, string> = {
  product: 'Produto', order: 'Pedido', customer: 'Cliente', coupon: 'Cupom', category: 'Categoria', admin_member: 'Membro',
};
type JobType = 'daily_logs' | 'daily_storage' | 'weekly_optimize';

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${['B', 'KB', 'MB', 'GB'][i]}`;
}

const TAB_KEYS = ['health', 'errors', 'applogs', 'audit', 'maintenance'] as const;

export default function SystemAndLogsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = tabParam && TAB_KEYS.includes(tabParam as any) ? tabParam : 'health';
  const queryClient = useQueryClient();
  const { toast: toastHook } = useToast();
  const [purging, setPurging] = useState(false);
  const [runningJob, setRunningJob] = useState<string | null>(null);

  // Queries de saúde (webhook, cron, erros 24h, produtos)
  const { data: lastWebhook } = useQuery({
    queryKey: ['health-last-webhook'],
    queryFn: async () => {
      const { data } = await supabase.from('bling_webhook_logs').select('received_at, result').order('received_at', { ascending: false }).limit(1).maybeSingle();
      return data as any;
    },
    refetchInterval: 30000,
  });
  const { data: lastCron } = useQuery({
    queryKey: ['health-last-cron'],
    queryFn: async () => {
      const { data } = await supabase.from('bling_sync_runs').select('started_at, finished_at, errors_count, trigger_type').order('started_at', { ascending: false }).limit(1).maybeSingle();
      return data as any;
    },
    refetchInterval: 30000,
  });
  const { data: errorCount24h } = useQuery({
    queryKey: ['health-errors-24h'],
    queryFn: async () => {
      const since = new Date(Date.now() - 86400000).toISOString();
      const { count } = await supabase.from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', since);
      return count || 0;
    },
    refetchInterval: 60000,
  });
  const { data: appLogErrors } = useQuery({
    queryKey: ['health-app-log-errors'],
    queryFn: async () => {
      const since = new Date(Date.now() - 86400000).toISOString();
      const { count } = await supabase.from('app_logs').select('id', { count: 'exact', head: true }).in('level', ['error', 'critical']).gte('created_at', since);
      return count || 0;
    },
    refetchInterval: 60000,
  });
  const { data: productStats } = useQuery({
    queryKey: ['health-product-stats'],
    queryFn: async () => {
      const [a, t, p] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('bling_sync_status', 'pending'),
      ]);
      return { active: a.count || 0, total: t.count || 0, pending: p.count || 0 };
    },
    refetchInterval: 60000,
  });

  const totalErrors = (errorCount24h || 0) + (appLogErrors || 0);
  const webhookAge = lastWebhook?.received_at ? Math.floor((Date.now() - new Date(lastWebhook.received_at).getTime()) / 60000) : null;
  const cronAge = lastCron?.started_at ? Math.floor((Date.now() - new Date(lastCron.started_at).getTime()) / 60000) : null;
  const statusConfig = {
    healthy: { label: 'Saudável', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle className="h-6 w-6 text-green-600" /> },
    warning: { label: 'Atenção', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: <AlertTriangle className="h-6 w-6 text-yellow-600" /> },
    critical: { label: 'Crítico', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <XCircle className="h-6 w-6 text-red-600" /> },
    unknown: { label: 'Desconhecido', color: 'bg-muted text-muted-foreground', icon: <Server className="h-6 w-6 text-muted-foreground" /> },
  };
  const checks = [
    { name: 'Bling Webhook', status: webhookAge === null ? 'unknown' : webhookAge <= SLA_MINUTES.bling_webhook ? 'healthy' : 'warning', detail: lastWebhook?.received_at ? `Último: ${formatDistanceToNow(new Date(lastWebhook.received_at), { addSuffix: true, locale: ptBR })}` : 'Sem dados', icon: <Wifi className="h-5 w-5" /> },
    { name: 'Sync Automático', status: cronAge === null ? 'unknown' : cronAge <= SLA_MINUTES.bling_cron ? 'healthy' : cronAge <= 30 ? 'warning' : 'critical', detail: lastCron ? `${lastCron.trigger_type} — ${formatDistanceToNow(new Date(lastCron.started_at), { addSuffix: true, locale: ptBR })}${lastCron.errors_count > 0 ? ` (${lastCron.errors_count} erros)` : ''}` : 'Nunca executou', icon: <Clock className="h-5 w-5" /> },
    { name: 'Erros (24h)', status: totalErrors === 0 ? 'healthy' : totalErrors <= SLA_MINUTES.errors_threshold ? 'warning' : 'critical', detail: `${totalErrors} erros (${errorCount24h || 0} client + ${appLogErrors || 0} backend)`, icon: <AlertTriangle className="h-5 w-5" /> },
    { name: 'Produtos', status: (productStats?.pending || 0) === 0 ? 'healthy' : (productStats?.pending || 0) <= 5 ? 'warning' : 'critical', detail: `${productStats?.active || 0} ativos / ${productStats?.total || 0} total — ${productStats?.pending || 0} pendentes`, icon: <Database className="h-5 w-5" /> },
  ];
  const overallStatus = checks.some(c => c.status === 'critical') ? 'critical' : checks.some(c => c.status === 'warning') ? 'warning' : checks.every(c => c.status === 'healthy') ? 'healthy' : 'unknown';
  const overall = statusConfig[overallStatus as keyof typeof statusConfig];

  // —— Limpeza: runs + stats + mutation ——
  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ['cleanup-runs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cleanup_runs').select('*').order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data as any[];
    },
  });
  const { data: stats } = useQuery({
    queryKey: ['cleanup-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cleanup_runs').select('records_deleted, records_consolidated, bytes_freed').eq('status', 'completed').gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString());
      if (error) throw error;
      const list = data || [];
      return { totalDeleted: list.reduce((s: number, r: any) => s + (r.records_deleted || 0), 0), totalBytes: list.reduce((s: number, r: any) => s + (r.bytes_freed || 0), 0), totalConsolidated: list.reduce((s: number, r: any) => s + (r.records_consolidated || 0), 0), runsCount: list.length };
    },
  });
  const runCleanup = useMutation({
    mutationFn: async ({ jobType, mode }: { jobType: JobType; mode: 'dry_run' | 'execute' }) => {
      setRunningJob(`${jobType}-${mode}`);
      const { data, error } = await supabase.functions.invoke('cleanup-logs', { body: { job_type: jobType, mode } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cleanup-runs'] });
      queryClient.invalidateQueries({ queryKey: ['cleanup-stats'] });
      toast.success(variables.mode === 'dry_run' ? 'Simulação concluída' : 'Limpeza concluída', { description: `${data?.records_deleted ?? 0} registros ${variables.mode === 'dry_run' ? 'seriam' : 'foram'} removidos` });
      setRunningJob(null);
    },
    onError: (err: any) => {
      toast.error('Erro na limpeza', { description: err.message });
      setRunningJob(null);
    },
  });

  const jobConfigs: { type: JobType; label: string; description: string; icon: React.ReactNode }[] = [
    { type: 'daily_logs', label: 'Logs & Registros', description: 'Apaga logs antigos e consolida em estatísticas diárias.', icon: <Database className="h-5 w-5" /> },
    { type: 'daily_storage', label: 'Storage Órfãos', description: 'Remove arquivos do storage não referenciados.', icon: <HardDrive className="h-5 w-5" /> },
    { type: 'weekly_optimize', label: 'Otimização Semanal', description: 'Limpa cleanup_runs antigos e deduplica eventos.', icon: <Trash2 className="h-5 w-5" /> },
  ];

  const handleClearCache = async () => {
    setPurging(true);
    try {
      const newVersion = Date.now().toString();
      const { data: s } = await supabase.from('store_settings').select('id').limit(1).maybeSingle();
      if (s?.id) await supabase.from('store_settings').update({ app_version: newVersion } as any).eq('id', s.id);
      else await supabase.from('store_settings').insert({ app_version: newVersion } as any);
      toastHook({ title: 'Cache limpo!', description: 'Visitantes carregarão a versão mais recente.' });
    } catch (err: any) {
      toastHook({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Sistema & Logs
        <HelpHint helpKey="admin.logs" />
        </h1>
        <p className="text-sm text-muted-foreground">Saúde do sistema, logs, auditoria e manutenção em um só lugar</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })} className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="health" className="gap-1"><Activity className="h-3.5 w-3.5" /> Saúde</TabsTrigger>
          <TabsTrigger value="errors" className="gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Erros</TabsTrigger>
          <TabsTrigger value="applogs" className="gap-1"><FileText className="h-3.5 w-3.5" /> Logs do sistema</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1"><Shield className="h-3.5 w-3.5" /> Auditoria</TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-1"><RefreshCw className="h-3.5 w-3.5" /> Limpeza e cache</TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                {overall.icon}
                <div>
                  <p className="text-lg font-bold">Sistema {overall.label}</p>
                  <p className="text-sm text-muted-foreground">{checks.filter(c => c.status === 'healthy').length}/{checks.length} serviços operacionais</p>
                </div>
                <Badge className={`ml-auto ${overall.color} text-sm px-3 py-1`}>{overall.label}</Badge>
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            {checks.map((check) => {
              const cfg = statusConfig[check.status as keyof typeof statusConfig];
              return (
                <Card key={check.name}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">{check.icon}{check.name}</CardTitle>
                      <Badge className={`${cfg.color} text-[10px]`}>{cfg.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">{check.detail}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="errors" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <ErrorLogsPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applogs" className="mt-4">
          <AppLogsSection />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditLogSection />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-4 space-y-6">
          {/* Cache */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5" /> Cache do site</CardTitle>
              <CardDescription>Forçar todos os visitantes a carregar a versão mais recente. Versão atual: <code className="bg-muted px-1 rounded text-xs">{APP_VERSION}</code></CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={handleClearCache} disabled={purging}>
                <RefreshCw className={`h-4 w-4 mr-2 ${purging ? 'animate-spin' : ''}`} />
                {purging ? 'Limpando...' : 'Forçar atualização para todos'}
              </Button>
            </CardContent>
          </Card>

          {/* Limpeza */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Database className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{(stats?.totalDeleted ?? 0).toLocaleString()}</p><p className="text-xs text-muted-foreground">Removidos (30d)</p></div></div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><HardDrive className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{formatBytes(stats?.totalBytes || 0)}</p><p className="text-xs text-muted-foreground">Storage (30d)</p></div></div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{(stats?.totalConsolidated ?? 0).toLocaleString()}</p><p className="text-xs text-muted-foreground">Consolidados (30d)</p></div></div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Clock className="h-8 w-8 text-muted-foreground" /><div><p className="text-2xl font-bold">{stats?.runsCount ?? 0}</p><p className="text-xs text-muted-foreground">Execuções (30d)</p></div></div></CardContent></Card>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {jobConfigs.map((job) => (
              <Card key={job.type}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">{job.icon}{job.label}</CardTitle>
                  <CardDescription className="text-xs">{job.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => runCleanup.mutate({ jobType: job.type, mode: 'dry_run' })} disabled={!!runningJob}>
                    {runningJob === `${job.type}-dry_run` ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />} Simular
                  </Button>
                  <Button size="sm" onClick={() => runCleanup.mutate({ jobType: job.type, mode: 'execute' })} disabled={!!runningJob}>
                    {runningJob === `${job.type}-execute` ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />} Executar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Histórico de execuções</CardTitle></CardHeader>
            <CardContent>
              {runsLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : !runs?.length ? <p className="text-sm text-muted-foreground text-center py-8">Nenhuma execução.</p> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Modo</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Removidos</TableHead><TableHead className="text-right">Duração</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((run: any) => (
                        <TableRow key={run.id}>
                          <TableCell className="text-xs whitespace-nowrap">{run.created_at ? format(new Date(run.created_at), 'dd/MM HH:mm', { locale: ptBR }) : '—'}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{run.job_type === 'daily_logs' ? 'Logs' : run.job_type === 'daily_storage' ? 'Storage' : 'Otimização'}</Badge></TableCell>
                          <TableCell className="text-xs">{run.mode === 'dry_run' ? 'Simulação' : 'Executado'}</TableCell>
                          <TableCell>{run.status === 'completed' ? <Badge className="bg-primary">Concluído</Badge> : run.status === 'running' ? <Badge variant="outline">Executando</Badge> : <Badge variant="secondary">{run.status}</Badge>}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{(run.records_deleted || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AppLogsSection() {
  const queryClient = useQueryClient();
  const [scopeFilter, setScopeFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['app-logs', scopeFilter, levelFilter, searchQuery, page],
    queryFn: async () => {
      let q = supabase.from('app_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (scopeFilter !== 'all') q = q.eq('scope', scopeFilter);
      if (levelFilter !== 'all') q = q.eq('level', levelFilter);
      if (searchQuery) q = q.ilike('message', `%${searchQuery}%`);
      const { data: d, error, count } = await q;
      if (error) throw error;
      return { logs: d as any[], total: count || 0 };
    },
    refetchInterval: 15000,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await supabase.from('app_logs').delete().lt('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['app-logs'] }),
  });

  const exportLogs = () => {
    if (!data?.logs?.length) return;
    const csv = ['Data;Nível;Escopo;Mensagem;Correlation ID', ...data.logs.map((l: any) => `${format(new Date(l.created_at), 'dd/MM/yyyy HH:mm:ss')};${l.level};${l.scope};"${(l.message || '').replace(/"/g, '""')}";${l.correlation_id || ''}`)].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `logs-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const levelBadge = (level: string) => {
    const map: Record<string, string> = { info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', error: 'bg-destructive/10 text-destructive', critical: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300 font-bold' };
    return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${map[level] || 'bg-muted text-muted-foreground'}`}>{level}</span>;
  };
  const totalPages = Math.ceil((data?.total || 0) / PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Logs do sistema</CardTitle>
        <CardDescription>Registros de operações, erros e integrações (app_logs)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(0); }} placeholder="Buscar..." className="pl-9 h-9" />
          </div>
          <Select value={scopeFilter} onValueChange={v => { setScopeFilter(v); setPage(0); }}><SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger><SelectContent>{SCOPES.map(s => <SelectItem key={s} value={s}>{s === 'all' ? 'Todos' : s}</SelectItem>)}</SelectContent></Select>
          <Select value={levelFilter} onValueChange={v => { setLevelFilter(v); setPage(0); }}><SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger><SelectContent>{LEVELS.map(l => <SelectItem key={l} value={l}>{l === 'all' ? 'Todos' : l}</SelectItem>)}</SelectContent></Select>
          <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['app-logs'] })}><RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar</Button>
          <Button size="sm" variant="outline" onClick={exportLogs} disabled={!data?.logs?.length}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
          <Button size="sm" variant="destructive" onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending}><Trash2 className="h-3.5 w-3.5 mr-1" /> Limpar +7d</Button>
        </div>
        <ScrollArea className="max-h-[500px]">
          <Table>
            <TableHeader><TableRow><TableHead className="w-[140px]">Data</TableHead><TableHead className="w-[70px]">Nível</TableHead><TableHead className="w-[80px]">Escopo</TableHead><TableHead>Mensagem</TableHead><TableHead className="w-[100px]">Correlation</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow> : !(data?.logs?.length) ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">Nenhum log</TableCell></TableRow> : data.logs.map((log: any) => (
              <TableRow key={log.id} className="text-[11px]">
                <TableCell className="py-1.5 font-mono">{format(new Date(log.created_at), 'dd/MM HH:mm:ss', { locale: ptBR })}</TableCell>
                <TableCell className="py-1.5">{levelBadge(log.level)}</TableCell>
                <TableCell className="py-1.5"><Badge variant="secondary" className="text-[10px]">{log.scope}</Badge></TableCell>
                <TableCell className="py-1.5 max-w-[400px] truncate" title={log.message}>{log.message}</TableCell>
                <TableCell className="py-1.5 font-mono text-muted-foreground text-[10px] truncate max-w-[100px]">{log.correlation_id || '—'}</TableCell>
              </TableRow>
            ))}
            </TableBody>
          </Table>
        </ScrollArea>
        {totalPages > 1 && <div className="flex items-center justify-between p-3 border-t text-xs"><span className="text-muted-foreground">{data?.total || 0} registros</span><div className="flex gap-1"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7 text-xs">Anterior</Button><span className="px-2 py-1">Página {page + 1}/{totalPages}</span><Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-7 text-xs">Próxima</Button></div></div>}
      </CardContent>
    </Card>
  );
}

function AuditLogSection() {
  const [filterAction, setFilterAction] = useState('all');
  const [filterResource, setFilterResource] = useState('all');
  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-log', filterAction, filterResource],
    queryFn: async () => {
      let q = supabase.from('admin_audit_log').select('*').order('created_at', { ascending: false }).limit(100);
      if (filterAction !== 'all') q = q.eq('action', filterAction);
      if (filterResource !== 'all') q = q.eq('resource_type', filterResource);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" /> Auditoria</CardTitle>
        <CardDescription>Ações administrativas (criação, edição, exclusão)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3 flex-wrap">
          <Select value={filterAction} onValueChange={setFilterAction}><SelectTrigger className="w-[160px]"><SelectValue placeholder="Ação" /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem><SelectItem value="create">Criação</SelectItem><SelectItem value="update">Atualização</SelectItem><SelectItem value="delete">Exclusão</SelectItem><SelectItem value="export">Exportação</SelectItem></SelectContent></Select>
          <Select value={filterResource} onValueChange={setFilterResource}><SelectTrigger className="w-[160px]"><SelectValue placeholder="Recurso" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="product">Produto</SelectItem><SelectItem value="order">Pedido</SelectItem><SelectItem value="coupon">Cupom</SelectItem><SelectItem value="category">Categoria</SelectItem></SelectContent></Select>
          <Button variant="outline" size="sm" onClick={() => logs && exportToCSV(logs.map(l => ({ data: new Date(l.created_at).toLocaleString('pt-BR'), usuario: l.user_email || '—', acao: ACTION_LABELS[l.action] || l.action, recurso: RESOURCE_LABELS[l.resource_type] || l.resource_type, nome: l.resource_name || '—' })), 'auditoria')} disabled={!logs?.length}><Download className="h-4 w-4 mr-2" /> Exportar CSV</Button>
        </div>
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Usuário</TableHead><TableHead>Ação</TableHead><TableHead>Recurso</TableHead><TableHead>Nome</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell></TableRow> : !logs?.length ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum registro</TableCell></TableRow> : logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}</TableCell>
                  <TableCell className="text-sm">{log.user_email || '—'}</TableCell>
                  <TableCell><Badge variant={log.action === 'delete' ? 'destructive' : 'secondary'}>{ACTION_LABELS[log.action] || log.action}</Badge></TableCell>
                  <TableCell className="text-sm">{RESOURCE_LABELS[log.resource_type] || log.resource_type}</TableCell>
                  <TableCell className="text-sm font-medium">{log.resource_name || log.resource_id || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
