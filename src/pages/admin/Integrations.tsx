import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ExternalLink, Check, AlertCircle, Settings2, Plug, CreditCard, Package, Truck, ChevronDown, ChevronUp, Plus, Trash2, MapPin, Store, Link2, Loader2, ArrowUpDown, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
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

// ─── Rede Gateway Panel ───

function RedeGatewayPanel() {
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
    rede_merchant_id: '',
    rede_merchant_key: '',
    rede_environment: 'sandbox',
    pix_discount: 5,
    cash_discount: 5,
    max_installments: 6,
    installments_without_interest: 3,
    installment_interest_rate: 0,
    min_installment_value: 30,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        rede_merchant_id: (settings as any).rede_merchant_id || '',
        rede_merchant_key: (settings as any).rede_merchant_key || '',
        rede_environment: (settings as any).rede_environment || 'sandbox',
        pix_discount: (settings as any).pix_discount ?? 5,
        cash_discount: (settings as any).cash_discount ?? 5,
        max_installments: (settings as any).max_installments || 6,
        installments_without_interest: (settings as any).installments_without_interest ?? 3,
        installment_interest_rate: (settings as any).installment_interest_rate ?? 0,
        min_installment_value: (settings as any).min_installment_value ?? 30,
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
      toast({ title: 'Configurações da Rede salvas!' });
    },
    onError: (e: any) => toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6">
      {/* Credentials */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm">Credenciais</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Merchant ID (PV)</Label>
            <Input value={form.rede_merchant_id} onChange={(e) => setForm({ ...form, rede_merchant_id: e.target.value })} placeholder="Seu PV" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Chave de Integração</Label>
            <Input type="password" value={form.rede_merchant_key} onChange={(e) => setForm({ ...form, rede_merchant_key: e.target.value })} placeholder="Token" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Ambiente</Label>
          <Select value={form.rede_environment} onValueChange={(v) => setForm({ ...form, rede_environment: v })}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">Sandbox (Teste)</SelectItem>
              <SelectItem value="production">Produção</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Payment options */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm">Opções de Pagamento</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Desconto no Pix (%)</Label>
            <Input type="number" step="0.1" value={form.pix_discount} onChange={(e) => setForm({ ...form, pix_discount: parseFloat(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Desconto à Vista (%)</Label>
            <Input type="number" step="0.1" value={form.cash_discount} onChange={(e) => setForm({ ...form, cash_discount: parseFloat(e.target.value) })} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Máx. Parcelas</Label>
            <Input type="number" value={form.max_installments} onChange={(e) => setForm({ ...form, max_installments: parseInt(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Parcelas s/ Juros</Label>
            <Input type="number" value={form.installments_without_interest} onChange={(e) => setForm({ ...form, installments_without_interest: parseInt(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Juros (%/mês)</Label>
            <Input type="number" step="0.01" value={form.installment_interest_rate} onChange={(e) => setForm({ ...form, installment_interest_rate: parseFloat(e.target.value) })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Valor mínimo da parcela (R$)</Label>
          <Input type="number" step="0.01" value={form.min_installment_value} onChange={(e) => setForm({ ...form, min_installment_value: parseFloat(e.target.value) })} className="w-[200px]" />
        </div>
      </div>

      <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
        <p className="font-medium">Como obter suas credenciais:</p>
        <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
          <li>Acesse <a href="https://meu.userede.com.br" target="_blank" rel="noopener noreferrer" className="text-primary underline">meu.userede.com.br</a></li>
          <li>Vá em "e-Rede" → "Chave de Integração"</li>
          <li>Gere ou copie seu token e PV</li>
        </ol>
      </div>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
        {saveMutation.isPending ? 'Salvando...' : 'Salvar Configurações Rede'}
      </Button>
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

  const handleSync = async (action: string, label: string) => {
    setSyncing(action);
    setSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('bling-sync', {
        body: { action },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSyncResult(data);
      toast({ title: `${label} concluída!`, description: JSON.stringify(data) });
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
        <div className="grid grid-cols-2 gap-4">
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
          
          {/* Sync Actions */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm">🔄 Sincronização</h4>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => handleSync('sync_products', 'Importação de produtos')}
                disabled={!!syncing}
                className="h-auto py-3 flex flex-col items-center gap-1"
              >
                {syncing === 'sync_products' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Package className="h-5 w-5" />
                )}
                <span className="text-xs font-medium">Importar Produtos</span>
                <span className="text-[10px] text-muted-foreground">Bling → Loja</span>
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
                <span className="text-[10px] text-muted-foreground">Bling → Loja</span>
              </Button>
            </div>
            {syncResult && (
              <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-3">
                <p className="font-medium">Resultado da Sincronização:</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {syncResult.imported != null && (
                    <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded p-2 text-center">
                      <p className="text-lg font-bold text-green-700 dark:text-green-400">{syncResult.imported}</p>
                      <p className="text-[10px] text-green-600 dark:text-green-500">Importados</p>
                    </div>
                  )}
                  {syncResult.updated != null && (
                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded p-2 text-center">
                      <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{syncResult.updated}</p>
                      <p className="text-[10px] text-blue-600 dark:text-blue-500">Atualizados</p>
                    </div>
                  )}
                  {syncResult.variants != null && (
                    <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded p-2 text-center">
                      <p className="text-lg font-bold text-purple-700 dark:text-purple-400">{syncResult.variants}</p>
                      <p className="text-[10px] text-purple-600 dark:text-purple-500">Variações</p>
                    </div>
                  )}
                  {syncResult.errors != null && syncResult.errors > 0 && (
                    <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded p-2 text-center">
                      <p className="text-lg font-bold text-red-700 dark:text-red-400">{syncResult.errors}</p>
                      <p className="text-[10px] text-red-600 dark:text-red-500">Erros</p>
                    </div>
                  )}
                </div>
                {syncResult.totalBlingListItems != null && (
                  <p className="text-muted-foreground">Total de itens no Bling: <strong>{syncResult.totalBlingListItems}</strong> | Produtos processados: <strong>{syncResult.totalProcessed}</strong> | Ignorados (variações): <strong>{syncResult.skipped || 0}</strong> | Limpos: <strong>{syncResult.cleaned || 0}</strong></p>
                )}
                {syncResult.log?.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="font-medium text-xs">📋 Log detalhado ({syncResult.log.length} itens)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { key: 'all', label: 'Todos', count: syncResult.log.length },
                        { key: 'imported', label: '✅ Novos', count: syncResult.log.filter((e: any) => e.status === 'imported').length },
                        { key: 'updated', label: '🔄 Atualizados', count: syncResult.log.filter((e: any) => e.status === 'updated').length },
                        { key: 'grouped', label: '🔗 Agrupados', count: syncResult.log.filter((e: any) => e.status === 'grouped').length },
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
                            <tr key={idx} className={`border-t ${entry.status === 'error' ? 'bg-destructive/10' : entry.status === 'imported' ? 'bg-primary/5' : entry.status === 'updated' ? 'bg-accent/30' : ''}`}>
                              <td className="p-1.5 font-mono">{entry.bling_id}</td>
                              <td className="p-1.5 max-w-[200px] truncate">{entry.name}</td>
                              <td className="p-1.5">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${entry.status === 'imported' ? 'bg-primary/20 text-primary' : entry.status === 'updated' ? 'bg-accent text-accent-foreground' : entry.status === 'grouped' ? 'bg-secondary text-secondary-foreground' : entry.status === 'error' ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                                  {entry.status === 'imported' ? '✅ Novo' : entry.status === 'updated' ? '🔄 Atualizado' : entry.status === 'grouped' ? '🔗 Agrupado' : entry.status === 'error' ? '❌ Erro' : '⏭ Ignorado'}
                                </span>
                              </td>
                              <td className="p-1.5 text-center">{entry.variants || '-'}</td>
                              <td className="p-1.5 max-w-[250px] truncate text-muted-foreground">{entry.message}</td>
                            </tr>
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
            <h4 className="font-medium text-sm">🔗 Webhook (Atualização automática)</h4>
            <p className="text-xs text-muted-foreground">Configure este URL como callback no Bling para receber atualizações de estoque em tempo real.</p>
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
                  <li>Acesse <strong>Meu Negócio → Preferências → Callbacks</strong> no Bling</li>
                  <li>Ou acesse <a href="https://developer.bling.com.br/aplicativos" target="_blank" rel="noopener noreferrer" className="text-primary underline">developer.bling.com.br/aplicativos</a></li>
                  <li>No seu aplicativo, vá na aba <strong>"Callbacks"</strong></li>
                  <li>Adicione a URL acima como callback para os eventos: <strong>estoque</strong></li>
                  <li>Método: <strong>POST</strong></li>
                </ol>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <h4 className="font-medium text-sm">✅ Funcionalidades ativas</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Importar produtos do Bling com fotos, variantes e estoque</li>
              <li>• Filtro por loja virtual (sincroniza apenas produtos vinculados)</li>
              <li>• Webhook para atualização de estoque em tempo real</li>
              <li>• Pedidos da loja são enviados automaticamente ao Bling</li>
              <li>• NF-e é gerada e transmitida à SEFAZ automaticamente</li>
              <li>• O token é renovado automaticamente a cada 6 horas</li>
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
    id: 'tiny', name: 'Tiny ERP', description: 'Sistema de gestão empresarial com emissão de NF-e.',
    icon: <Package className="h-6 w-6" />, status: 'coming_soon', category: 'erp',
  },
  {
    id: 'omie', name: 'Omie', description: 'ERP online com gestão financeira e contábil integrada.',
    icon: <Package className="h-6 w-6" />, status: 'coming_soon', category: 'erp',
  },
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
  {
    id: 'pagseguro', name: 'PagSeguro', description: 'Gateway de pagamentos com checkout transparente.',
    icon: <CreditCard className="h-6 w-6" />, status: 'coming_soon', category: 'payment',
  },
  {
    id: 'stripe', name: 'Stripe', description: 'Plataforma de pagamentos global para internet.',
    icon: <CreditCard className="h-6 w-6" />, status: 'coming_soon', category: 'payment',
  },
  {
    id: 'correios', name: 'Correios', description: 'Integração direta com os Correios para cálculo de frete.',
    icon: <Truck className="h-6 w-6" />, status: 'coming_soon', category: 'shipping',
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

            {/* Rede Gateway (special expanded card) */}
            {category.id === 'payment' && (
              <Card className="md:col-span-2 lg:col-span-3">
                <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpandedPanel(expandedPanel === 'rede' ? null : 'rede')}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary"><CreditCard className="h-6 w-6" /></div>
                      <div>
                        <CardTitle className="text-base">Gateway Rede (e-Rede)</CardTitle>
                        <CardDescription className="text-xs">Pagamentos com cartão de crédito, débito, Pix e configurações de parcelamento</CardDescription>
                      </div>
                    </div>
                    {expandedPanel === 'rede' ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </CardHeader>
                {expandedPanel === 'rede' && (
                  <CardContent>
                    <RedeGatewayPanel />
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

      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-full"><ExternalLink className="h-6 w-6 text-primary" /></div>
            <div>
              <h3 className="font-semibold mb-1">Precisa de outra integração?</h3>
              <p className="text-sm text-muted-foreground mb-3">Entre em contato para solicitar novas integrações.</p>
              <Button variant="outline" size="sm" asChild>
                <a href="https://wa.me/5542991120205?text=Olá, preciso de uma integração personalizada" target="_blank" rel="noopener noreferrer">Solicitar Integração</a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
