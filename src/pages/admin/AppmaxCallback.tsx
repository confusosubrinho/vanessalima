import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, AlertCircle, Loader2, RefreshCw } from 'lucide-react';

export default function AppmaxCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'waiting' | 'connected' | 'error'>('waiting');
  const [errorMsg, setErrorMsg] = useState('');
  const [checking, setChecking] = useState(false);
  const [externalId, setExternalId] = useState('');

  const externalKey = searchParams.get('external_key') || 'main-store';

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase
        .from('appmax_installations' as any)
        .select('status, external_id, last_error')
        .eq('external_key', externalKey)
        .eq('environment', 'sandbox')
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) {
        setStatus('error');
        setErrorMsg('Instalação não encontrada.');
        return;
      }

      const d = data as any;
      if (d.status === 'connected') {
        setStatus('connected');
        setExternalId(d.external_id || '');
      } else if (d.status === 'error') {
        setStatus('error');
        setErrorMsg(d.last_error || 'Erro desconhecido.');
      }
      // else still waiting
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message);
    } finally {
      setChecking(false);
    }
  }, [externalKey]);

  // Auto-check on load and periodically
  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Conexão Appmax</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'waiting' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="font-medium">Autorização realizada</p>
              <p className="text-sm text-muted-foreground text-center">
                Aguardando validação (health check) pela Appmax...
              </p>
              <p className="text-xs text-muted-foreground">
                O status será atualizado automaticamente.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={checkStatus}
                disabled={checking}
                className="mt-2"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
                Recarregar status
              </Button>
            </div>
          )}
          {status === 'connected' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Check className="h-6 w-6 text-primary" />
              </div>
              <p className="font-medium text-primary">Conectado com sucesso!</p>
              <p className="text-sm text-muted-foreground text-center">
                Credenciais do merchant foram recebidas e salvas com segurança.
              </p>
              {externalId && (
                <p className="text-xs text-muted-foreground">
                  External ID: <code className="bg-muted px-1.5 py-0.5 rounded">{externalId}</code>
                </p>
              )}
              <Button onClick={() => navigate('/admin/integracoes')} className="mt-4">
                Voltar para Integrações
              </Button>
            </div>
          )}
          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <p className="font-medium text-destructive">Erro na conexão</p>
              <p className="text-sm text-muted-foreground text-center">{errorMsg}</p>
              <Button variant="outline" onClick={() => navigate('/admin/integracoes')} className="mt-4">
                Voltar para Integrações
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
