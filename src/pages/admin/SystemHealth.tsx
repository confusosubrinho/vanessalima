import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertTriangle, CheckCircle, Clock, Database, Loader2, Server, Wifi, XCircle } from 'lucide-react';
import { formatDistanceToNow, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { HelpHint } from '@/components/HelpHint';

interface HealthCheck {
  name: string;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  lastActivity?: string;
  detail?: string;
  icon: React.ReactNode;
}

const SLA_MINUTES = {
  bling_webhook: 60, // expect at least 1 webhook per hour
  bling_cron: 15,    // cron should run every ~10 min
  errors_threshold: 10, // max errors in 24h
};

export default function SystemHealth() {
  // Bling webhook logs
  const { data: lastWebhook } = useQuery({
    queryKey: ['health-last-webhook'],
    queryFn: async () => {
      const { data } = await supabase
        .from('bling_webhook_logs' as any)
        .select('received_at, result')
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
    refetchInterval: 30000,
  });

  // Bling sync runs
  const { data: lastCron } = useQuery({
    queryKey: ['health-last-cron'],
    queryFn: async () => {
      const { data } = await supabase
        .from('bling_sync_runs' as any)
        .select('started_at, finished_at, errors_count, trigger_type')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
    refetchInterval: 30000,
  });

  // Error logs 24h
  const { data: errorCount24h } = useQuery({
    queryKey: ['health-errors-24h'],
    queryFn: async () => {
      const since = new Date(Date.now() - 86400000).toISOString();
      const { count } = await supabase
        .from('error_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      return count || 0;
    },
    refetchInterval: 60000,
  });

  // App logs errors 24h
  const { data: appLogErrors } = useQuery({
    queryKey: ['health-app-log-errors'],
    queryFn: async () => {
      const since = new Date(Date.now() - 86400000).toISOString();
      const { count } = await supabase
        .from('app_logs' as any)
        .select('id', { count: 'exact', head: true })
        .in('level', ['error', 'critical'])
        .gte('created_at', since);
      return count || 0;
    },
    refetchInterval: 60000,
  });

  // Product stats
  const { data: productStats } = useQuery({
    queryKey: ['health-product-stats'],
    queryFn: async () => {
      const [activeRes, totalRes, pendingRes] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('bling_sync_status', 'pending'),
      ]);
      return {
        active: activeRes.count || 0,
        total: totalRes.count || 0,
        pending: pendingRes.count || 0,
      };
    },
    refetchInterval: 60000,
  });

  // Build health checks
  const checks: HealthCheck[] = [];

  // Bling Webhook
  const webhookAge = lastWebhook?.received_at ? differenceInMinutes(new Date(), new Date(lastWebhook.received_at)) : null;
  checks.push({
    name: 'Bling Webhook',
    status: webhookAge === null ? 'unknown' : webhookAge <= SLA_MINUTES.bling_webhook ? 'healthy' : 'warning',
    lastActivity: lastWebhook?.received_at,
    detail: webhookAge !== null ? `Último: ${formatDistanceToNow(new Date(lastWebhook.received_at), { addSuffix: true, locale: ptBR })}` : 'Sem dados',
    icon: <Wifi className="h-5 w-5" />,
  });

  // Bling Cron
  const cronAge = lastCron?.started_at ? differenceInMinutes(new Date(), new Date(lastCron.started_at)) : null;
  checks.push({
    name: 'Sync Automático (Cron)',
    status: cronAge === null ? 'unknown' : cronAge <= SLA_MINUTES.bling_cron ? 'healthy' : cronAge <= 30 ? 'warning' : 'critical',
    lastActivity: lastCron?.started_at,
    detail: lastCron ? `${lastCron.trigger_type} — ${cronAge !== null ? formatDistanceToNow(new Date(lastCron.started_at), { addSuffix: true, locale: ptBR }) : ''}${lastCron.errors_count > 0 ? ` (${lastCron.errors_count} erros)` : ''}` : 'Nunca executou',
    icon: <Clock className="h-5 w-5" />,
  });

  // Error rate
  const totalErrors = (errorCount24h || 0) + (appLogErrors || 0);
  checks.push({
    name: 'Erros (24h)',
    status: totalErrors === 0 ? 'healthy' : totalErrors <= SLA_MINUTES.errors_threshold ? 'warning' : 'critical',
    detail: `${totalErrors} erros (${errorCount24h || 0} client + ${appLogErrors || 0} backend)`,
    icon: <AlertTriangle className="h-5 w-5" />,
  });

  // Products sync status
  checks.push({
    name: 'Produtos',
    status: (productStats?.pending || 0) === 0 ? 'healthy' : (productStats?.pending || 0) <= 5 ? 'warning' : 'critical',
    detail: `${productStats?.active || 0} ativos / ${productStats?.total || 0} total — ${productStats?.pending || 0} pendentes de sync`,
    icon: <Database className="h-5 w-5" />,
  });

  const overallStatus = checks.some(c => c.status === 'critical') ? 'critical'
    : checks.some(c => c.status === 'warning') ? 'warning'
    : checks.every(c => c.status === 'healthy') ? 'healthy' : 'unknown';

  const statusConfig = {
    healthy: { label: 'Saudável', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle className="h-6 w-6 text-green-600" /> },
    warning: { label: 'Atenção', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: <AlertTriangle className="h-6 w-6 text-yellow-600" /> },
    critical: { label: 'Crítico', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <XCircle className="h-6 w-6 text-red-600" /> },
    unknown: { label: 'Desconhecido', color: 'bg-muted text-muted-foreground', icon: <Server className="h-6 w-6 text-muted-foreground" /> },
  };

  const overall = statusConfig[overallStatus];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Saúde do Sistema
          <HelpHint helpKey="admin.health" />
        </h1>
        <p className="text-sm text-muted-foreground">Visão geral do estado dos serviços e integrações</p>
      </div>

      {/* Overall status */}
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

      {/* Individual checks */}
      <div className="grid gap-4 md:grid-cols-2">
        {checks.map((check) => {
          const cfg = statusConfig[check.status];
          return (
            <Card key={check.name}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {check.icon}
                    {check.name}
                  </CardTitle>
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

      {/* SLA Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Critérios de SLA</CardTitle>
          <CardDescription className="text-xs">Limites configurados para alertas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <p className="font-medium">Webhook Bling</p>
              <p className="text-muted-foreground">Alerta se &gt; {SLA_MINUTES.bling_webhook} min sem webhook</p>
            </div>
            <div>
              <p className="font-medium">Cron Sync</p>
              <p className="text-muted-foreground">Alerta se &gt; {SLA_MINUTES.bling_cron} min sem execução</p>
            </div>
            <div>
              <p className="font-medium">Erros</p>
              <p className="text-muted-foreground">Alerta se &gt; {SLA_MINUTES.errors_threshold} erros em 24h</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
