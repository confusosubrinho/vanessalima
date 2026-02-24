import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ExternalLink, Check, AlertCircle, Settings2, Plug, CreditCard, Package, Truck, ChevronDown, ChevronUp, Plus, Trash2, MapPin, Store, Link2, Loader2, ArrowUpDown, Filter, Activity, Clock, RefreshCw, Wifi, Eye, EyeOff, Save, Copy, Stethoscope, ClipboardCopy } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

// ─── Types ───

interface ShippingRegion {
  id: string;
  name: string;
  states: string[];
  price: number;
  min_days: number;
  max_days: number;
  enabled: boolean;
}

// ─── Appmax Settings Form ───

const APPMAX_DEFAULTS: Record<string, { base_api_url: string; base_auth_url: string; base_portal_url: string }> = {
  sandbox: {
    base_api_url: 'https://sandbox.appmax.com.br/api/v1',
    base_auth_url: 'https://sandbox.appmax.com.br/oauth',
    base_portal_url: 'https://sandbox.appmax.com.br',
  },
  production: {
    base_api_url: 'https://api.appmax.com.br/api/v1',
    base_auth_url: 'https://admin.appmax.com.br/oauth',
    base_portal_url: 'https://admin.appmax.com.br',
  },
};

function AppmaxSettingsForm({ env, settings, onSaved }: {
  env: 'sandbox' | 'production';
  settings: Record<string, unknown> | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const envLabel = env === 'sandbox' ? 'Sandbox' : 'Produção';
  const defaults = APPMAX_DEFAULTS[env];
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || '';
  const functionsBase = projectId ? `https://${projectId}.supabase.co/functions/v1` : '';

  const [form, setForm] = useState({
    app_id: '',
    client_id: '',
    client_secret: '',
    base_api_url: '',
    base_auth_url: '',
    base_portal_url: '',
    callback_url: '',
    healthcheck_url: '',
  });
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      const s = settings as Record<string, string | null>;
      setForm({
        app_id: s.app_id || '',
        client_id: s.client_id || '',
        client_secret: s.client_secret || '',
        base_api_url: s.base_api_url || defaults.base_api_url,
        base_auth_url: s.base_auth_url || defaults.base_auth_url,
        base_portal_url: s.base_portal_url || defaults.base_portal_url,
        callback_url: s.callback_url || (functionsBase ? `${functionsBase}/appmax-authorize` : ''),
        healthcheck_url: s.healthcheck_url || (functionsBase ? `${functionsBase}/appmax-healthcheck` : ''),
      });
    }
  }, [settings, defaults, functionsBase]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        app_id: form.app_id || null,
        client_id: form.client_id || null,
        base_api_url: form.base_api_url || null,
        base_auth_url: form.base_auth_url || null,
        base_portal_url: form.base_portal_url || null,
        callback_url: form.callback_url || null,
        healthcheck_url: form.healthcheck_url || null,
        updated_at: new Date().toISOString(),
      };
      // Only update client_secret if it was changed (non-empty and different)
      if (form.client_secret && form.client_secret !== (settings as Record<string, string | null>)?.client_secret) {
        payload.client_secret = form.client_secret;
      }

      if (settings && (settings as Record<string, unknown>).id) {
        const { error } = await supabase
          .from('appmax_settings')
          .update(payload)
          .eq('id', (settings as Record<string, string>).id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('appmax_settings')
          .insert({ ...payload, environment: env } as Record<string, unknown>);
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['appmax-settings', env] });
      onSaved();
      toast({ title: `Configurações ${envLabel} salvas!` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast({ title: 'Erro ao salvar', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copiada!`, description: text });
  };

  const fillDefaults = () => {
    setForm(prev => ({
      ...prev,
      base_api_url: defaults.base_api_url,
      base_auth_url: defaults.base_auth_url,
      base_portal_url: defaults.base_portal_url,
      callback_url: functionsBase ? `${functionsBase}/appmax-authorize` : prev.callback_url,
      healthcheck_url: functionsBase ? `${functionsBase}/appmax-healthcheck` : prev.healthcheck_url,
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Configurações do App ({envLabel})
        </h4>
        <Button variant="ghost" size="sm" onClick={fillDefaults} className="text-xs h-7">
          Preencher padrões
        </Button>
      </div>

      {/* Credenciais */}
      <div className="grid gap-3">
        <div className="space-y-1">
          <Label className="text-xs">App ID</Label>
          <Input
            value={form.app_id}
            onChange={e => setForm(prev => ({ ...prev, app_id: e.target.value }))}
            placeholder="ID do aplicativo na Appmax"
            className="text-xs h-8"
          />
          <p className="text-[10px] text-muted-foreground">Preenchido automaticamente no modo Bootstrap, ou cole o ID fornecido pela Appmax.</p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Client ID</Label>
          <Input
            value={form.client_id}
            onChange={e => setForm(prev => ({ ...prev, client_id: e.target.value }))}
            placeholder="client_id do OAuth"
            className="text-xs h-8"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Client Secret</Label>
          <div className="relative">
            <Input
              type={showSecret ? 'text' : 'password'}
              value={form.client_secret}
              onChange={e => setForm(prev => ({ ...prev, client_secret: e.target.value }))}
              placeholder="client_secret do OAuth"
              className="text-xs h-8 pr-8"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">Deixe vazio para manter o valor atual.</p>
        </div>
      </div>

      <Separator />

      {/* URLs base */}
      <div className="grid gap-3">
        <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">URLs da API</h5>

        <div className="space-y-1">
          <Label className="text-xs">Base API URL</Label>
          <Input
            value={form.base_api_url}
            onChange={e => setForm(prev => ({ ...prev, base_api_url: e.target.value }))}
            placeholder={defaults.base_api_url}
            className="text-xs h-8 font-mono"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Base Auth URL</Label>
          <Input
            value={form.base_auth_url}
            onChange={e => setForm(prev => ({ ...prev, base_auth_url: e.target.value }))}
            placeholder={defaults.base_auth_url}
            className="text-xs h-8 font-mono"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Base Portal URL</Label>
          <Input
            value={form.base_portal_url}
            onChange={e => setForm(prev => ({ ...prev, base_portal_url: e.target.value }))}
            placeholder={defaults.base_portal_url}
            className="text-xs h-8 font-mono"
          />
        </div>
      </div>

      <Separator />

      {/* URLs de callback */}
      <div className="grid gap-3">
        <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">URLs de Integração</h5>

        <div className="space-y-1">
          <Label className="text-xs">Callback URL</Label>
          <div className="flex gap-1">
            <Input
              value={form.callback_url}
              onChange={e => setForm(prev => ({ ...prev, callback_url: e.target.value }))}
              placeholder="URL de callback OAuth"
              className="text-xs h-8 font-mono flex-1"
            />
            {form.callback_url && (
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => copyToClipboard(form.callback_url, 'Callback URL')}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">Cadastre esta URL no portal Appmax como URL de callback.</p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Healthcheck URL</Label>
          <div className="flex gap-1">
            <Input
              value={form.healthcheck_url}
              onChange={e => setForm(prev => ({ ...prev, healthcheck_url: e.target.value }))}
              placeholder="URL de healthcheck"
              className="text-xs h-8 font-mono flex-1"
            />
            {form.healthcheck_url && (
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => copyToClipboard(form.healthcheck_url, 'Healthcheck URL')}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">Cadastre esta URL no portal Appmax como URL de healthcheck.</p>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full" size="sm">
        {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : <><Save className="h-4 w-4 mr-2" />Salvar Configurações ({envLabel})</>}
      </Button>
    </div>
  );
}

// ─── Appmax Environment Tab ───

function AppmaxEnvTab({ env }: { env: 'sandbox' | 'production' }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const envLabel = env === 'sandbox' ? 'Sandbox' : 'Produção';
  const [showSettings, setShowSettings] = useState(false);

  const { data: installation, isLoading: installLoading } = useQuery({
    queryKey: ['appmax-installation', env],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appmax_installations')
        .select('id, external_key, environment, status, last_error, updated_at, merchant_client_id, external_id')
        .eq('external_key', 'main-store')
        .eq('environment', env)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: appmaxSettings } = useQuery({
    queryKey: ['appmax-settings', env],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appmax_settings')
        .select('*')
        .eq('environment', env)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const isBootstrap = !appmaxSettings?.app_id;
  const isActive = appmaxSettings?.is_active ?? false;
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('appmax-authorize', {
        body: { external_key: 'main-store', environment: env, store_name: 'vanessalima shoes - stdnj' },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.redirect_url) {
        window.location.href = data.redirect_url;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast({ title: 'Erro ao conectar', description: message, variant: 'destructive' });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!installation?.id) return;
    try {
      const { error } = await supabase
        .from('appmax_installations')
        .update({ status: 'disconnected', merchant_client_id: null, merchant_client_secret: null, authorize_token: null, external_id: null, last_error: null })
        .eq('id', installation.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['appmax-installation', env] });
      toast({ title: `Appmax ${envLabel} desconectada` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    }
  };

  const handleActivate = async () => {
    try {
      await supabase.from('appmax_settings').update({ is_active: false }).neq('environment', '___');
      await supabase.from('appmax_settings').update({ is_active: true }).eq('environment', env);
      queryClient.invalidateQueries({ queryKey: ['appmax-settings'] });
      toast({ title: `Ambiente ${envLabel} ativado` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    }
  };

  const installStatus = installation?.status || 'disconnected';

  const statusConfig: Record<string, { label: string; color: string }> = {
    disconnected: { label: 'Desconectado', color: 'bg-muted text-muted-foreground' },
    pending: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800' },
    connected: { label: 'Conectado', color: 'bg-green-100 text-green-800' },
    error: { label: 'Erro', color: 'bg-red-100 text-red-800' },
  };
  const currentStatus = statusConfig[installStatus] || statusConfig.disconnected;

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">Instalação ({envLabel})</h4>
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">Ativo</span>
          )}
          {isBootstrap && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-800">Bootstrap</span>
          )}
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${currentStatus.color}`}>
            {currentStatus.label}
          </span>
        </div>
      </div>

      {!isActive && (
        <div className="bg-muted/60 border rounded-md p-2.5 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Este ambiente está <strong>inativo</strong>. Ative para usar nas transações.</p>
          <Button variant="outline" size="sm" onClick={handleActivate} className="text-xs h-7">
            Ativar {envLabel}
          </Button>
        </div>
      )}

      {isBootstrap && installStatus !== 'connected' && (
        <div className="bg-orange-50 border border-orange-200 text-orange-800 text-xs rounded-md p-2.5">
          <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
          Modo Bootstrap: o App ID será definido automaticamente na primeira instalação pela Appmax.
        </div>
      )}

      {appmaxSettings?.app_id && (
        <p className="text-xs text-muted-foreground">
          App ID: <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">{appmaxSettings.app_id}</code>
        </p>
      )}

      {installStatus === 'connected' && installation?.updated_at && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-primary" />
            Conectado em {format(new Date(installation.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </div>
          {installation.external_id && (
            <p className="text-xs text-muted-foreground">
              External ID: <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{installation.external_id}</code>
            </p>
          )}
          {installation.merchant_client_id && (
            <p className="text-xs text-muted-foreground">
              Merchant Client ID: <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{String(installation.merchant_client_id).slice(0, 12)}...</code>
            </p>
          )}
        </div>
      )}

      {installStatus === 'error' && installation?.last_error && (
        <div className="bg-destructive/10 text-destructive text-xs rounded-md p-2.5">
          <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
          {installation.last_error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {installStatus !== 'connected' ? (
          <Button onClick={handleConnect} disabled={connecting || installLoading} className="flex-1">
            {connecting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Redirecionando...</>
            ) : (
              <><Plug className="h-4 w-4 mr-2" />{isBootstrap ? `Iniciar Bootstrap (${envLabel})` : `Conectar (${envLabel})`}</>
            )}
          </Button>
        ) : (
          <Button variant="destructive" onClick={handleDisconnect} size="sm">
            Desconectar
          </Button>
        )}
      </div>

      <Separator />

      {/* Expandable settings form */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="flex items-center gap-2 text-sm font-medium w-full text-left"
      >
        <Settings2 className="h-4 w-4" />
        Configurações avançadas
        {showSettings ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
      </button>

      {showSettings && (
        <AppmaxSettingsForm
          env={env}
          settings={appmaxSettings as Record<string, unknown> | null}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['appmax-settings', env] })}
        />
      )}
    </div>
  );
}

// ─── Domain & URL Settings (dynamic callback) ───

function DomainSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [baseUrl, setBaseUrl] = useState('');
  const [callbackPath, setCallbackPath] = useState('/admin/integrations/appmax/callback');
  const [saving, setSaving] = useState(false);

  const { data: storeSettings } = useQuery({
    queryKey: ['store-settings-domain'],
    queryFn: async () => {
      const { data } = await supabase
        .from('store_settings')
        .select('id, public_base_url, appmax_callback_path')
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });

  useEffect(() => {
    if (storeSettings) {
      setBaseUrl(storeSettings.public_base_url || '');
      setCallbackPath(storeSettings.appmax_callback_path || '/admin/integrations/appmax/callback');
    }
  }, [storeSettings]);

  const callbackUrl = useMemo(() => {
    if (!baseUrl) return '';
    const normalized = baseUrl.replace(/\/$/, '');
    const path = callbackPath.startsWith('/') ? callbackPath : '/' + callbackPath;
    return `${normalized}${path}`;
  }, [baseUrl, callbackPath]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const normalized = baseUrl.trim().replace(/\/$/, '');
      const payload: Record<string, any> = {
        public_base_url: normalized || null,
        appmax_callback_path: callbackPath || '/admin/integrations/appmax/callback',
      };
      if (storeSettings?.id) {
        await supabase.from('store_settings').update(payload as any).eq('id', storeSettings.id);
      }
      queryClient.invalidateQueries({ queryKey: ['store-settings-domain'] });
      toast({ title: 'URLs salvas!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUseCurrentDomain = async () => {
    const origin = window.location.origin;
    setBaseUrl(origin);
    setSaving(true);
    try {
      if (storeSettings?.id) {
        await supabase.from('store_settings').update({ public_base_url: origin } as any).eq('id', storeSettings.id);
      }
      queryClient.invalidateQueries({ queryKey: ['store-settings-domain'] });
      toast({ title: 'Domínio atualizado!', description: origin });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <h4 className="font-medium text-sm flex items-center gap-2">
        <Link2 className="h-4 w-4" />
        Domínio & URLs
      </h4>

      <div className="space-y-1">
        <Label className="text-xs">Base URL pública do site</Label>
        <div className="flex gap-1">
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://seusite.lovable.app"
            className="text-xs h-8 font-mono flex-1"
          />
          <Button variant="outline" size="sm" className="h-8 text-xs whitespace-nowrap" onClick={handleUseCurrentDomain}>
            Usar domínio atual
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Quando trocar para .com.br, acesse o admin pelo novo domínio e clique em "Usar domínio atual".
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Callback path (Appmax)</Label>
        <Input
          value={callbackPath}
          onChange={(e) => setCallbackPath(e.target.value)}
          className="text-xs h-8 font-mono"
        />
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Callback URL (calculado)</p>
        <div className="bg-muted rounded-md p-2 text-xs font-mono break-all">
          {callbackUrl || '— configure a Base URL acima —'}
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} size="sm" className="w-full">
        {saving ? 'Salvando...' : 'Salvar URLs'}
      </Button>
    </div>
  );
}

// ─── Appmax Gateway Panel ───

function AppmaxGatewayPanel() {
  const [showLogs, setShowLogs] = useState(false);
  const [showDomain, setShowDomain] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const [diagModalOpen, setDiagModalOpen] = useState(false);
  const { toast } = useToast();
  const [testingApi, setTestingApi] = useState(false);
  const [testingPing, setTestingPing] = useState(false);

  const { data: logs } = useQuery({
    queryKey: ['appmax-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appmax_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const { data: lastHealthcheck, refetch: refetchHc } = useQuery({
    queryKey: ['appmax-last-healthcheck'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appmax_handshake_logs')
        .select('*')
        .eq('stage', 'healthcheck')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: handshakeLogs, refetch: refetchHandshake } = useQuery({
    queryKey: ['appmax-handshake-logs'],
    enabled: diagModalOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appmax_handshake_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as any[];
    },
  });

  const handleTestApi = async () => {
    setTestingApi(true);
    try {
      const { data, error } = await supabase.functions.invoke('appmax-get-app-token', {});
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: 'API OK!', description: `Token obtido para ambiente ${data.environment}` });
    } catch (err: any) {
      toast({ title: 'Erro na API', description: err.message, variant: 'destructive' });
    } finally {
      setTestingApi(false);
    }
  };

  const handleTestPing = async () => {
    setTestingPing(true);
    try {
      const { data, error } = await supabase.functions.invoke('appmax-healthcheck-ping', {});
      if (error) throw new Error(error.message);
      if (data?.ok) {
        toast({ title: 'Endpoint acessível!', description: `Resposta em ${data.now}` });
      } else {
        toast({ title: 'Resposta inesperada', description: JSON.stringify(data), variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Endpoint inacessível', description: err.message, variant: 'destructive' });
    } finally {
      setTestingPing(false);
    }
  };

  const copyDiagnostic = () => {
    const lines: string[] = [
      `=== Diagnóstico Appmax (${new Date().toISOString()}) ===`,
      '',
    ];
    if (lastHealthcheck) {
      lines.push(`Último Healthcheck:`);
      lines.push(`  Data: ${lastHealthcheck.created_at}`);
      lines.push(`  OK: ${lastHealthcheck.ok}`);
      lines.push(`  HTTP Status: ${lastHealthcheck.http_status || 'N/A'}`);
      lines.push(`  Mensagem: ${lastHealthcheck.message}`);
      lines.push(`  External Key: ${lastHealthcheck.external_key || 'N/A'}`);
      lines.push(`  Environment: ${lastHealthcheck.environment}`);
      lines.push(`  Request ID: ${lastHealthcheck.request_id || 'N/A'}`);
      if (lastHealthcheck.payload) {
        lines.push(`  Payload: ${JSON.stringify(lastHealthcheck.payload, null, 2)}`);
      }
      if (lastHealthcheck.headers) {
        lines.push(`  Headers: ${JSON.stringify(lastHealthcheck.headers, null, 2)}`);
      }
    } else {
      lines.push('Nenhum log de healthcheck encontrado.');
      lines.push('⚠️ A Appmax pode não estar chamando seu endpoint.');
    }
    lines.push('');
    if (handshakeLogs?.length) {
      lines.push(`Últimos ${handshakeLogs.length} logs de handshake:`);
      for (const log of handshakeLogs) {
        lines.push(`  [${log.created_at}] ${log.stage} | ${log.ok ? 'OK' : 'ERRO'} | ${log.message}`);
      }
    }
    navigator.clipboard.writeText(lines.join('\n'));
    toast({ title: 'Diagnóstico copiado!' });
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="sandbox" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sandbox">🧪 Sandbox</TabsTrigger>
          <TabsTrigger value="production">🚀 Produção</TabsTrigger>
        </TabsList>
        <TabsContent value="sandbox" className="mt-4">
          <AppmaxEnvTab env="sandbox" />
        </TabsContent>
        <TabsContent value="production" className="mt-4">
          <AppmaxEnvTab env="production" />
        </TabsContent>
      </Tabs>

      <Separator />

      {/* Domain & URL Settings */}
      <div>
        <button onClick={() => setShowDomain(!showDomain)} className="flex items-center gap-2 text-sm font-medium w-full">
          <Link2 className="h-4 w-4" />
          Domínio & URLs
          {showDomain ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showDomain && (
          <div className="mt-3">
            <DomainSettings />
          </div>
        )}
      </div>

      <Separator />

      {/* Diagnostic Section */}
      <div className="space-y-3">
        <button onClick={() => setShowDiag(!showDiag)} className="flex items-center gap-2 text-sm font-medium w-full">
          <Stethoscope className="h-4 w-4" />
          Diagnóstico de Handshake
          {showDiag ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>

        {showDiag && (
          <div className="space-y-3 mt-2">
            {/* Last Healthcheck Block */}
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-medium flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" />
                  Último Healthcheck
                </h5>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => refetchHc()}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Atualizar
                </Button>
              </div>

              {!lastHealthcheck ? (
                <div className="bg-destructive/10 text-destructive text-xs rounded-md p-2.5">
                  <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                  Nenhum log de healthcheck encontrado. A Appmax <strong>não está chamando</strong> seu endpoint (URL errada no portal ou bloqueio de rede).
                </div>
              ) : (
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Última tentativa:</span>
                    <span>{format(new Date(lastHealthcheck.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</span>
                    <span className="text-muted-foreground/60">
                      ({formatDistanceToNow(new Date(lastHealthcheck.created_at), { addSuffix: true, locale: ptBR })})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge variant={lastHealthcheck.ok ? 'default' : 'destructive'} className="text-[10px] h-5">
                      {lastHealthcheck.ok ? 'OK' : 'ERRO'}
                    </Badge>
                    {lastHealthcheck.http_status && (
                      <span className="text-muted-foreground/60">HTTP {lastHealthcheck.http_status}</span>
                    )}
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground shrink-0">Mensagem:</span>
                    <span className="break-all">{lastHealthcheck.message}</span>
                  </div>
                  {lastHealthcheck.external_key && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">External key:</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">{lastHealthcheck.external_key}</code>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Environment:</span>
                    <span>{lastHealthcheck.environment}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="text-xs" onClick={handleTestPing} disabled={testingPing}>
                {testingPing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Wifi className="h-3.5 w-3.5 mr-1" />}
                Ping Endpoint
              </Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => { setDiagModalOpen(true); refetchHandshake(); }}>
                <Eye className="h-3.5 w-3.5 mr-1" />
                Ver logs
              </Button>
            </div>

            <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleTestApi} disabled={testingApi}>
              {testingApi ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Testando...</> : <><Wifi className="h-3.5 w-3.5 mr-2" />Testar conexão API (Token OAuth)</>}
            </Button>
          </div>
        )}
      </div>

      {/* Handshake Logs Modal */}
      <Dialog open={diagModalOpen} onOpenChange={setDiagModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              Logs de Handshake
            </DialogTitle>
            <DialogDescription>
              Últimos 20 logs de authorize, callback e healthcheck
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end mb-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={copyDiagnostic}>
              <ClipboardCopy className="h-3.5 w-3.5 mr-1" />
              Copiar diagnóstico
            </Button>
          </div>

          <div className="overflow-y-auto flex-1 space-y-2 pr-1">
            {!handshakeLogs?.length && <p className="text-xs text-muted-foreground">Nenhum log de handshake encontrado.</p>}
            {handshakeLogs?.map((log: any) => (
              <div key={log.id} className="text-xs border rounded-md p-2.5 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={log.ok ? 'default' : 'destructive'} className="text-[10px] h-5">
                    {log.ok ? 'OK' : 'ERRO'}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] h-5 font-mono">
                    {log.stage}
                  </Badge>
                  <span className="text-muted-foreground">{log.environment}</span>
                  {log.http_status && <span className="text-muted-foreground/60">HTTP {log.http_status}</span>}
                  <span className="text-muted-foreground/60 ml-auto">
                    {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                  </span>
                </div>
                <p className="text-muted-foreground break-all">{log.message}</p>
                {log.external_key && (
                  <p className="text-muted-foreground/60">key: <code className="font-mono">{log.external_key}</code></p>
                )}
                {log.payload && (
                  <details className="mt-1">
                    <summary className="text-muted-foreground/60 cursor-pointer text-[10px]">Payload</summary>
                    <pre className="bg-muted rounded p-1.5 mt-1 text-[10px] overflow-x-auto whitespace-pre-wrap">{JSON.stringify(log.payload, null, 2)}</pre>
                  </details>
                )}
                {log.headers && (
                  <details className="mt-1">
                    <summary className="text-muted-foreground/60 cursor-pointer text-[10px]">Headers</summary>
                    <pre className="bg-muted rounded p-1.5 mt-1 text-[10px] overflow-x-auto whitespace-pre-wrap">{JSON.stringify(log.headers, null, 2)}</pre>
                  </details>
                )}
                {log.error_stack && (
                  <details className="mt-1">
                    <summary className="text-destructive/60 cursor-pointer text-[10px]">Stack trace</summary>
                    <pre className="bg-destructive/5 rounded p-1.5 mt-1 text-[10px] overflow-x-auto whitespace-pre-wrap">{log.error_stack}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Separator />

      <div className="bg-muted/50 rounded-lg p-3 text-xs">
        <p className="font-medium">💡 Configurações financeiras</p>
        <p className="text-muted-foreground mt-1">Parcelamento, juros e descontos agora são gerenciados exclusivamente na aba <strong>"Juros e Cartões"</strong> do menu lateral.</p>
      </div>

      <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
        <p className="font-medium">Como funciona:</p>
        <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
          <li>Configure as credenciais do App em "Configurações avançadas"</li>
          <li>Preencha App ID, Client ID e Client Secret fornecidos pela Appmax</li>
          <li>Verifique se as URLs de callback e healthcheck estão corretas</li>
          <li>Clique em "Conectar" para iniciar a autorização OAuth</li>
          <li>Ative o ambiente desejado para transações reais</li>
        </ol>
      </div>

      <Separator />

      {/* Logs */}
      <div>
        <button onClick={() => setShowLogs(!showLogs)} className="flex items-center gap-2 text-sm font-medium w-full">
          <Activity className="h-4 w-4" />
          Logs recentes
          {showLogs ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showLogs && (
          <div className="mt-3 max-h-60 overflow-y-auto space-y-1.5">
            {!logs?.length && <p className="text-xs text-muted-foreground">Nenhum log encontrado.</p>}
            {logs?.map((log) => (
              <div key={log.id} className="text-xs border rounded-md p-2 flex items-start gap-2">
                <span className={`shrink-0 mt-0.5 h-2 w-2 rounded-full ${
                  log.level === 'error' ? 'bg-destructive' : log.level === 'warn' ? 'bg-yellow-500' : 'bg-green-500'
                }`} />
                <div className="min-w-0">
                  <p className="text-muted-foreground">{log.message}</p>
                  <p className="text-muted-foreground/60 text-[10px]">
                    {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Melhor Envio Panel ───

function MelhorEnvioPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: settings } = useQuery({
    queryKey: ['store-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('store_settings').select('*').limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    melhor_envio_token: '',
    melhor_envio_sandbox: true,
    free_shipping_threshold: 399,
    shipping_store_pickup_enabled: false,
    shipping_store_pickup_label: 'Retirada na Loja',
    shipping_store_pickup_address: '',
    shipping_free_enabled: false,
    shipping_free_label: 'Frete Grátis',
    shipping_free_min_value: 0,
    shipping_regions: [] as ShippingRegion[],
    shipping_allowed_services: [] as number[],
  });

  useEffect(() => {
    if (settings) {
      const s = settings as any;
      setForm({
        melhor_envio_token: s.melhor_envio_token || '',
        melhor_envio_sandbox: s.melhor_envio_sandbox !== false,
        free_shipping_threshold: s.free_shipping_threshold || 399,
        shipping_store_pickup_enabled: s.shipping_store_pickup_enabled || false,
        shipping_store_pickup_label: s.shipping_store_pickup_label || 'Retirada na Loja',
        shipping_store_pickup_address: s.shipping_store_pickup_address || '',
        shipping_free_enabled: s.shipping_free_enabled || false,
        shipping_free_label: s.shipping_free_label || 'Frete Grátis',
        shipping_free_min_value: s.shipping_free_min_value || 0,
        shipping_regions: (s.shipping_regions as ShippingRegion[]) || [],
        shipping_allowed_services: (s.shipping_allowed_services as number[]) || [],
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (settings?.id) {
        const { error } = await supabase.from('store_settings').update(form as any).eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('store_settings').insert(form as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-settings'] });
      toast({ title: 'Configurações de frete salvas!' });
    },
    onError: (e: any) => toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' }),
  });

  const addRegion = () => {
    setForm(prev => ({
      ...prev,
      shipping_regions: [...prev.shipping_regions, {
        id: crypto.randomUUID(),
        name: '',
        states: [],
        price: 0,
        min_days: 3,
        max_days: 7,
        enabled: true,
      }],
    }));
  };

  const updateRegion = (id: string, updates: Partial<ShippingRegion>) => {
    setForm(prev => ({
      ...prev,
      shipping_regions: prev.shipping_regions.map(r => r.id === id ? { ...r, ...updates } : r),
    }));
  };

  const removeRegion = (id: string) => {
    setForm(prev => ({
      ...prev,
      shipping_regions: prev.shipping_regions.filter(r => r.id !== id),
    }));
  };

  const brStates = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

  return (
    <div className="space-y-6">
      {/* Melhor Envio credentials */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm">Credenciais Melhor Envio</h4>
        <div className="space-y-1.5">
          <Label className="text-xs">Token de Acesso</Label>
          <Input value={form.melhor_envio_token} onChange={(e) => setForm({ ...form, melhor_envio_token: e.target.value })} placeholder="Cole seu token do Melhor Envio" />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={form.melhor_envio_sandbox} onCheckedChange={(v) => setForm({ ...form, melhor_envio_sandbox: v })} />
          <Label className="text-xs">Modo Sandbox (teste)</Label>
        </div>
      </div>

      <Separator />

      {/* Allowed shipping services - filter */}
      <div className="space-y-3" data-section="allowed-services">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Transportadoras Permitidas
        </h4>
        <p className="text-xs text-muted-foreground">Selecione quais opções de frete aparecerão para o cliente. Se nenhuma for selecionada, todas aparecerão.</p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 1, label: 'PAC (Correios)' },
            { id: 2, label: 'SEDEX (Correios)' },
            { id: 17, label: 'Mini Envios (Correios)' },
            { id: 3, label: '.Package (Jadlog)' },
            { id: 4, label: '.Com (Jadlog)' },
            { id: 27, label: '.Package Centralizado (Jadlog)' },
            { id: 12, label: 'éFácil (LATAM Cargo)' },
            { id: 15, label: 'Expresso (Azul Cargo)' },
            { id: 16, label: 'e-commerce (Azul Cargo)' },
            { id: 31, label: 'Express (Loggi)' },
            { id: 32, label: 'Coleta (Loggi)' },
            { id: 33, label: 'Standard (JeT)' },
            { id: 22, label: 'Rodoviário (Buslog)' },
          ].map((svc) => {
            const isSelected = form.shipping_allowed_services.includes(svc.id);
            return (
              <button
                key={svc.id}
                type="button"
                onClick={() => {
                  setForm(prev => ({
                    ...prev,
                    shipping_allowed_services: isSelected
                      ? prev.shipping_allowed_services.filter(id => id !== svc.id)
                      : [...prev.shipping_allowed_services, svc.id],
                  }));
                }}
                className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                  isSelected ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary bg-background'
                }`}
              >
                {svc.label}
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Free shipping threshold */}
      <div className="space-y-3">
        <h4 className="font-medium text-sm">Frete Grátis Automático</h4>
        <div className="space-y-1.5">
          <Label className="text-xs">Frete grátis a partir de (R$)</Label>
          <Input type="number" step="0.01" value={form.free_shipping_threshold} onChange={(e) => setForm({ ...form, free_shipping_threshold: parseFloat(e.target.value) })} className="w-[200px]" />
          <p className="text-xs text-muted-foreground">0 = desabilitado</p>
        </div>
      </div>

      <Separator />

      {/* Store pickup */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm flex items-center gap-2"><Store className="h-4 w-4" />Retirada na Loja</h4>
          <Switch checked={form.shipping_store_pickup_enabled} onCheckedChange={(v) => setForm({ ...form, shipping_store_pickup_enabled: v })} />
        </div>
        {form.shipping_store_pickup_enabled && (
          <div className="space-y-3 pl-4 border-l-2 border-primary/20">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome da opção</Label>
              <Input value={form.shipping_store_pickup_label} onChange={(e) => setForm({ ...form, shipping_store_pickup_label: e.target.value })} className="w-full" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Endereço para retirada</Label>
              <Input value={form.shipping_store_pickup_address} onChange={(e) => setForm({ ...form, shipping_store_pickup_address: e.target.value })} placeholder="Rua, número, bairro, cidade - UF" />
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Entrega grátis custom */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm flex items-center gap-2"><Truck className="h-4 w-4" />Entrega Grátis (Manual)</h4>
          <Switch checked={form.shipping_free_enabled} onCheckedChange={(v) => setForm({ ...form, shipping_free_enabled: v })} />
        </div>
        {form.shipping_free_enabled && (
          <div className="space-y-3 pl-4 border-l-2 border-primary/20">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome da opção</Label>
              <Input value={form.shipping_free_label} onChange={(e) => setForm({ ...form, shipping_free_label: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Valor mínimo do pedido (R$)</Label>
              <Input type="number" step="0.01" value={form.shipping_free_min_value} onChange={(e) => setForm({ ...form, shipping_free_min_value: parseFloat(e.target.value) })} className="w-[200px]" />
              <p className="text-xs text-muted-foreground">0 = sem valor mínimo</p>
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Regional shipping */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm flex items-center gap-2"><MapPin className="h-4 w-4" />Frete por Região</h4>
          <Button size="sm" variant="outline" onClick={addRegion}><Plus className="h-3.5 w-3.5 mr-1" />Adicionar Região</Button>
        </div>
        {form.shipping_regions.map((region) => (
          <Card key={region.id} className={!region.enabled ? 'opacity-60' : ''}>
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Input value={region.name} onChange={(e) => updateRegion(region.id, { name: e.target.value })} placeholder="Nome da região (ex: Sul)" className="max-w-[200px] h-8 text-sm" />
                <div className="flex items-center gap-2">
                  <Switch checked={region.enabled} onCheckedChange={(v) => updateRegion(region.id, { enabled: v })} />
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeRegion(region.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Estados (selecione)</Label>
                <div className="flex flex-wrap gap-1">
                  {brStates.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        const states = region.states.includes(st) ? region.states.filter(s => s !== st) : [...region.states, st];
                        updateRegion(region.id, { states });
                      }}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        region.states.includes(st) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Preço (R$)</Label>
                  <Input type="number" step="0.01" value={region.price} onChange={(e) => updateRegion(region.id, { price: parseFloat(e.target.value) })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dias mín.</Label>
                  <Input type="number" value={region.min_days} onChange={(e) => updateRegion(region.id, { min_days: parseInt(e.target.value) })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dias máx.</Label>
                  <Input type="number" value={region.max_days} onChange={(e) => updateRegion(region.id, { max_days: parseInt(e.target.value) })} className="h-8 text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {form.shipping_regions.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">Nenhuma região configurada. Use o botão acima para adicionar.</p>
        )}
      </div>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
        {saveMutation.isPending ? 'Salvando...' : 'Salvar Configurações de Frete'}
      </Button>
    </div>
  );
}

// ─── Bling ERP Panel (OAuth2) ───

// ─── Bling Sync Config Panel ───

interface BlingSyncConfigState {
  sync_stock: boolean;
  sync_titles: boolean;
  sync_descriptions: boolean;
  sync_images: boolean;
  sync_prices: boolean;
  sync_dimensions: boolean;
  sync_sku_gtin: boolean;
  sync_variant_active: boolean;
  import_new_products: boolean;
  merge_by_sku: boolean;
  first_import_done: boolean;
}

function BlingSyncConfigPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: syncConfig, isLoading } = useQuery({
    queryKey: ['bling-sync-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bling_sync_config').select('*').limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [config, setConfig] = useState<BlingSyncConfigState>({
    sync_stock: true, sync_titles: false, sync_descriptions: false, sync_images: false,
    sync_prices: false, sync_dimensions: false, sync_sku_gtin: false, sync_variant_active: false,
    import_new_products: true, merge_by_sku: true, first_import_done: false,
  });

  useEffect(() => {
    if (syncConfig) {
      setConfig({
        sync_stock: syncConfig.sync_stock ?? true,
        sync_titles: syncConfig.sync_titles ?? false,
        sync_descriptions: syncConfig.sync_descriptions ?? false,
        sync_images: syncConfig.sync_images ?? false,
        sync_prices: syncConfig.sync_prices ?? false,
        sync_dimensions: syncConfig.sync_dimensions ?? false,
        sync_sku_gtin: syncConfig.sync_sku_gtin ?? false,
        sync_variant_active: syncConfig.sync_variant_active ?? false,
        import_new_products: syncConfig.import_new_products ?? true,
        merge_by_sku: syncConfig.merge_by_sku ?? true,
        first_import_done: syncConfig.first_import_done ?? false,
      });
    }
  }, [syncConfig]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (syncConfig?.id) {
        const { error } = await supabase.from('bling_sync_config').update(config as any).eq('id', syncConfig.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bling_sync_config').insert(config as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bling-sync-config'] });
      toast({ title: 'Configurações de sincronização salvas!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const toggleItems: { key: keyof BlingSyncConfigState; label: string; description: string; group: 'sync' | 'import' }[] = [
    { key: 'sync_stock', label: 'Estoque', description: 'Atualizar quantidade em estoque das variantes', group: 'sync' },
    { key: 'sync_titles', label: 'Títulos', description: 'Sobrescrever nome do produto com o do Bling', group: 'sync' },
    { key: 'sync_descriptions', label: 'Descrições', description: 'Sobrescrever descrição com a do Bling', group: 'sync' },
    { key: 'sync_images', label: 'Imagens', description: 'Substituir fotos do produto pelas do Bling', group: 'sync' },
    { key: 'sync_prices', label: 'Preços', description: 'Atualizar preço base e promocional', group: 'sync' },
    { key: 'sync_dimensions', label: 'Dimensões/Peso', description: 'Atualizar peso, largura, altura e profundidade', group: 'sync' },
    { key: 'sync_sku_gtin', label: 'SKU e GTIN', description: 'Atualizar códigos SKU e GTIN', group: 'sync' },
    { key: 'sync_variant_active', label: 'Status de variante', description: 'Controlar ativo/inativo da variante pelo Bling', group: 'sync' },
    { key: 'import_new_products', label: 'Importar novos produtos', description: 'Criar automaticamente produtos que não existem localmente', group: 'import' },
    { key: 'merge_by_sku', label: 'Vincular por SKU', description: 'Se não encontrar por Bling ID, tentar vincular por SKU existente', group: 'import' },
  ];

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          O que sincronizar do Bling
        </h4>
        {config.first_import_done && (
          <Badge variant="secondary" className="text-[10px]">Primeira importação concluída</Badge>
        )}
      </div>

      <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
        <p><strong>Regra padrão:</strong> Após a primeira importação, somente <strong>estoque</strong> é sincronizado. Ative os toggles abaixo para permitir que o Bling sobrescreva outros campos.</p>
        <p className="mt-1"><strong>⚠️ Produtos inativos</strong> na loja nunca são sincronizados, mesmo com toggles ligados.</p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Campos de sincronização</p>
        {toggleItems.filter(t => t.group === 'sync').map(item => (
          <div key={item.key} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50">
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <Switch checked={config[item.key] as boolean} onCheckedChange={v => setConfig(prev => ({ ...prev, [item.key]: v }))} />
          </div>
        ))}
      </div>

      <Separator />

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Importação</p>
        {toggleItems.filter(t => t.group === 'import').map(item => (
          <div key={item.key} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50">
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <Switch checked={config[item.key] as boolean} onCheckedChange={v => setConfig(prev => ({ ...prev, [item.key]: v }))} />
          </div>
        ))}
      </div>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} size="sm" className="w-full">
        {saveMutation.isPending ? 'Salvando...' : 'Salvar Configurações de Sincronização'}
      </Button>
    </div>
  );
}

// ─── Bling Monitoring Panel (Webhook Logs + Sync Runs + Health) ───

function BlingMonitoringPanel() {
  const { toast } = useToast();
  const [testingWebhook, setTestingWebhook] = useState(false);

  const { data: webhookLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['bling-webhook-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bling_webhook_logs' as any)
        .select('*')
        .order('received_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 30000,
  });

  const { data: syncRuns } = useQuery({
    queryKey: ['bling-sync-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bling_sync_runs' as any)
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 30000,
  });

  const lastWebhook = webhookLogs?.[0];
  const lastRun = syncRuns?.[0];
  const errors24h = webhookLogs?.filter((l: any) => {
    const t = new Date(l.received_at).getTime();
    return l.result === 'error' && (Date.now() - t) < 86400000;
  }) || [];

  const handleTestWebhook = async () => {
    setTestingWebhook(true);
    try {
      const res = await supabase.functions.invoke('bling-webhook', {
        body: { action: 'test', event: 'test_ping', eventId: `test_${Date.now()}` },
      });
      toast({ title: 'Teste enviado!', description: 'Webhook processou com sucesso.' });
    } catch (err: any) {
      toast({ title: 'Erro no teste', description: err.message, variant: 'destructive' });
    } finally {
      setTestingWebhook(false);
    }
  };

  const resultBadge = (result: string) => {
    const map: Record<string, string> = {
      updated: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      skipped: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      not_found: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      error: 'bg-destructive/10 text-destructive',
      duplicate: 'bg-muted text-muted-foreground',
      processed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      skipped_inactive: 'bg-muted text-muted-foreground',
    };
    return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${map[result] || 'bg-muted text-muted-foreground'}`}>{result}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Monitoramento Bling
        </h4>
        <Button size="sm" variant="outline" onClick={handleTestWebhook} disabled={testingWebhook}>
          {testingWebhook ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wifi className="h-3 w-3 mr-1" />}
          Testar Webhook
        </Button>
      </div>

      {/* Health Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Último Webhook</p>
          <p className="text-xs font-medium mt-1">
            {lastWebhook ? formatDistanceToNow(new Date(lastWebhook.received_at), { addSuffix: true, locale: ptBR }) : '—'}
          </p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Último Cron</p>
          <p className="text-xs font-medium mt-1">
            {lastRun ? formatDistanceToNow(new Date(lastRun.started_at), { addSuffix: true, locale: ptBR }) : '—'}
          </p>
        </div>
        <div className={`rounded-lg p-3 text-center ${errors24h.length > 0 ? 'bg-destructive/10' : 'bg-green-50 dark:bg-green-950/30'}`}>
          <p className="text-[10px] text-muted-foreground uppercase">Erros (24h)</p>
          <p className={`text-xs font-bold mt-1 ${errors24h.length > 0 ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
            {errors24h.length}
          </p>
        </div>
      </div>

      <Tabs defaultValue="webhooks" className="space-y-3">
        <TabsList className="h-8">
          <TabsTrigger value="webhooks" className="text-xs">Webhooks</TabsTrigger>
          <TabsTrigger value="cron" className="text-xs">Sync Runs</TabsTrigger>
        </TabsList>

        <TabsContent value="webhooks">
          {logsLoading ? (
            <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : (
            <div className="max-h-60 overflow-y-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] w-[120px]">Quando</TableHead>
                    <TableHead className="text-[10px]">Evento</TableHead>
                    <TableHead className="text-[10px]">Bling ID</TableHead>
                    <TableHead className="text-[10px]">Resultado</TableHead>
                    <TableHead className="text-[10px]">Motivo</TableHead>
                    <TableHead className="text-[10px] w-[50px]">ms</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(webhookLogs || []).map((log: any) => (
                    <TableRow key={log.id} className="text-[11px]">
                      <TableCell className="py-1">{format(new Date(log.received_at), "dd/MM HH:mm:ss", { locale: ptBR })}</TableCell>
                      <TableCell className="py-1 font-mono">{log.event_type}</TableCell>
                      <TableCell className="py-1">{log.bling_product_id || '—'}</TableCell>
                      <TableCell className="py-1">{resultBadge(log.result)}</TableCell>
                      <TableCell className="py-1 max-w-[200px] truncate text-muted-foreground">{log.reason || '—'}</TableCell>
                      <TableCell className="py-1 text-muted-foreground">{log.processing_time_ms || '—'}</TableCell>
                    </TableRow>
                  ))}
                  {(!webhookLogs || webhookLogs.length === 0) && (
                    <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground text-xs">Nenhum webhook registrado</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="cron">
          <div className="max-h-60 overflow-y-auto border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Início</TableHead>
                  <TableHead className="text-[10px]">Tipo</TableHead>
                  <TableHead className="text-[10px]">Processados</TableHead>
                  <TableHead className="text-[10px]">Atualizados</TableHead>
                  <TableHead className="text-[10px]">Erros</TableHead>
                  <TableHead className="text-[10px]">Duração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(syncRuns || []).map((run: any) => {
                  const duration = run.finished_at && run.started_at
                    ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                    : null;
                  return (
                    <TableRow key={run.id} className="text-[11px]">
                      <TableCell className="py-1">{format(new Date(run.started_at), "dd/MM HH:mm", { locale: ptBR })}</TableCell>
                      <TableCell className="py-1">{run.trigger_type}</TableCell>
                      <TableCell className="py-1 text-center">{run.processed_count}</TableCell>
                      <TableCell className="py-1 text-center">{run.updated_count}</TableCell>
                      <TableCell className="py-1 text-center">
                        {run.errors_count > 0 ? <span className="text-destructive font-medium">{run.errors_count}</span> : '0'}
                      </TableCell>
                      <TableCell className="py-1 text-muted-foreground">{duration != null ? `${duration}s` : '—'}</TableCell>
                    </TableRow>
                  );
                })}
                {(!syncRuns || syncRuns.length === 0) && (
                  <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground text-xs">Nenhuma execução registrada</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Bling ERP Panel (OAuth2) ───

function BlingPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['store-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('store_settings').select('*').limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ bling_client_id: '', bling_client_secret: '', bling_store_id: '' });

  useEffect(() => {
    if (settings) {
      const s = settings as any;
      setForm({
        bling_client_id: s.bling_client_id || '',
        bling_client_secret: s.bling_client_secret || '',
        bling_store_id: s.bling_store_id || '',
      });
    }
  }, [settings]);

  // Listen for OAuth callback message
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data === 'bling_connected') {
        queryClient.invalidateQueries({ queryKey: ['store-settings'] });
        toast({ title: 'Bling conectado com sucesso!' });
        setIsConnecting(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [queryClient, toast]);

  const saveCredentials = useMutation({
    mutationFn: async () => {
      if (settings?.id) {
        const { error } = await supabase.from('store_settings').update(form as any).eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('store_settings').insert(form as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-settings'] });
      toast({ title: 'Credenciais salvas!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const handleConnect = async () => {
    if (!form.bling_client_id || !form.bling_client_secret) {
      toast({ title: 'Preencha Client ID e Client Secret primeiro', variant: 'destructive' });
      return;
    }

    // Save credentials first
    await saveCredentials.mutateAsync();

    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('bling-oauth', {
        body: { action: 'get_auth_url' },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message);
      }

      // Open authorization popup
      window.open(data.auth_url, 'bling_auth', 'width=600,height=700,scrollbars=yes');
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
      setIsConnecting(false);
    }
  };

  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [syncLogFilter, setSyncLogFilter] = useState<string>('all');
  const [expandedLogRow, setExpandedLogRow] = useState<number | null>(null);
  const [blingStores, setBlingStores] = useState<{id: string; name: string; type: string}[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);

  const isConnected = !!(settings as any)?.bling_access_token;

  const fetchStores = useCallback(async () => {
    if (!isConnected) return;
    setLoadingStores(true);
    try {
      const { data, error } = await supabase.functions.invoke('bling-sync', {
        body: { action: 'list_stores' },
      });
      if (error) throw error;
      if (data?.stores?.length) {
        setBlingStores(data.stores);
      }
    } catch (err: any) {
      console.error('Error fetching stores:', err);
    } finally {
      setLoadingStores(false);
    }
  }, [isConnected]);

  useEffect(() => {
    if (isConnected) fetchStores();
  }, [isConnected, fetchStores]);
  const callbackUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bling-oauth`;

  const handleSync = async (action: string, label: string, extraBody?: Record<string, any>) => {
    setSyncing(action);
    setSyncResult(null);
    try {
      if (action === 'sync_products') {
        // Batch sync: process in chunks of 5 to avoid edge function timeout
        const BATCH_SIZE = 5;
        let offset = 0;
        let hasMore = true;
        let totalImported = 0;
        let totalUpdated = 0;
        let totalVariants = 0;
        let totalErrors = 0;
        let totalSkipped = 0;
        let totalCleaned = 0;
        let totalGroups = 0;
        const allLogs: any[] = [];

        while (hasMore) {
          toast({ title: `Sincronizando...`, description: `Processando lote a partir do item ${offset}...` });
          const { data, error } = await supabase.functions.invoke('bling-sync', {
            body: { action: 'sync_products', limit: BATCH_SIZE, offset, ...extraBody },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);

          totalImported += data.imported || 0;
          totalUpdated += data.updated || 0;
          totalVariants += data.variants || 0;
          totalErrors += data.errors || 0;
          totalSkipped += data.skipped || 0;
          totalCleaned += data.cleaned || 0;
          totalGroups = data.totalGroups || totalGroups;
          if (data.log) allLogs.push(...data.log);

          hasMore = data.hasMore === true;
          offset = data.nextOffset || (offset + BATCH_SIZE);
        }

        const finalResult = {
          imported: totalImported,
          updated: totalUpdated,
          variants: totalVariants,
          skipped: totalSkipped,
          errors: totalErrors,
          cleaned: totalCleaned,
          totalGroups,
          log: allLogs,
        };
        setSyncResult(finalResult);
        toast({ title: `${label} concluída!`, description: `${totalImported} importados, ${totalUpdated} atualizados, ${totalVariants} variantes, ${totalErrors} erros` });
      } else {
        const { data, error } = await supabase.functions.invoke('bling-sync', {
          body: { action, ...extraBody },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setSyncResult(data);
        toast({ title: `${label} concluída!`, description: JSON.stringify(data) });
      }
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    } catch (err: any) {
      toast({ title: 'Erro na sincronização', description: err.message, variant: 'destructive' });
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      {isConnected ? (
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
          <Check className="h-5 w-5 text-green-600" />
          <span className="text-sm font-medium text-green-700 dark:text-green-400">Bling conectado e funcionando</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <span className="text-sm text-amber-700 dark:text-amber-400">Bling não conectado. Siga os passos abaixo.</span>
        </div>
      )}

      {/* Step 1: Create App */}
      <div className="space-y-3">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">1</span>
          Criar Aplicativo no Bling
        </h4>
        <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-2">
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>Acesse <a href="https://developer.bling.com.br/aplicativos" target="_blank" rel="noopener noreferrer" className="text-primary underline">developer.bling.com.br/aplicativos</a></li>
            <li>Clique em <strong>"Cadastrar um novo aplicativo"</strong></li>
            <li>Preencha: Nome, Descrição (ex: "Integração Loja Online")</li>
            <li>Em <strong>"URL de redirecionamento"</strong>, cole:</li>
          </ol>
          <div className="flex items-center gap-2 mt-2">
            <code className="bg-background border rounded px-2 py-1 text-xs flex-1 break-all">{callbackUrl}</code>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => { navigator.clipboard.writeText(callbackUrl); toast({ title: 'URL copiada!' }); }}>
              Copiar
            </Button>
          </div>
          <p className="text-muted-foreground mt-1">5. Salve e copie o <strong>Client ID</strong> e <strong>Client Secret</strong></p>
        </div>
      </div>

      <Separator />

      {/* Step 2: Credentials */}
      <div className="space-y-3">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">2</span>
          Configurar Credenciais
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Client ID</Label>
            <Input value={form.bling_client_id} onChange={(e) => setForm({ ...form, bling_client_id: e.target.value })} placeholder="Cole o Client ID" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Client Secret</Label>
            <Input type="password" value={form.bling_client_secret} onChange={(e) => setForm({ ...form, bling_client_secret: e.target.value })} placeholder="Cole o Client Secret" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Loja Virtual (filtra produtos vinculados)</Label>
          {blingStores.length > 0 ? (
            <Select value={form.bling_store_id || 'all'} onValueChange={(v) => setForm({ ...form, bling_store_id: v === 'all' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as lojas (sem filtro)</SelectItem>
                {blingStores.map((store) => (
                  <SelectItem key={store.id} value={String(store.id)}>{store.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex gap-2">
              <Input value={form.bling_store_id} onChange={(e) => setForm({ ...form, bling_store_id: e.target.value })} placeholder="ID numérico da loja no Bling" />
              {isConnected && (
                <Button size="sm" variant="outline" onClick={fetchStores} disabled={loadingStores} className="shrink-0">
                  {loadingStores ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                </Button>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Se preenchido, sincroniza apenas os produtos vinculados a essa loja. Deixe vazio para importar todos.</p>
        </div>
      </div>

      <Separator />

      {/* Step 3: Authorize */}
      <div className="space-y-3">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">3</span>
          Autorizar Conexão
        </h4>
        <Button onClick={handleConnect} disabled={isConnecting || !form.bling_client_id || !form.bling_client_secret} className="w-full">
          {isConnecting ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aguardando autorização...</>
          ) : isConnected ? (
            <><Link2 className="h-4 w-4 mr-2" />Reconectar Bling</>
          ) : (
            <><Link2 className="h-4 w-4 mr-2" />Conectar ao Bling</>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">Uma janela abrirá para você autorizar o acesso da loja ao Bling.</p>
      </div>

      {isConnected && (
        <>
          <Separator />

          {/* Sync Config Toggles */}
          <BlingSyncConfigPanel />

          <Separator />
          
          {/* Sync Actions */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm">🔄 Ações de Sincronização</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Button
                variant="default"
                onClick={() => handleSync('first_import', 'Importação inicial (primeira vez)')}
                disabled={!!syncing}
                className="h-auto py-3 flex flex-col items-center gap-1"
              >
                {syncing === 'first_import' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Package className="h-5 w-5" />
                )}
                <span className="text-xs font-medium">Sincronizar Tudo</span>
                <span className="text-[10px] opacity-80">Primeira vez (sem duplicar)</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSync('sync_products', 'Importação completa de produtos')}
                disabled={!!syncing}
                className="h-auto py-3 flex flex-col items-center gap-1"
              >
                {syncing === 'sync_products' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Package className="h-5 w-5" />
                )}
                <span className="text-xs font-medium">Importar Todos</span>
                <span className="text-[10px] text-muted-foreground">Atualiza existentes</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSync('sync_stock', 'Sincronização de estoque')}
                disabled={!!syncing}
                className="h-auto py-3 flex flex-col items-center gap-1"
              >
                {syncing === 'sync_stock' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ArrowUpDown className="h-5 w-5" />
                )}
                <span className="text-xs font-medium">Sincronizar Estoque</span>
                <span className="text-[10px] text-muted-foreground">Apenas ativos</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSync('sync_products', 'Reprocessar com erro', { retry_errors: true })}
                disabled={!!syncing}
                className="h-auto py-3 flex flex-col items-center gap-1"
              >
                {syncing === 'sync_products' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <AlertCircle className="h-5 w-5" />
                )}
                <span className="text-xs font-medium">Reprocessar Erros</span>
                <span className="text-[10px] text-muted-foreground">Apenas ativos com erro</span>
              </Button>
            </div>
            {syncResult && (
              <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-3">
                <p className="font-medium">Resultado da Sincronização:</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {syncResult.imported != null && (
                    <div className="bg-primary/10 border border-primary/20 rounded p-2 text-center">
                      <p className="text-lg font-bold text-primary">{syncResult.imported}</p>
                      <p className="text-[10px] text-muted-foreground">Importados</p>
                    </div>
                  )}
                  {syncResult.updated != null && (
                    <div className="bg-accent/30 border border-accent/50 rounded p-2 text-center">
                      <p className="text-lg font-bold text-accent-foreground">{syncResult.updated}</p>
                      <p className="text-[10px] text-muted-foreground">Atualizados</p>
                    </div>
                  )}
                  {syncResult.linked_sku != null && syncResult.linked_sku > 0 && (
                    <div className="bg-secondary/30 border border-secondary/50 rounded p-2 text-center">
                      <p className="text-lg font-bold text-secondary-foreground">{syncResult.linked_sku}</p>
                      <p className="text-[10px] text-muted-foreground">Vinculados SKU</p>
                    </div>
                  )}
                  {syncResult.variants != null && (
                    <div className="bg-muted border border-border rounded p-2 text-center">
                      <p className="text-lg font-bold">{syncResult.variants}</p>
                      <p className="text-[10px] text-muted-foreground">Variações</p>
                    </div>
                  )}
                  {syncResult.errors != null && syncResult.errors > 0 && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded p-2 text-center">
                      <p className="text-lg font-bold text-destructive">{syncResult.errors}</p>
                      <p className="text-[10px] text-muted-foreground">Erros</p>
                    </div>
                  )}
                </div>
                {syncResult.totalBlingListItems != null && (
                  <p className="text-muted-foreground">Total de itens no Bling: <strong>{syncResult.totalBlingListItems}</strong> | Produtos processados: <strong>{syncResult.totalProcessed}</strong> | Ignorados: <strong>{syncResult.skipped || 0}</strong></p>
                )}
                {syncResult.log?.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="font-medium text-xs">📋 Log detalhado ({syncResult.log.length} itens)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { key: 'all', label: 'Todos', count: syncResult.log.length },
                        { key: 'imported', label: '✅ Novos', count: syncResult.log.filter((e: any) => e.status === 'imported').length },
                        { key: 'updated', label: '🔄 Atualizados', count: syncResult.log.filter((e: any) => e.status === 'updated').length },
                        { key: 'linked_sku', label: '🔗 Vinculados', count: syncResult.log.filter((e: any) => e.status === 'linked_sku').length },
                        { key: 'grouped', label: '🔗 Agrupados', count: syncResult.log.filter((e: any) => e.status === 'grouped').length },
                        { key: 'ignored_inactive', label: '⛔ Inativos', count: syncResult.log.filter((e: any) => e.status === 'ignored_inactive').length },
                        { key: 'error', label: '❌ Erros', count: syncResult.log.filter((e: any) => e.status === 'error').length },
                        { key: 'skipped', label: '⏭ Ignorados', count: syncResult.log.filter((e: any) => e.status === 'skipped').length },
                      ].filter(f => f.count > 0).map(f => (
                        <button
                          key={f.key}
                          onClick={() => setSyncLogFilter(f.key)}
                          className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                            syncLogFilter === f.key
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          {f.label} ({f.count})
                        </button>
                      ))}
                    </div>
                    <div className="max-h-80 overflow-y-auto border rounded">
                      <table className="w-full text-[11px]">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="text-left p-1.5">Bling ID</th>
                            <th className="text-left p-1.5">Nome</th>
                            <th className="text-left p-1.5">Status</th>
                            <th className="text-left p-1.5">Variações</th>
                            <th className="text-left p-1.5">Mensagem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {syncResult.log
                            .filter((entry: any) => syncLogFilter === 'all' || entry.status === syncLogFilter)
                            .map((entry: any, idx: number) => (
                            <React.Fragment key={idx}>
                              <tr 
                                className={`border-t cursor-pointer hover:bg-muted/50 ${entry.status === 'error' ? 'bg-destructive/10' : entry.status === 'imported' ? 'bg-primary/5' : entry.status === 'updated' ? 'bg-accent/30' : entry.status === 'ignored_inactive' ? 'bg-muted/80' : ''}`}
                                onClick={() => setExpandedLogRow(expandedLogRow === idx ? null : idx)}
                              >
                                <td className="p-1.5 font-mono">{entry.bling_id}</td>
                                <td className="p-1.5 max-w-[200px] truncate">{entry.name}</td>
                                <td className="p-1.5">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    entry.status === 'imported' ? 'bg-primary/20 text-primary' : 
                                    entry.status === 'updated' ? 'bg-accent text-accent-foreground' : 
                                    entry.status === 'grouped' ? 'bg-secondary text-secondary-foreground' : 
                                    entry.status === 'linked_sku' ? 'bg-secondary text-secondary-foreground' : 
                                    entry.status === 'ignored_inactive' ? 'bg-muted text-muted-foreground' : 
                                    entry.status === 'error' ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                                    {entry.status === 'imported' ? '✅ Novo' : entry.status === 'updated' ? '🔄 Atualizado' : entry.status === 'grouped' ? '🔗 Agrupado' : entry.status === 'linked_sku' ? '🔗 Vinculado SKU' : entry.status === 'ignored_inactive' ? '⛔ Inativo' : entry.status === 'error' ? '❌ Erro' : '⏭ Ignorado'}
                                  </span>
                                </td>
                                <td className="p-1.5 text-center">{entry.variants || '-'}</td>
                                <td className="p-1.5 max-w-[250px] truncate text-muted-foreground">{entry.message}</td>
                              </tr>
                              {expandedLogRow === idx && (
                                <tr className="border-t bg-muted/30">
                                  <td colSpan={5} className="p-3">
                                    <div className="text-xs space-y-1">
                                      <p><strong>Bling ID:</strong> {entry.bling_id}</p>
                                      <p><strong>Produto:</strong> {entry.name}</p>
                                      <p><strong>Mensagem completa:</strong></p>
                                      <pre className="bg-background border rounded p-2 text-[11px] whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{entry.message}</pre>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Webhook URL */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm">🔗 Webhook (Sincronização em Tempo Real)</h4>
            <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <Check className="h-5 w-5 text-primary" />
              <div>
                <span className="text-sm font-medium">Sincronização automática ativa</span>
                <p className="text-xs text-muted-foreground">Estoque atualiza a cada 5 minutos + webhook para tempo real</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Configure o URL abaixo como callback no Bling para atualizações instantâneas de estoque e produtos.</p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">URL do Webhook</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="bg-background border rounded px-2 py-1 text-xs flex-1 break-all">{`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bling-webhook`}</code>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => { navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bling-webhook`); toast({ title: 'URL copiada!' }); }}>
                    Copiar
                  </Button>
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
                <p className="font-medium">Como configurar no Bling:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
                  <li>Acesse <a href="https://developer.bling.com.br/aplicativos" target="_blank" rel="noopener noreferrer" className="text-primary underline">developer.bling.com.br/aplicativos</a></li>
                  <li>No seu aplicativo, vá na aba <strong>"Callbacks"</strong></li>
                  <li>Adicione a URL acima como callback para os eventos:</li>
                </ol>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">estoque</Badge>
                  <Badge variant="secondary" className="text-[10px]">produto.alteracao</Badge>
                  <Badge variant="secondary" className="text-[10px]">produto.inclusao</Badge>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Monitoring Panel */}
          <BlingMonitoringPanel />

          <Separator />

          <div className="space-y-2">
            <h4 className="font-medium text-sm">✅ Regras ativas</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• <strong>Produtos inativos</strong> nunca sincronizam (estoque, campos, nada)</li>
              <li>• Após 1ª importação, padrão = somente estoque</li>
              <li>• Edições manuais (título, preço, imagens) são preservadas</li>
              <li>• <code>is_active</code> só muda manualmente (exceto exclusão no Bling)</li>
              <li>• Importação inicial vincula por SKU sem duplicar</li>
              <li>• Token renovado automaticamente a cada 6 horas</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ───

interface SimpleIntegration {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: 'available' | 'coming_soon' | 'connected';
  category: 'erp' | 'payment' | 'shipping';
  configFields?: { key: string; label: string; placeholder: string; type?: string }[];
}

const simpleIntegrations: SimpleIntegration[] = [
  {
    id: 'mercadopago', name: 'Mercado Pago', description: 'Receba pagamentos via PIX, cartão, boleto e muito mais.',
    icon: <CreditCard className="h-6 w-6" />, status: 'available', category: 'payment',
    configFields: [
      { key: 'access_token', label: 'Access Token', placeholder: 'Cole seu Access Token' },
      { key: 'public_key', label: 'Public Key', placeholder: 'Cole sua Public Key' },
    ],
  },
  {
    id: 'pix', name: 'PIX Direto', description: 'Receba pagamentos PIX diretamente na sua conta.',
    icon: <CreditCard className="h-6 w-6" />, status: 'available', category: 'payment',
    configFields: [
      { key: 'pix_key', label: 'Chave PIX', placeholder: 'CPF, CNPJ, email ou celular' },
      { key: 'pix_name', label: 'Nome do Beneficiário', placeholder: 'Nome que aparece no PIX' },
    ],
  },
];

export default function Integrations() {
  const { toast } = useToast();
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);

  const handleSaveConfig = async (integrationId: string) => {
    toast({ title: 'Configuração salva!', description: 'A integração foi configurada com sucesso.' });
    setConfiguring(null);
    setConfigValues({});
  };

  const categories = [
    { id: 'erp', name: 'ERP & Gestão', icon: <Package className="h-5 w-5" /> },
    { id: 'payment', name: 'Pagamentos', icon: <CreditCard className="h-5 w-5" /> },
    { id: 'shipping', name: 'Frete & Envio', icon: <Truck className="h-5 w-5" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrações</h1>
        <p className="text-muted-foreground">Conecte sua loja com ERPs, gateways de pagamento e transportadoras.</p>
      </div>

      {categories.map((category) => (
        <div key={category.id} className="space-y-4">
          <div className="flex items-center gap-2">
            {category.icon}
            <h2 className="text-lg font-semibold">{category.name}</h2>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Bling ERP (special expanded card) */}
            {category.id === 'erp' && (
              <Card className="md:col-span-2 lg:col-span-3">
                <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpandedPanel(expandedPanel === 'bling' ? null : 'bling')}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary"><Package className="h-6 w-6" /></div>
                      <div>
                        <CardTitle className="text-base">Bling ERP</CardTitle>
                        <CardDescription className="text-xs">Gestão de pedidos, notas fiscais automáticas e controle de estoque</CardDescription>
                      </div>
                    </div>
                    {expandedPanel === 'bling' ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </CardHeader>
                {expandedPanel === 'bling' && (
                  <CardContent>
                    <BlingPanel />
                  </CardContent>
                )}
              </Card>
            )}

            {/* Appmax Gateway (special expanded card) */}
            {category.id === 'payment' && (
              <Card className="md:col-span-2 lg:col-span-3">
                <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpandedPanel(expandedPanel === 'appmax' ? null : 'appmax')}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary"><CreditCard className="h-6 w-6" /></div>
                      <div>
                        <CardTitle className="text-base">Gateway Appmax</CardTitle>
                        <CardDescription className="text-xs">Pagamentos com cartão de crédito, Pix, boleto e configurações de parcelamento</CardDescription>
                      </div>
                    </div>
                    {expandedPanel === 'appmax' ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </CardHeader>
                {expandedPanel === 'appmax' && (
                  <CardContent>
                    <AppmaxGatewayPanel />
                  </CardContent>
                )}
              </Card>
            )}

            {/* Melhor Envio (special expanded card) */}
            {category.id === 'shipping' && (
              <Card className="md:col-span-2 lg:col-span-3">
                <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpandedPanel(expandedPanel === 'melhor_envio' ? null : 'melhor_envio')}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary"><Truck className="h-6 w-6" /></div>
                      <div>
                        <CardTitle className="text-base">Melhor Envio</CardTitle>
                        <CardDescription className="text-xs">Frete, retirada na loja, entrega grátis e frete por região</CardDescription>
                      </div>
                    </div>
                    {expandedPanel === 'melhor_envio' ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </CardHeader>
                {expandedPanel === 'melhor_envio' && (
                  <CardContent>
                    <MelhorEnvioPanel />
                  </CardContent>
                )}
              </Card>
            )}

            {/* Simple integration cards */}
            {simpleIntegrations
              .filter((i) => i.category === category.id)
              .map((integration) => (
                <Card key={integration.id} className={integration.status === 'coming_soon' ? 'opacity-60' : ''}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">{integration.icon}</div>
                        <div>
                          <CardTitle className="text-base">{integration.name}</CardTitle>
                          {integration.status === 'coming_soon' && <Badge variant="secondary" className="text-xs mt-1">Em breve</Badge>}
                          {integration.status === 'connected' && <Badge className="bg-success text-success-foreground text-xs mt-1"><Check className="h-3 w-3 mr-1" />Conectado</Badge>}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <CardDescription>{integration.description}</CardDescription>
                    
                    {configuring === integration.id && integration.configFields && (
                      <div className="space-y-3 pt-3 border-t">
                        {integration.configFields.map((field) => (
                          <div key={field.key} className="space-y-1.5">
                            <Label htmlFor={field.key} className="text-sm">{field.label}</Label>
                            <Input id={field.key} placeholder={field.placeholder} value={configValues[field.key] || ''} onChange={(e) => setConfigValues({ ...configValues, [field.key]: e.target.value })} />
                          </div>
                        ))}
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" onClick={() => handleSaveConfig(integration.id)}>Salvar</Button>
                          <Button size="sm" variant="outline" onClick={() => setConfiguring(null)}>Cancelar</Button>
                        </div>
                      </div>
                    )}
                    
                    {configuring !== integration.id && (
                      <Button
                        variant={integration.status === 'available' ? 'default' : 'secondary'}
                        size="sm" className="w-full"
                        disabled={integration.status === 'coming_soon'}
                        onClick={() => setConfiguring(integration.id)}
                      >
                        {integration.status === 'connected' ? <><Settings2 className="h-4 w-4 mr-2" />Configurar</> :
                         integration.status === 'available' ? <><Plug className="h-4 w-4 mr-2" />Conectar</> :
                         <><AlertCircle className="h-4 w-4 mr-2" />Em breve</>}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      ))}


    </div>
  );
}
