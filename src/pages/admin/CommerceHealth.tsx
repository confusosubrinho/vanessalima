/**
 * P0-5 / P1-3: Commerce Health — checagens de integridade + listas anti-desastre + ações.
 * Admin-only. FASE 4: Tentar novamente (BUG-03), AbortController (BUG-04), 401/403 → onSessionExpired (BUG-08).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Loader2, XCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAdminSessionExpired } from '@/contexts/AdminAuthContext';
import { logAudit, generateCorrelationId } from '@/lib/auditLogger';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') + '/functions/v1';

export default function CommerceHealth() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const onSessionExpired = useAdminSessionExpired();
  const [actionLoading, setActionLoading] = useState<'release' | 'reconcile' | null>(null);
  const actionAbortRef = useRef<AbortController | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['commerce-health'],
    queryFn: async () => {
      const { data: d, error: e } = await supabase.rpc('commerce_health' as any);
      if (e) throw e;
      return d as unknown as {
        ok: boolean;
        error?: string;
        checks?: {
          index_payments_provider_transaction_id?: boolean;
          duplicate_payments_count?: number;
          negative_stock_count?: number;
          orders_paid_without_payment_count?: number;
          payments_succeeded_without_order_paid_count?: number;
          last_stripe_webhook_at?: string | null;
        };
      };
    },
    staleTime: 1000 * 60,
  });

  const { data: lists, isLoading: listsLoading, refetch: refetchLists } = useQuery({
    queryKey: ['commerce-health-lists'],
    queryFn: async () => {
      const { data: d, error: e } = await supabase.rpc('commerce_health_lists' as any);
      if (e) throw e;
      return d as unknown as {
        ok: boolean;
        paid_without_payment_order_ids?: string[];
        duplicate_payment_order_ids?: string[];
        expired_reservation_order_ids?: string[];
      };
    },
    staleTime: 1000 * 60,
  });

  useEffect(() => {
    return () => {
      if (actionAbortRef.current) actionAbortRef.current.abort();
    };
  }, []);

  const runAction = async (action: 'release_reservations' | 'reconcile_stale') => {
    if (actionAbortRef.current) actionAbortRef.current.abort();
    actionAbortRef.current = new AbortController();
    const signal = actionAbortRef.current.signal;
    const key = action === 'release_reservations' ? 'release' : 'reconcile';
    setActionLoading(key);
    const correlationId = generateCorrelationId();
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) {
      toast({ title: 'Erro', description: 'Sessão não encontrada.', variant: 'destructive' });
      setActionLoading(null);
      actionAbortRef.current = null;
      return;
    }
    try {
      const res = await fetch(`${FUNCTIONS_URL}/admin-commerce-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
        signal,
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        onSessionExpired(body?.error || 'Sessão expirada ou sem permissão.');
        return;
      }
      if (!res.ok) {
        toast({ title: 'Erro', description: body?.error || res.statusText, variant: 'destructive' });
        setActionLoading(null);
        actionAbortRef.current = null;
        return;
      }
      toast({ title: 'Sucesso', description: action === 'release_reservations' ? `Liberados: ${body.released ?? 0}` : `Reconciliados: ${body.reconciled ?? 0}` });
      await logAudit({ action: 'admin_action', resourceType: 'commerce_health', resourceName: action, newValues: { released: body.released, reconciled: body.reconciled }, correlationId });
      queryClient.invalidateQueries({ queryKey: ['commerce-health'] });
      queryClient.invalidateQueries({ queryKey: ['commerce-health-lists'] });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      toast({ title: 'Erro', description: (e as Error).message, variant: 'destructive' });
    } finally {
      if (!signal.aborted) setActionLoading(null);
      actionAbortRef.current = null;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Commerce Health</h1>
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (error || data?.error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Commerce Health</h1>
        <p className="text-destructive mb-4">{(error as Error)?.message || data?.error || 'Erro ao carregar'}</p>
        <Button variant="outline" onClick={() => { refetch(); refetchLists(); }}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  const c = data?.checks || {};
  const items = [
    { label: 'Índice UNIQUE payments(provider, transaction_id)', ok: !!c.index_payments_provider_transaction_id },
    { label: 'Sem duplicatas em payments', ok: (c.duplicate_payments_count ?? 0) === 0 },
    { label: 'Sem estoque negativo', ok: (c.negative_stock_count ?? 0) === 0 },
    { label: 'Pedidos paid com payment registrado', ok: (c.orders_paid_without_payment_count ?? 0) === 0 },
    { label: 'Payments succeeded com order paid', ok: (c.payments_succeeded_without_order_paid_count ?? 0) === 0 },
  ];

  const paidIds = (lists?.paid_without_payment_order_ids ?? []) as string[];
  const dupIds = (lists?.duplicate_payment_order_ids ?? []) as string[];
  const expiredIds = (lists?.expired_reservation_order_ids ?? []) as string[];

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Commerce Health</h1>
      <Card className={data?.ok ? 'border-green-500/50' : 'border-amber-500/50'}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            {data?.ok ? (
              <><CheckCircle className="h-5 w-5 text-green-500" /> Todas as checagens OK</>
            ) : (
              <><AlertTriangle className="h-5 w-5 text-amber-500" /> Atenção: verifique os itens abaixo</>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {item.ok ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" /> : <XCircle className="h-4 w-4 text-destructive shrink-0" />}
              <span className={item.ok ? 'text-muted-foreground' : ''}>{item.label}</span>
            </div>
          ))}
          {c.last_stripe_webhook_at && (
            <p className="text-xs text-muted-foreground pt-2">Último webhook Stripe: {new Date(c.last_stripe_webhook_at).toLocaleString()}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ações anti-desastre</CardTitle>
          <p className="text-sm text-muted-foreground">Liberar reservas expiradas ou reconciliar pedidos pendentes há mais de 2h.</p>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline" onClick={() => runAction('release_reservations')} disabled={!!actionLoading}>
            {actionLoading === 'release' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Liberar reservas expiradas
          </Button>
          <Button variant="outline" onClick={() => runAction('reconcile_stale')} disabled={!!actionLoading}>
            {actionLoading === 'reconcile' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Reconciliar pendentes
          </Button>
        </CardContent>
      </Card>

      {listsLoading ? (
        <p className="text-muted-foreground">Carregando listas...</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Listas anti-desastre</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium text-sm mb-1">Pagou mas não confirmou (order_ids)</h4>
              <p className="text-xs text-muted-foreground mb-1">Pedidos com status paid sem payment aprovado.</p>
              {paidIds.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum.</p> : <ul className="text-sm font-mono list-disc list-inside">{paidIds.slice(0, 20).map((id) => <li key={id}><a href={`/admin/pedidos?order=${id}`} className="text-primary hover:underline">{id}</a></li>)}</ul>}
              {paidIds.length > 20 && <p className="text-xs text-muted-foreground">… e mais {paidIds.length - 20}</p>}
            </div>
            <div>
              <h4 className="font-medium text-sm mb-1">Pagamento duplicado (order_ids envolvidos)</h4>
              {dupIds.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum.</p> : <ul className="text-sm font-mono list-disc list-inside">{dupIds.slice(0, 20).map((id) => <li key={id}><a href={`/admin/pedidos?order=${id}`} className="text-primary hover:underline">{id}</a></li>)}</ul>}
              {dupIds.length > 20 && <p className="text-xs text-muted-foreground">… e mais {dupIds.length - 20}</p>}
            </div>
            <div>
              <h4 className="font-medium text-sm mb-1">Reservas expiradas (pending &gt; 15 min)</h4>
              {expiredIds.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum.</p> : <ul className="text-sm font-mono list-disc list-inside">{expiredIds.slice(0, 20).map((id) => <li key={id}><a href={`/admin/pedidos?order=${id}`} className="text-primary hover:underline">{id}</a></li>)}</ul>}
              {expiredIds.length > 20 && <p className="text-xs text-muted-foreground">… e mais {expiredIds.length - 20}</p>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
