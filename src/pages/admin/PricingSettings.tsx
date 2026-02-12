import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, Percent, Calculator, Save, Info, Plus, Trash2, ShieldCheck } from 'lucide-react';
import { HelpHint } from '@/components/HelpHint';
import { invalidatePricingCache, getInstallmentOptions, formatCurrency, type PricingConfig } from '@/lib/pricingEngine';

interface RateEntry {
  installment: number;
  rate: number;
}

export default function PricingSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: config, isLoading } = useQuery({
    queryKey: ['pricing-config-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_pricing_config' as any)
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [form, setForm] = useState({
    max_installments: 12,
    interest_free_installments: 3,
    card_cash_rate: 0,
    pix_discount: 5,
    cash_discount: 5,
    interest_mode: 'fixed' as 'fixed' | 'by_installment',
    monthly_rate_fixed: 0,
    min_installment_value: 25,
    rounding_mode: 'adjust_last',
    transparent_checkout_fee_enabled: false,
    transparent_checkout_fee_percent: 0,
  });

  const [rateEntries, setRateEntries] = useState<RateEntry[]>([]);
  const [previewPrice, setPreviewPrice] = useState(299.9);

  useEffect(() => {
    if (config) {
      setForm({
        max_installments: config.max_installments || 12,
        interest_free_installments: config.interest_free_installments || 3,
        card_cash_rate: Number(config.card_cash_rate) || 0,
        pix_discount: Number(config.pix_discount) || 5,
        cash_discount: Number(config.cash_discount) || 5,
        interest_mode: config.interest_mode || 'fixed',
        monthly_rate_fixed: Number(config.monthly_rate_fixed) || 0,
        min_installment_value: Number(config.min_installment_value) || 25,
        rounding_mode: config.rounding_mode || 'adjust_last',
        transparent_checkout_fee_enabled: config.transparent_checkout_fee_enabled ?? false,
        transparent_checkout_fee_percent: Number(config.transparent_checkout_fee_percent) || 0,
      });

      // Parse rate entries from JSON
      const rates = config.monthly_rate_by_installment || {};
      const entries: RateEntry[] = Object.entries(rates).map(([k, v]) => ({
        installment: parseInt(k),
        rate: Number(v),
      })).sort((a, b) => a.installment - b.installment);
      setRateEntries(entries.length > 0 ? entries : []);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const monthly_rate_by_installment: Record<string, number> = {};
      rateEntries.forEach(e => {
        monthly_rate_by_installment[String(e.installment)] = e.rate;
      });

      const payload = {
        ...form,
        monthly_rate_by_installment,
      };

      // Get before state for audit
      const beforeData = config ? { ...config } : null;

      if (config?.id) {
        const { error } = await supabase
          .from('payment_pricing_config' as any)
          .update(payload as any)
          .eq('id', config.id);
        if (error) throw error;

        // Write audit log
        await supabase.from('payment_pricing_audit_log' as any).insert({
          config_id: config.id,
          before_data: beforeData,
          after_data: payload,
          changed_by: (await supabase.auth.getUser()).data.user?.id,
        } as any);
      } else {
        const { error } = await supabase
          .from('payment_pricing_config' as any)
          .insert({ ...payload, is_active: true } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidatePricingCache();
      queryClient.invalidateQueries({ queryKey: ['pricing-config'] });
      queryClient.invalidateQueries({ queryKey: ['pricing-config-admin'] });
      toast({ title: 'Configurações de preços salvas!' });
    },
    onError: (e: any) => toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' }),
  });

  const addRateEntry = () => {
    const nextInstallment = form.interest_free_installments + 1 + rateEntries.length;
    setRateEntries(prev => [...prev, { installment: nextInstallment, rate: 1.99 }]);
  };

  const removeRateEntry = (index: number) => {
    setRateEntries(prev => prev.filter((_, i) => i !== index));
  };

  // Build preview config
  const previewConfig: PricingConfig = {
    id: '',
    is_active: true,
    ...form,
    rounding_mode: form.rounding_mode as 'adjust_last' | 'truncate',
    monthly_rate_by_installment: Object.fromEntries(rateEntries.map(e => [String(e.installment), e.rate])),
  };
  const previewOptions = getInstallmentOptions(previewPrice, previewConfig);

  if (isLoading) return <div className="text-center py-8">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2">
          <CreditCard className="h-6 w-6" />
          Juros e Cartões
          <HelpHint helpKey="admin.pricing" />
        </h1>
        <p className="text-muted-foreground">Fonte única de verdade para parcelamento, juros e descontos de todo o site</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Config */}
        <div className="lg:col-span-2 space-y-6">
          {/* Descontos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Percent className="h-4 w-4" />
                Descontos à Vista
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Desconto PIX (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.pix_discount}
                    onChange={e => setForm(f => ({ ...f, pix_discount: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Desconto Boleto/À vista (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.cash_discount}
                    onChange={e => setForm(f => ({ ...f, cash_discount: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Parcelamento */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calculator className="h-4 w-4" />
                Parcelamento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Máx. Parcelas</Label>
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={form.max_installments}
                    onChange={e => setForm(f => ({ ...f, max_installments: parseInt(e.target.value) || 1 }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Parcelas sem juros</Label>
                  <Input
                    type="number"
                    min={0}
                    max={form.max_installments}
                    value={form.interest_free_installments}
                    onChange={e => setForm(f => ({ ...f, interest_free_installments: parseInt(e.target.value) || 0 }))}
                  />
                  <p className="text-[10px] text-muted-foreground">0 = todas com juros</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor mín. parcela (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.min_installment_value}
                    onChange={e => setForm(f => ({ ...f, min_installment_value: parseFloat(e.target.value) || 1 }))}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label className="text-xs">Juros do cartão à vista (1x) (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.card_cash_rate}
                  onChange={e => setForm(f => ({ ...f, card_cash_rate: parseFloat(e.target.value) || 0 }))}
                  className="w-[200px]"
                />
                <p className="text-[10px] text-muted-foreground">Ex: 1.99 para repassar taxa do gateway no crédito à vista. 0 = sem juros no 1x.</p>
              </div>

              <Separator />

              {/* Interest mode */}
              <div className="space-y-3">
                <Label className="text-xs font-medium">Modo de juros (parcelas com juros)</Label>
                <Select value={form.interest_mode} onValueChange={(v: 'fixed' | 'by_installment') => setForm(f => ({ ...f, interest_mode: v }))}>
                  <SelectTrigger className="w-[300px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Taxa fixa mensal (mesma para todas)</SelectItem>
                    <SelectItem value="by_installment">Taxa por parcela (tabela)</SelectItem>
                  </SelectContent>
                </Select>

                {form.interest_mode === 'fixed' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Taxa mensal fixa (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.monthly_rate_fixed}
                      onChange={e => setForm(f => ({ ...f, monthly_rate_fixed: parseFloat(e.target.value) || 0 }))}
                      className="w-[200px]"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Aplicado a partir da {form.interest_free_installments + 1}ª parcela. Ex: 2.49 = 2,49% a.m.
                    </p>
                  </div>
                )}

                {form.interest_mode === 'by_installment' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Defina a taxa mensal para cada número de parcelas com juros
                      </p>
                      <Button size="sm" variant="outline" onClick={addRateEntry}>
                        <Plus className="h-3 w-3 mr-1" />
                        Adicionar
                      </Button>
                    </div>
                    {rateEntries.map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px]">Parcela</Label>
                          <Input
                            type="number"
                            min={1}
                            max={24}
                            value={entry.installment}
                            onChange={e => {
                              const val = parseInt(e.target.value) || 1;
                              setRateEntries(prev => prev.map((r, i) => i === idx ? { ...r, installment: val } : r));
                            }}
                            className="w-20"
                          />
                        </div>
                        <div className="space-y-1 flex-1">
                          <Label className="text-[10px]">Taxa mensal (%)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={entry.rate}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setRateEntries(prev => prev.map((r, i) => i === idx ? { ...r, rate: val } : r));
                            }}
                          />
                        </div>
                        <Button size="icon" variant="ghost" className="mt-4 text-destructive" onClick={() => removeRateEntry(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {rateEntries.length === 0 && (
                      <p className="text-xs text-muted-foreground bg-muted/50 rounded p-3">
                        Nenhuma taxa configurada. Parcelas com juros usarão taxa 0%.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Transparent Checkout Fee */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" />
                Taxa de Checkout Transparente
              </CardTitle>
              <CardDescription>Custo operacional interno — não afeta o preço mostrado ao cliente</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.transparent_checkout_fee_enabled}
                  onCheckedChange={v => setForm(f => ({ ...f, transparent_checkout_fee_enabled: v }))}
                />
                <Label className="text-sm">Ativar taxa de checkout transparente</Label>
              </div>
              {form.transparent_checkout_fee_enabled && (
                <div className="space-y-1.5 pl-4 border-l-2 border-primary/20">
                  <Label className="text-xs">Percentual da taxa (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.transparent_checkout_fee_percent}
                    onChange={e => setForm(f => ({ ...f, transparent_checkout_fee_percent: parseFloat(e.target.value) || 0 }))}
                    className="w-[200px]"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Ex: 1.5 = 1,5% deduzido internamente do lucro em dashboards e relatórios. 
                    Não altera o valor cobrado do cliente.
                  </p>
                  {previewPrice > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Para um pedido de {formatCurrency(previewPrice)}, a taxa seria de{' '}
                      <span className="font-medium text-foreground">
                        {formatCurrency(previewPrice * (form.transparent_checkout_fee_percent / 100))}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full" size="lg">
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </div>

        {/* Preview */}
        <div className="space-y-4">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="h-4 w-4" />
                Simulador
              </CardTitle>
              <CardDescription>Veja como ficará no site</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Preço do produto (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={previewPrice}
                  onChange={e => setPreviewPrice(parseFloat(e.target.value) || 0)}
                />
              </div>

              <Separator />

              <div className="space-y-1">
                <p className="text-sm font-medium">
                  PIX: <span className="text-primary">{formatCurrency(previewPrice * (1 - form.pix_discount / 100))}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">{form.pix_discount}% de desconto</p>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-xs font-medium">Parcelas no cartão:</p>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {previewOptions.map(opt => (
                    <div key={opt.n} className="flex justify-between text-xs py-1 border-b border-border/50 last:border-0">
                      <span>
                        {opt.n}x de {formatCurrency(opt.installmentValue)}
                      </span>
                      <Badge variant={opt.hasInterest ? 'secondary' : 'default'} className="text-[10px] h-5">
                        {opt.hasInterest ? `${(opt.monthlyRate * 100).toFixed(2)}% a.m.` : 'sem juros'}
                      </Badge>
                    </div>
                  ))}
                </div>
                {previewOptions.length > 0 && previewOptions[previewOptions.length - 1].hasInterest && (
                  <p className="text-[10px] text-muted-foreground">
                    Total em {previewOptions[previewOptions.length - 1].n}x: {formatCurrency(previewOptions[previewOptions.length - 1].total)}
                  </p>
                )}
              </div>

              {form.transparent_checkout_fee_enabled && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Custo interno (checkout transparente):</p>
                    <p className="text-xs text-muted-foreground">
                      Taxa: {formatCurrency(previewPrice * (form.transparent_checkout_fee_percent / 100))} ({form.transparent_checkout_fee_percent}%)
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
