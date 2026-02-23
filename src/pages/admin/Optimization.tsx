import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2, Play, Eye, Loader2, HardDrive, Database, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { HelpHint } from '@/components/HelpHint';

type JobType = 'daily_logs' | 'daily_storage' | 'weekly_optimize';

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function OptimizationPage() {
  const queryClient = useQueryClient();
  const [runningJob, setRunningJob] = useState<string | null>(null);

  // Fetch cleanup history
  const { data: runs, isLoading } = useQuery({
    queryKey: ['cleanup-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cleanup_runs' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch aggregate stats
  const { data: stats } = useQuery({
    queryKey: ['cleanup-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cleanup_runs' as any)
        .select('records_deleted, records_consolidated, bytes_freed, duration_ms')
        .eq('status', 'completed')
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString());
      if (error) throw error;
      const totalDeleted = (data || []).reduce((s: number, r: any) => s + (r.records_deleted || 0), 0);
      const totalBytes = (data || []).reduce((s: number, r: any) => s + (r.bytes_freed || 0), 0);
      const totalConsolidated = (data || []).reduce((s: number, r: any) => s + (r.records_consolidated || 0), 0);
      return { totalDeleted, totalBytes, totalConsolidated, runsCount: data?.length || 0 };
    },
  });

  const runCleanup = useMutation({
    mutationFn: async ({ jobType, mode }: { jobType: JobType; mode: 'dry_run' | 'execute' }) => {
      setRunningJob(`${jobType}-${mode}`);
      const { data, error } = await supabase.functions.invoke('cleanup-logs', {
        body: { job_type: jobType, mode },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cleanup-runs'] });
      queryClient.invalidateQueries({ queryKey: ['cleanup-stats'] });
      const label = variables.mode === 'dry_run' ? 'Simulação' : 'Limpeza';
      toast.success(`${label} concluída`, {
        description: `${data.records_deleted} registros ${variables.mode === 'dry_run' ? 'seriam' : 'foram'} removidos em ${data.duration_ms}ms`,
      });
      setRunningJob(null);
    },
    onError: (err: any) => {
      toast.error('Erro na limpeza', { description: err.message });
      setRunningJob(null);
    },
  });

  const jobConfigs: { type: JobType; label: string; description: string; icon: React.ReactNode }[] = [
    {
      type: 'daily_logs',
      label: 'Logs & Registros',
      description: 'Apaga logs antigos (app, appmax, bling, login, erros) e consolida em estatísticas diárias.',
      icon: <Database className="h-5 w-5" />,
    },
    {
      type: 'daily_storage',
      label: 'Storage Órfãos',
      description: 'Remove arquivos do storage que não são mais referenciados por nenhum produto, banner ou categoria.',
      icon: <HardDrive className="h-5 w-5" />,
    },
    {
      type: 'weekly_optimize',
      label: 'Otimização Semanal',
      description: 'Limpa cleanup_runs antigos, estatísticas velhas e deduplica eventos de webhook.',
      icon: <Trash2 className="h-5 w-5" />,
    },
  ];

  const statusBadge = (status: string) => {
    if (status === 'completed') return <Badge variant="default" className="bg-primary text-primary-foreground">Concluído</Badge>;
    if (status === 'completed_with_errors') return <Badge variant="secondary">Com erros</Badge>;
    if (status === 'running') return <Badge variant="outline" className="border-primary text-primary">Executando</Badge>;
    return <Badge variant="destructive">{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Otimização & Limpeza
            <HelpHint helpKey="optimization" />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie retenção de dados, limpeza de storage e otimização de custos.
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Database className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stats?.totalDeleted?.toLocaleString() || 0}</p>
                <p className="text-xs text-muted-foreground">Registros removidos (30d)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <HardDrive className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{formatBytes(stats?.totalBytes || 0)}</p>
                <p className="text-xs text-muted-foreground">Storage liberado (30d)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stats?.totalConsolidated?.toLocaleString() || 0}</p>
                <p className="text-xs text-muted-foreground">Logs consolidados (30d)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats?.runsCount || 0}</p>
                <p className="text-xs text-muted-foreground">Execuções (30d)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Job Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {jobConfigs.map((job) => (
          <Card key={job.type}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {job.icon}
                {job.label}
              </CardTitle>
              <CardDescription className="text-xs">{job.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => runCleanup.mutate({ jobType: job.type, mode: 'dry_run' })}
                disabled={!!runningJob}
              >
                {runningJob === `${job.type}-dry_run` ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4 mr-1" />
                )}
                Simular
              </Button>
              <Button
                size="sm"
                onClick={() => runCleanup.mutate({ jobType: job.type, mode: 'execute' })}
                disabled={!!runningJob}
              >
                {runningJob === `${job.type}-execute` ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-1" />
                )}
                Executar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Execuções</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !runs?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma execução registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Modo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Removidos</TableHead>
                    <TableHead className="text-right">Consolidados</TableHead>
                    <TableHead className="text-right">Storage</TableHead>
                    <TableHead className="text-right">Duração</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run: any) => (
                    <TableRow key={run.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {run.created_at
                          ? format(new Date(run.created_at), "dd/MM HH:mm", { locale: ptBR })
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {run.job_type === 'daily_logs' ? 'Logs' :
                           run.job_type === 'daily_storage' ? 'Storage' :
                           run.job_type === 'weekly_optimize' ? 'Otimização' : run.job_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {run.mode === 'dry_run' ? '🔍 Simulação' : '▶️ Executado'}
                      </TableCell>
                      <TableCell>{statusBadge(run.status)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {(run.records_deleted || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {(run.records_consolidated || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatBytes(run.bytes_freed || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
