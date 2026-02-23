import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, AlertCircle, Loader2, RefreshCw, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const HEALTHCHECK_TIMEOUT_MS = 300_000; // 5 minutos
const POLL_INTERVAL_MS = 4_000;

export default function AppmaxCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'polling' | 'generating' | 'connected' | 'error'>('polling');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [checking, setChecking] = useState(false);
  const [externalId, setExternalId] = useState('');
  const [detectedEnv, setDetectedEnv] = useState<string>('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const startTimeRef = useRef(Date.now());
  const connectedRef = useRef(false);

  const externalKey = searchParams.get('external_key') || 'main-store';
  const [savedToken, setSavedToken] = useState('');

  useEffect(() => {
    supabase
      .from('appmax_installations' as any)
      .select('authorize_token')
      .eq('external_key', externalKey)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.authorize_token) setSavedToken(data.authorize_token);
      });
  }, [externalKey]);

  const checkStatus = useCallback(async (): Promise<boolean> => {
    if (connectedRef.current) return true;
    setChecking(true);
    try {
      const { data, error } = await supabase
        .from('appmax_installations' as any)
        .select('status, external_id, last_error, environment, merchant_client_id')
        .eq('external_key', externalKey)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return false;

      const d = data as any;
      setDetectedEnv(d.environment || '');

      if (d.status === 'connected' && d.merchant_client_id) {
        connectedRef.current = true;
        setStatus('connected');
        setExternalId(d.external_id || '');
        return true;
      }

      return false;
    } catch (err: any) {
      setErrorMsg(err.message);
      return false;
    } finally {
      setChecking(false);
    }
  }, [externalKey]);

  // Poll for healthcheck completion — this is the PRIMARY mechanism
  useEffect(() => {
    if (status !== 'polling') return;

    checkStatus();
    const interval = setInterval(async () => {
      const connected = await checkStatus();
      if (connected) return;

      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedSec(elapsed);

      if (elapsed * 1000 >= HEALTHCHECK_TIMEOUT_MS) {
        setStatus('error');
        setErrorMsg(
          'O healthcheck da Appmax não foi recebido dentro do tempo esperado (5 min). ' +
          'Verifique se a "URL de validação" no app Appmax está configurada corretamente: ' +
          `https://sojrvsbqkrbxoymlwtii.supabase.co/functions/v1/appmax-healthcheck`
        );
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [status, checkStatus]);

  // Timer display
  useEffect(() => {
    if (status !== 'polling') return;
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  // Auto-generate quando página carrega com token na URL
  const autoGenerateAttempted = useRef(false);

  useEffect(() => {
    if (autoGenerateAttempted.current) return;

    const installToken =
      searchParams.get('token') ||
      searchParams.get('install_token') ||
      searchParams.get('hash') ||
      savedToken;

    if (!installToken || status !== 'polling') return;

    autoGenerateAttempted.current = true;

    // Aguarda 2s para o banco estar atualizado após o redirect
    const t = setTimeout(async () => {
      try {
        const env = detectedEnv || 'sandbox';
        const { data, error } = await supabase.functions.invoke('appmax-generate-merchant-keys', {
          body: {
            external_key: externalKey,
            token: installToken,
            environment: env,
          },
        });

        if (!error && data?.status === 'connected') {
          connectedRef.current = true;
          setStatus('connected');
          await checkStatus();
        }
        // Se falhou, continua polling silenciosamente aguardando o healthcheck
      } catch {
        // Silencia erro — o polling continua normalmente
      }
    }, 2000);

    return () => clearTimeout(t);
  }, [searchParams, savedToken, status, detectedEnv, externalKey, checkStatus]);

  // Manual generate (fallback) — only via button click
  const handleManualGenerate = useCallback(async () => {
    const installToken =
      searchParams.get('token') ||
      searchParams.get('install_token') ||
      searchParams.get('hash') ||
      savedToken ||
      '';

    if (!installToken) {
      setErrorMsg('Nenhum install_token encontrado na URL para gerar credenciais manualmente.');
      return;
    }

    try {
      setStatus('generating');
      const env = detectedEnv || 'sandbox';

      const { data, error } = await supabase.functions.invoke('appmax-generate-merchant-keys', {
        body: {
          external_key: externalKey,
          token: installToken,
          environment: env,
        },
      });

      if (error) throw new Error(error.message);

      if (data?.status === 'connected') {
        connectedRef.current = true;
        setStatus('connected');
        await checkStatus();
        return;
      }

      throw new Error(data?.error || 'Falha ao gerar credenciais');
    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus('error');

      // Load diagnostic
      const { data: diag } = await supabase
        .from('appmax_handshake_logs' as any)
        .select('created_at, http_status, message, payload, request_id')
        .eq('stage', 'callback')
        .eq('external_key', externalKey)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (diag) {
        const d = diag as any;
        setErrorDetail(
          [`Request ID: ${d.request_id || '-'}`, `HTTP: ${d.http_status || '-'}`, `Mensagem: ${d.message || '-'}`,
            d.payload ? `Detalhes:\n${JSON.stringify(d.payload, null, 2)}` : '']
            .filter(Boolean).join('\n')
        );
      }
    }
  }, [checkStatus, detectedEnv, externalKey, searchParams]);

  const handleRetry = () => {
    connectedRef.current = false;
    startTimeRef.current = Date.now();
    setErrorMsg('');
    setErrorDetail('');
    setElapsedSec(0);
    setStatus('polling');
  };

  const envLabel = detectedEnv === 'production' ? 'Produção' : detectedEnv === 'sandbox' ? 'Sandbox' : '';
  const progressPercent = Math.min((elapsedSec / (HEALTHCHECK_TIMEOUT_MS / 1000)) * 100, 100);

  const hasInstallToken = !!(
    searchParams.get('token') ||
    searchParams.get('install_token') ||
    searchParams.get('hash') ||
    savedToken
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">
            Conexão Appmax {envLabel && <span className="text-sm font-normal text-muted-foreground">({envLabel})</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'polling' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="font-medium">Aguardando healthcheck da Appmax...</p>
              <div className="w-full space-y-1">
                <Progress value={progressPercent} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {elapsedSec}s
                  </span>
                  <span>Timeout: {HEALTHCHECK_TIMEOUT_MS / 1000}s</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                A Appmax enviará as credenciais do merchant via healthcheck. Isso pode levar até 5 minutos.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={checkStatus}
                disabled={checking}
                className="mt-2"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
                Verificar agora
              </Button>
            </div>
          )}

          {status === 'generating' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="font-medium">Gerando credenciais manualmente...</p>
              <p className="text-sm text-muted-foreground text-center">
                Chamando <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/app/client/generate</code>
              </p>
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
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <p className="font-medium text-destructive">Healthcheck não recebido</p>
              <p className="text-sm text-muted-foreground text-center">{errorMsg}</p>
              {errorDetail && (
                <pre className="text-xs bg-muted p-3 rounded w-full overflow-x-auto whitespace-pre-wrap text-muted-foreground mt-1">
                  {errorDetail}
                </pre>
              )}
              <div className="flex flex-col gap-2 mt-4 w-full">
                <Button variant="outline" size="sm" onClick={handleRetry} className="w-full">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Aguardar novamente (5 min)
                </Button>
                {hasInstallToken && (
                  <Button variant="secondary" size="sm" onClick={handleManualGenerate} className="w-full">
                    Tentar gerar credenciais manualmente
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => navigate('/admin/integracoes')} className="w-full">
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
