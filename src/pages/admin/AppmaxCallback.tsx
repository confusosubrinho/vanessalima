import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, AlertCircle, Loader2, RefreshCw } from 'lucide-react';

const HEALTHCHECK_TIMEOUT_MS = 15_000;

export default function AppmaxCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'generating' | 'polling' | 'connected' | 'error'>('polling');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [checking, setChecking] = useState(false);
  const [externalId, setExternalId] = useState('');
  const [detectedEnv, setDetectedEnv] = useState<string>('');
  const fallbackTriedRef = useRef(false);

  const externalKey = searchParams.get('external_key') || 'main-store';
  const installToken =
    searchParams.get('token') ||
    searchParams.get('install_token') ||
    searchParams.get('hash') ||
    '';

  const detectEnv = useCallback(async (): Promise<string> => {
    const { data } = await supabase
      .from('appmax_installations' as any)
      .select('environment')
      .eq('external_key', externalKey)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as any)?.environment || 'sandbox';
  }, [externalKey]);

  const loadLastCallbackDiagnostic = useCallback(async (env?: string) => {
    const effectiveEnv = env || detectedEnv || (await detectEnv());

    const { data } = await supabase
      .from('appmax_handshake_logs' as any)
      .select('created_at, http_status, message, payload, request_id')
      .eq('stage', 'callback')
      .eq('external_key', externalKey)
      .eq('environment', effectiveEnv)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return;

    const diag = data as any;
    const formatted = [
      `Request ID: ${diag.request_id || '-'}`,
      `HTTP: ${diag.http_status || '-'}`,
      `Mensagem: ${diag.message || '-'}`,
      diag.payload ? `Detalhes:\n${JSON.stringify(diag.payload, null, 2)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    setErrorDetail(formatted);
  }, [detectEnv, detectedEnv, externalKey]);

  // Check installation status in DB
  const checkStatus = useCallback(async (): Promise<boolean> => {
    setChecking(true);
    try {
      const { data, error } = await supabase
        .from('appmax_installations' as any)
        .select('status, external_id, last_error, environment')
        .eq('external_key', externalKey)
        .in('status', ['connected', 'error', 'pending'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return false;

      const d = data as any;
      setDetectedEnv(d.environment || '');

      if (d.status === 'connected') {
        setStatus('connected');
        setExternalId(d.external_id || '');
        return true;
      }

      if (d.status === 'error') {
        setErrorMsg(d.last_error || 'Falha na integração.');
      }

      return false;
    } catch (err: any) {
      setErrorMsg(err.message);
      return false;
    } finally {
      setChecking(false);
    }
  }, [externalKey]);

  // Generate merchant keys only as fallback after timeout
  const generateMerchantKeys = useCallback(async () => {
    if (!installToken) return false;

    try {
      setStatus('generating');
      const env = detectedEnv || (await detectEnv());
      setDetectedEnv(env);

      const { data, error } = await supabase.functions.invoke('appmax-generate-merchant-keys', {
        body: {
          external_key: externalKey,
          token: installToken,
          environment: env,
        },
      });

      if (error) {
        await loadLastCallbackDiagnostic(env);
        throw new Error(error.message || 'Falha ao chamar a função de geração de credenciais');
      }

      if (data?.status === 'connected') {
        setStatus('connected');
        await checkStatus();
        return true;
      }

      await loadLastCallbackDiagnostic(env);
      throw new Error(data?.error || 'Falha ao gerar credenciais do merchant');
    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus('error');
      return false;
    }
  }, [checkStatus, detectEnv, detectedEnv, externalKey, installToken, loadLastCallbackDiagnostic]);

  // Poll healthcheck confirmation first; fallback to generate after timeout
  useEffect(() => {
    if (status !== 'polling') return;

    checkStatus();
    const interval = setInterval(checkStatus, 5000);

    const timeout = setTimeout(async () => {
      if (fallbackTriedRef.current) return;
      fallbackTriedRef.current = true;

      const connected = await checkStatus();
      if (connected) return;

      if (installToken) {
        await generateMerchantKeys();
      } else {
        setStatus('error');
        setErrorMsg('Healthcheck não confirmado em 15s e nenhum install_token foi encontrado na URL.');
      }
    }, HEALTHCHECK_TIMEOUT_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [status, checkStatus, installToken, generateMerchantKeys]);

  const envLabel = detectedEnv === 'production' ? 'Produção' : detectedEnv === 'sandbox' ? 'Sandbox' : '';

  const handleRetry = async () => {
    fallbackTriedRef.current = false;
    setErrorMsg('');
    setErrorDetail('');
    setStatus('polling');
    await checkStatus();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">
            Conexão Appmax {envLabel && <span className="text-sm font-normal text-muted-foreground">({envLabel})</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'generating' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="font-medium">Gerando credenciais do merchant...</p>
              <p className="text-sm text-muted-foreground text-center">
                Healthcheck não confirmou em 15s. Executando fallback em <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/app/client/generate</code>.
              </p>
            </div>
          )}

          {status === 'polling' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="font-medium">Aguardando confirmação...</p>
              <p className="text-sm text-muted-foreground text-center">
                Aguardando healthcheck da Appmax (timeout: 15s).
              </p>
              <p className="text-xs text-muted-foreground">
                Sem confirmação, o fallback de geração será executado automaticamente.
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
                Credenciais do merchant foram geradas e salvas com segurança.
              </p>
              {envLabel && (
                <p className="text-xs text-muted-foreground">
                  Ambiente: <code className="bg-muted px-1.5 py-0.5 rounded">{envLabel}</code>
                </p>
              )}
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
              {errorDetail && (
                <pre className="text-xs bg-muted p-3 rounded w-full overflow-x-auto whitespace-pre-wrap text-muted-foreground mt-1">
                  {errorDetail}
                </pre>
              )}
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={handleRetry}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Tentar novamente
                </Button>
                <Button variant="outline" onClick={() => navigate('/admin/integracoes')}>
                  Voltar para Integrações
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
