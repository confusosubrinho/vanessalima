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
import { CreditCard, Percent, Calculator, Save, Info, Plus, Trash2, ShieldCheck, Landmark } from 'lucide-react';
import { HelpHint } from '@/components/HelpHint';
import { invalidatePricingCache, getInstallmentOptions, getGatewayCost, getTransparentCheckoutFee, formatCurrency, type PricingConfig } from '@/lib/pricingEngine';
import type { Database } from '@/integrations/supabase/types';

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
        .from('payment_pricing_config')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Database['public']['Tables']['payment_pricing_config']['Row'] | null;
    },
  });

  const [form, setForm] = useState({
    max_installments: 12,
    interest_free_installments: 3,
    interest_free_installments_sale: null as number | null,
    card_cash_rate: 0,
    pix_discount: 5,
    cash_discount: 5,
    pix_discount_applies_to_sale_products: true,
    interest_mode: 'fixed' as 'fixed' | 'by_installment',
    monthly_rate_fixed: 0,
    min_installment_value: 25,
    rounding_mode: 'adjust_last',
    transparent_checkout_fee_enabled: false,
    transparent_checkout_fee_percent: 0,
    gateway_fee_1x_percent: 4.99,
    gateway_fee_additional_per_installment_percent: 2.49,
    gateway_fee_starts_at_installment: 2,
    gateway_fee_mode: 'linear_per_installment' as 'linear_per_installment' | 'price_table',
  });

  const [rateEntries, setRateEntries] = useState<RateEntry[]>([]);
  const [previewPrice, setPreviewPrice] = useState(299.9);
  const [previewCost, setPreviewCost] = useState(0);

  useEffect(() => {
    if (config) {
      setForm({
        max_installments: config.max_installments || 12,
        interest_free_installments: config.interest_free_installments || 3,
        interest_free_installments_sale: (config as any).interest_free_installments_sale != null ? Number((config as any).interest_free_installments_sale) : null,
        card_cash_rate: Number(config.card_cash_rate) || 0,
        pix_discount: Number(config.pix_discount) || 5,
        cash_discount: Number(config.cash_discount) || 5,
        pix_discount_applies_to_sale_products: config.pix_discount_applies_to_sale_products !== false,
        interest_mode: (config.interest_mode || 'fixed') as 'fixed' | 'by_installment',
        monthly_rate_fixed: Number(config.monthly_rate_fixed) || 0,
        min_installment_value: Number(config.min_installment_value) || 25,
        rounding_mode: config.rounding_mode || 'adjust_last',
        transparent_checkout_fee_enabled: config.transparent_checkout_fee_enabled ?? false,
        transparent_checkout_fee_percent: Number(config.transparent_checkout_fee_percent) || 0,
        gateway_fee_1x_percent: Number(config.gateway_fee_1x_percent) ?? 4.99,
        gateway_fee_additional_per_installment_percent: Number(config.gateway_fee_additional_per_installment_percent) ?? 2.49,
        gateway_fee_starts_at_installment: Number(config.gateway_fee_starts_at_installment) || 2,
        gateway_fee_mode: (config.gateway_fee_mode || 'linear_per_installment') as 'linear_per_installment' | 'price_table',
      });

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

      const beforeData = config ? { ...config } : null;

      if (config?.id) {
        const { error } = await supabase
          .from('payment_pricing_config')
          .update(payload as Database['public']['Tables']['payment_pricing_config']['Update'])
          .eq('id', config.id);
        if (error) throw error;

        await supabase.from('payment_pricing_audit_log').insert({
          config_id: config.id,
          before_data: beforeData as unknown,
          after_data: payload as unknown,
          changed_by: (await supabase.auth.getUser()).data.user?.id,
        } as any);
      } else {
        const { error } = await supabase
          .from('payment_pricing_config')
          .insert({ ...payload, is_active: true } as Database['public']['Tables']['payment_pricing_config']['Insert']);
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
              <div className="flex items-center justify-between gap-3 pt-2">
                <div>
                  <Label className="text-sm font-medium">Aplicar desconto PIX em produtos em promoção</Label>
                  <p className="text-xs text-muted-foreground">Se desligado, o desconto PIX não será aplicado a produtos que já tenham preço promocional (sale_price).</p>
                </div>
                <Switch
                  checked={form.pix_discount_applies_to_sale_products}
                  onCheckedChange={v => setForm(f => ({ ...f, pix_discount_applies_to_sale_products: v }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Parcelamento */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calculator className="h-4 w-4" />
                Parcelamento (visão do cliente)
              </CardTitle>
              <CardDescription>O que o cliente vê no site — "sem juros" é visual, o custo real do gateway fica na seção abaixo</CardDescription>
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
                  <Label className="text-xs">Parcelas sem juros (visual)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={form.max_installments}
                    value={form.interest_free_installments}
                    onChange={e => setForm(f => ({ ...f, interest_free_installments: parseInt(e.target.value) || 0 }))}
                  />
                  <p className="text-[10px] text-muted-foreground">Cliente vê "sem juros" até esta parcela. 0 = nenhuma.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Parcelas sem juros em promoção</Label>
                  <Input
                    type="number"
                    min={0}
                    max={form.max_installments}
                    placeholder="Igual ao geral"
                    value={form.interest_free_installments_sale ?? ''}
                    onChange={e => {
                      const v = e.target.value;
                      setForm(f => ({ ...f, interest_free_installments_sale: v === '' ? null : Math.max(0, parseInt(v) || 0) }));
                    }}
                  />
                  <p className="text-[10px] text-muted-foreground">Para produtos em promoção. Vazio = usa o valor geral acima.</p>
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
                <p className="text-[10px] text-muted-foreground">Ex: 1.99 para repassar taxa do gateway no crédito à vista ao cliente. 0 = sem repasse.</p>
              </div>

              <Separator />

              {/* Interest mode for customer-facing interest */}
              <div className="space-y-3">
                <Label className="text-xs font-medium">Modo de juros ao cliente (parcelas acima do "sem juros")</Label>
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
                    <Label className="text-xs">Taxa mensal fixa ao cliente (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.monthly_rate_fixed}
                      onChange={e => setForm(f => ({ ...f, monthly_rate_fixed: parseFloat(e.target.value) || 0 }))}
                      className="w-[200px]"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Aplicado a partir da {form.interest_free_installments + 1}ª parcela. 0 = todas sem juros até o máximo.
                    </p>
                  </div>
                )}

                {form.interest_mode === 'by_installment' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Defina a taxa mensal para cada número de parcelas com juros ao cliente
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

          {/* Gateway Internal Cost */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Landmark className="h-4 w-4" />
                Custo do Gateway (interno)
              </CardTitle>
              <CardDescription>
                Taxa MDR real cobrada pelo gateway de pagamento. Não é exibida ao cliente — usada internamente para cálculo de margem e lucro.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Taxa 1x (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.gateway_fee_1x_percent}
                    onChange={e => setForm(f => ({ ...f, gateway_fee_1x_percent: parseFloat(e.target.value) || 0 }))}
                  />
                  <p className="text-[10px] text-muted-foreground">Ex: 4.99</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Adicional por parcela (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.gateway_fee_additional_per_installment_percent}
                    onChange={e => setForm(f => ({ ...f, gateway_fee_additional_per_installment_percent: parseFloat(e.target.value) || 0 }))}
                  />
                  <p className="text-[10px] text-muted-foreground">Ex: 2.49 — somado por cada parcela adicional</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Início do adicional</Label>
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={form.gateway_fee_starts_at_installment}
                    onChange={e => setForm(f => ({ ...f, gateway_fee_starts_at_installment: parseInt(e.target.value) || 2 }))}
                  />
                  <p className="text-[10px] text-muted-foreground">A partir de qual parcela o adicional incide (default: 2)</p>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-xs font-medium">Fórmula (modo linear):</p>
                <p className="text-[10px] text-muted-foreground font-mono">
                  1x → {form.gateway_fee_1x_percent}%
                </p>
                <p className="text-[10px] text-muted-foreground font-mono">
                  n≥{form.gateway_fee_starts_at_installment} → {form.gateway_fee_1x_percent}% + {form.gateway_fee_additional_per_installment_percent}% × (n-1)
                </p>
                <p className="text-[10px] text-muted-foreground font-mono">
                  Ex 6x → {(form.gateway_fee_1x_percent + form.gateway_fee_additional_per_installment_percent * 5).toFixed(2)}%
                </p>
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
                    Deduzido internamente do lucro em dashboards e relatórios.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full" size="lg">
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </div>

        {/* Preview — Dual column: Customer vs Internal */}
        <div className="space-y-4">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="h-4 w-4" />
                Simulador
              </CardTitle>
              <CardDescription>Visão do cliente vs custo interno</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Preço venda (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={previewPrice}
                    onChange={e => setPreviewPrice(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Custo (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={previewCost}
                    onChange={e => setPreviewCost(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <Separator />

              {/* CUSTOMER VIEW */}
              <div>
                <p className="text-xs font-semibold mb-2 text-primary">👁 O que o cliente vê</p>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    PIX: <span className="text-primary">{formatCurrency(previewPrice * (1 - form.pix_discount / 100))}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">{form.pix_discount}% de desconto</p>
                </div>
                <Separator className="my-2" />
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {previewOptions.map(opt => (
                    <div key={opt.n} className="flex justify-between text-xs py-0.5">
                      <span>
                        {opt.n}x de {formatCurrency(opt.installmentValue)}
                      </span>
                      <Badge variant={opt.hasInterest ? 'secondary' : 'default'} className="text-[10px] h-5">
                        {opt.hasInterest ? `c/ juros` : 'sem juros'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* INTERNAL COST VIEW */}
              <div>
                <p className="text-xs font-semibold mb-2 text-orange-600">🔒 Seu custo interno</p>
                <div className="space-y-1 max-h-[250px] overflow-y-auto">
                  {/* PIX row */}
                  <div className="text-xs py-1 border-b border-border/50">
                    <div className="flex justify-between">
                      <span className="font-medium">PIX</span>
                      <span className="text-muted-foreground">Gateway: ~0%</span>
                    </div>
                    {previewCost > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Lucro: {formatCurrency(previewPrice * (1 - form.pix_discount / 100) - previewCost - getTransparentCheckoutFee(previewPrice * (1 - form.pix_discount / 100), previewConfig))}
                      </p>
                    )}
                  </div>

                  {/* Card installment rows */}
                  {previewOptions.map(opt => {
                    const gw = getGatewayCost(previewPrice, opt.n, previewConfig);
                    const checkoutFee = getTransparentCheckoutFee(previewPrice, previewConfig);
                    const totalFees = gw.gateway_fee_amount + checkoutFee;
                    const profit = previewCost > 0 ? previewPrice - previewCost - totalFees : null;

                    return (
                      <div key={opt.n} className="text-xs py-1 border-b border-border/50 last:border-0">
                        <div className="flex justify-between">
                          <span className="font-medium">{opt.n}x cartão</span>
                          <span className="text-muted-foreground">
                            {gw.gateway_fee_percent_effective.toFixed(2)}% ({formatCurrency(gw.gateway_fee_amount)})
                          </span>
                        </div>
                        {checkoutFee > 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            + Checkout: {formatCurrency(checkoutFee)}
                          </p>
                        )}
                        {profit !== null && (
                          <p className={`text-[10px] font-medium ${profit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                            Lucro: {formatCurrency(profit)} ({((profit / previewPrice) * 100).toFixed(1)}%)
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
