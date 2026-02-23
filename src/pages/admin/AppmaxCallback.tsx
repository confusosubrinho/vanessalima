import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, AlertCircle, Loader2, RefreshCw } from 'lucide-react';

export default function AppmaxCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'generating' | 'polling' | 'connected' | 'error'>('generating');
  const [errorMsg, setErrorMsg] = useState('');
  const [checking, setChecking] = useState(false);
  const [externalId, setExternalId] = useState('');
  const [detectedEnv, setDetectedEnv] = useState<string>('');
  const generatedRef = useRef(false);

  const externalKey = searchParams.get('external_key') || 'main-store';
  // Appmax may return the install token as "token", "install_token", or "hash"
  const installToken =
    searchParams.get('token') ||
    searchParams.get('install_token') ||
    searchParams.get('hash') ||
    '';

  // Detect environment from the installation record
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

  // Step 1: Call appmax-generate-merchant-keys with the install_token
  const generateMerchantKeys = useCallback(async () => {
    if (generatedRef.current) return;
    generatedRef.current = true;

    if (!installToken) {
      // No token in URL — fall back to polling (healthcheck-dependent)
      setStatus('polling');
      return;
    }

    try {
      setStatus('generating');
      const env = await detectEnv();
      setDetectedEnv(env);

      const { data, error } = await supabase.functions.invoke('appmax-generate-merchant-keys', {
        body: {
          external_key: externalKey,
          token: installToken,
          environment: env,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      if (data?.status === 'connected') {
        setStatus('connected');
        return;
      }

      // Unexpected response — fall back to polling
      setStatus('polling');
    } catch (err: any) {
      console.error('[AppmaxCallback] generate-merchant-keys failed:', err);
      // Set error but also try polling as fallback
      setErrorMsg(err.message);
      setStatus('error');
    }
  }, [externalKey, installToken, detectEnv]);

  // Step 2 (fallback): Poll installation status for healthcheck-based completion
  const checkStatus = useCallback(async () => {
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
      if (!data) return;

      const d = data as any;
      setDetectedEnv(d.environment || '');

      if (d.status === 'connected') {
        setStatus('connected');
        setExternalId(d.external_id || '');
      } else if (d.status === 'error') {
        setStatus('error');
        setErrorMsg(d.last_error || 'Erro desconhecido.');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message);
    } finally {
      setChecking(false);
    }
  }, [externalKey]);

  // On mount: try to generate keys automatically
  useEffect(() => {
    generateMerchantKeys();
  }, [generateMerchantKeys]);

  // If in polling mode, poll every 5s
  useEffect(() => {
    if (status !== 'polling') return;
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [status, checkStatus]);

  const envLabel = detectedEnv === 'production' ? 'Produção' : detectedEnv === 'sandbox' ? 'Sandbox' : '';

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
              <p className="font-medium">Autorização realizada</p>
              <p className="text-sm text-muted-foreground text-center">
                {installToken
                  ? 'Token não reconhecido. Aguardando validação via healthcheck...'
                  : 'Nenhum token retornado na URL. Aguardando healthcheck da Appmax...'}
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
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    generatedRef.current = false;
                    setErrorMsg('');
                    generateMerchantKeys();
                  }}
                >
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
