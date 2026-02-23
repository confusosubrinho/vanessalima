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
  const [status, setStatus] = useState<'generating' | 'polling' | 'connected' | 'error'>('generating');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [checking, setChecking] = useState(false);
  const [externalId, setExternalId] = useState('');
  const [detectedEnv, setDetectedEnv] = useState<string>('');
  const generatedRef = useRef(false);
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

  // Call generate-merchant-keys with install_token
  const generateMerchantKeys = useCallback(async () => {
    if (!installToken) return false;

    try {
      const env = await detectEnv();
      setDetectedEnv(env);

      const { data, error } = await supabase.functions.invoke('appmax-generate-merchant-keys', {
        body: {
          external_key: externalKey,
          token: installToken,
          environment: env,
        },
      });

      if (error) {
        throw new Error(error.message || 'Erro na chamada da função');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.status === 'connected') {
        setStatus('connected');
        return true;
      }

      return false;
    } catch (err: any) {
      console.error('[AppmaxCallback] generate-merchant-keys failed:', err);
      setErrorMsg(err.message);
      setErrorDetail(`Função: appmax-generate-merchant-keys\nToken: ${installToken ? installToken.slice(0, 8) + '...' : 'vazio'}\nExternal key: ${externalKey}`);
      setStatus('error');
      return false;
    }
  }, [externalKey, installToken, detectEnv]);

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
      } else if (d.status === 'error') {
        setStatus('error');
        setErrorMsg(d.last_error || 'Erro desconhecido.');
        return false;
      }
      return false;
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message);
      return false;
    } finally {
      setChecking(false);
    }
  }, [externalKey]);

  // Main flow on mount
  useEffect(() => {
    if (generatedRef.current) return;
    generatedRef.current = true;

    (async () => {
      // Step 1: Try generate-merchant-keys immediately if we have a token
      if (installToken) {
        setStatus('generating');
        const success = await generateMerchantKeys();
        if (success) return;
        // If it failed with error status, don't continue to polling
        // The error is already shown
        return;
      }

      // Step 2: No token — go to polling mode, wait for healthcheck
      setStatus('polling');
    })();
  }, [generateMerchantKeys, installToken]);

  // Polling mode: check every 5s, with 15s timeout fallback
  useEffect(() => {
    if (status !== 'polling') return;

    checkStatus();
    const interval = setInterval(checkStatus, 5000);

    // After 15s, if still polling and we have a token, try generate-merchant-keys as fallback
    const timeout = setTimeout(async () => {
      if (fallbackTriedRef.current) return;
      fallbackTriedRef.current = true;

      // Check one more time
      const connected = await checkStatus();
      if (connected) return;

      // Fallback: try generate-merchant-keys if we have an install token
      if (installToken) {
        setStatus('generating');
        await generateMerchantKeys();
      } else {
        setStatus('error');
        setErrorMsg('Healthcheck não recebido após 15 segundos. A Appmax pode não estar chamando o endpoint de healthcheck.');
        setErrorDetail(
          `External key: ${externalKey}\n` +
          `Token na URL: ${installToken ? 'sim' : 'não'}\n` +
          `Verifique se a URL do healthcheck está correta no portal Appmax.`
        );
      }
    }, HEALTHCHECK_TIMEOUT_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [status, checkStatus, installToken, externalKey, generateMerchantKeys]);

  const envLabel = detectedEnv === 'production' ? 'Produção' : detectedEnv === 'sandbox' ? 'Sandbox' : '';

  const handleRetry = () => {
    generatedRef.current = false;
    fallbackTriedRef.current = false;
    setErrorMsg('');
    setErrorDetail('');
    if (installToken) {
      setStatus('generating');
      generateMerchantKeys();
    } else {
      setStatus('polling');
    }
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
                Chamando <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/app/client/generate</code> com o token de instalação.
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
                Se não receber confirmação, tentaremos gerar credenciais automaticamente.
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
