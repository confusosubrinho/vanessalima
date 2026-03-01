import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard, Settings2, Check, AlertCircle, Loader2, RefreshCw,
  Eye, EyeOff, Save, Plug, Activity, Clock, ExternalLink,
  Upload, Database, CheckCircle2, XCircle, ChevronDown, ChevronUp, Package, AlertTriangle, Globe
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function CheckoutSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "";

  // ─── Queries ───
  const { data: checkoutConfig, isLoading } = useQuery({
    queryKey: ["integrations-checkout"],
    queryFn: async () => {
      const { data } = await supabase.from("integrations_checkout").select("*").limit(1).single();
      return data;
    },
  });

  const { data: providers } = useQuery({
    queryKey: ["integrations-checkout-providers"],
    queryFn: async () => {
      const { data } = await supabase.from("integrations_checkout_providers").select("*");
      return data || [];
    },
  });

  const { data: testLogs } = useQuery({
    queryKey: ["checkout-test-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("integrations_checkout_test_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const { data: lastOrder } = useQuery({
    queryKey: ["last-stripe-order"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, status, created_at, total_amount, provider")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // ─── Mutations ───
  const updateConfig = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      if (!checkoutConfig?.id) return;
      const { error } = await supabase
        .from("integrations_checkout")
        .update(updates)
        .eq("id", checkoutConfig.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations-checkout"] });
      toast({ title: "Configuração atualizada" });
    },
  });

  const stripeProvider = providers?.find((p) => p.provider === "stripe");
  const stripeConfig = (stripeProvider?.config as Record<string, unknown>) || {};

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          Checkout & Pagamentos
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure como os pagamentos são processados na sua loja.
        </p>
      </div>

      {/* Ativar / desativar gateways — Stripe e Yampi */}
      <GatewaysToggleCard
        providers={providers}
        checkoutConfig={checkoutConfig}
        queryClient={queryClient}
        toast={toast}
      />

      {/* Status Overview */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant={checkoutConfig?.enabled ? "default" : "secondary"}>
                {checkoutConfig?.enabled ? "Ativo" : "Desativado"}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Gateway</p>
              <p className="text-sm font-semibold capitalize">
                {checkoutConfig?.provider || "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Último Pedido</p>
              <p className="text-sm font-medium">
                {lastOrder ? format(new Date(lastOrder.created_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Stripe</p>
              <Badge variant={stripeProvider?.is_active ? "default" : "secondary"}>
                {stripeProvider?.is_active ? "Conectado" : "Inativo"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stripe Configuration - Main Section */}
      <StripeSection
        providers={providers}
        checkoutConfig={checkoutConfig}
        queryClient={queryClient}
        toast={toast}
        updateConfig={updateConfig}
      />

      {/* Yampi Integration - Collapsible */}
      <YampiSection
        providers={providers}
        queryClient={queryClient}
        toast={toast}
        projectId={projectId}
        testLogs={testLogs}
      />

      {/* Logs */}
      {testLogs && testLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Últimos Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {testLogs.map((log) => (
                <div
                  key={log.id}
                  className={`text-xs p-2.5 rounded-lg border ${
                    log.status === "success"
                      ? "bg-primary/5 border-primary/20"
                      : "bg-destructive/5 border-destructive/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {log.status === "success" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-600" />
                      )}
                      <span className="font-medium">{log.provider}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{log.message}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// GATEWAYS TOGGLE CARD (Stripe e Yampi ativar/desativar)
// ═══════════════════════════════════════════════════════════

function GatewaysToggleCard({
  providers,
  checkoutConfig,
  queryClient,
  toast,
}: {
  providers: any[] | undefined;
  checkoutConfig: any;
  queryClient: ReturnType<typeof useQueryClient>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const stripeProvider = providers?.find((p) => p.provider === "stripe");
  const yampiProvider = providers?.find((p) => p.provider === "yampi");

  const updateStripeActive = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!stripeProvider?.id) throw new Error("Stripe não configurado");
      const { error } = await supabase
        .from("integrations_checkout_providers")
        .update({ is_active: isActive })
        .eq("id", stripeProvider.id);
      if (error) throw error;
      if (checkoutConfig?.id) {
        await supabase
          .from("integrations_checkout")
          .update({ provider: isActive ? "stripe" : "appmax", enabled: true })
          .eq("id", checkoutConfig.id);
      }
    },
    onSuccess: (_, isActive) => {
      queryClient.invalidateQueries({ queryKey: ["integrations-checkout-providers"] });
      queryClient.invalidateQueries({ queryKey: ["integrations-checkout"] });
      toast({ title: isActive ? "Stripe ativado" : "Stripe desativado" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const toggleYampi = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!yampiProvider?.id) throw new Error("Yampi não configurado");
      const { error } = await supabase
        .from("integrations_checkout_providers")
        .update({ is_active: isActive })
        .eq("id", yampiProvider.id);
      if (error) throw error;
    },
    onSuccess: (_, isActive) => {
      queryClient.invalidateQueries({ queryKey: ["integrations-checkout-providers"] });
      toast({ title: isActive ? "Yampi ativado" : "Yampi desativado" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Plug className="h-4 w-4" />
          Gateways de pagamento
        </CardTitle>
        <CardDescription>
          Ative ou desative cada gateway. Stripe = checkout no seu site (cartão e PIX). Yampi = redirecionamento para o checkout Yampi. Quando Stripe estiver desativado, o checkout usa Appmax.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div>
            <p className="font-medium text-sm">Stripe (checkout no seu site)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cartão e PIX na própria página de checkout. Desativar = uso do Appmax.
            </p>
          </div>
          {stripeProvider ? (
            <Switch
              checked={stripeProvider.is_active}
              onCheckedChange={(checked) => updateStripeActive.mutate(checked)}
              disabled={updateStripeActive.isPending}
            />
          ) : (
            <span className="text-xs text-muted-foreground">Configure as chaves abaixo para ativar</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div>
            <p className="font-medium text-sm">Yampi (checkout por redirecionamento)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ative para oferecer o checkout Yampi. Configure alias e token na seção Yampi abaixo.
            </p>
          </div>
          {yampiProvider ? (
            <Switch
              checked={yampiProvider.is_active ?? false}
              onCheckedChange={(checked) => toggleYampi.mutate(checked)}
              disabled={toggleYampi.isPending}
            />
          ) : (
            <span className="text-xs text-muted-foreground">Adicione Yampi na seção abaixo primeiro</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════
// STRIPE SECTION
// ═══════════════════════════════════════════════════════════

function StripeSection({
  providers,
  checkoutConfig,
  queryClient,
  toast,
  updateConfig,
}: {
  providers: any[] | undefined;
  checkoutConfig: any;
  queryClient: ReturnType<typeof useQueryClient>;
  toast: ReturnType<typeof useToast>["toast"];
  updateConfig: any;
}) {
  const stripeProvider = providers?.find((p) => p.provider === "stripe");
  const stripeConfig = (stripeProvider?.config as Record<string, unknown>) || {};
  const [showKey, setShowKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [keyForm, setKeyForm] = useState((stripeConfig.publishable_key as string) || "");
  const [secretKeyForm, setSecretKeyForm] = useState((stripeConfig.secret_key as string) || "");
  const [saving, setSaving] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState<string>(
    (stripeConfig.checkout_mode as string) || "embedded"
  );
  const [syncingStripeCatalog, setSyncingStripeCatalog] = useState(false);
  const [stripeSyncProgress, setStripeSyncProgress] = useState("");

  useEffect(() => {
    const key = (stripeConfig.publishable_key as string) || "";
    const sk = (stripeConfig.secret_key as string) || "";
    if (key) setKeyForm(key);
    if (sk) setSecretKeyForm(sk);
    setCheckoutMode((stripeConfig.checkout_mode as string) || "embedded");
  }, [stripeProvider?.id]);

  const updateStripeActive = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!stripeProvider?.id) throw new Error("Stripe não configurado");
      const { error } = await supabase
        .from("integrations_checkout_providers")
        .update({ is_active: isActive })
        .eq("id", stripeProvider.id);
      if (error) throw error;
      // Sync main checkout config: Stripe on → stripe; Stripe off → appmax
      if (checkoutConfig?.id) {
        await supabase
          .from("integrations_checkout")
          .update({
            provider: isActive ? "stripe" : "appmax",
            enabled: true,
          })
          .eq("id", checkoutConfig.id);
      }
    },
    onSuccess: (_, isActive) => {
      queryClient.invalidateQueries({ queryKey: ["integrations-checkout-providers"] });
      queryClient.invalidateQueries({ queryKey: ["integrations-checkout"] });
      toast({
        title: isActive ? "Stripe ativado" : "Stripe desativado",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const saveConfig = useMutation({
    mutationFn: async () => {
      const config = {
        ...stripeConfig,
        publishable_key: keyForm.trim() || null,
        secret_key: secretKeyForm.trim() || null,
        checkout_mode: checkoutMode,
      };
      if (stripeProvider?.id) {
        const { error } = await supabase
          .from("integrations_checkout_providers")
          .update({ config })
          .eq("id", stripeProvider.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("integrations_checkout_providers").insert({
          provider: "stripe",
          display_name: "Stripe",
          is_active: false,
          config,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations-checkout-providers"] });
      toast({ title: "Configuração Stripe salva!" });
      setSaving(false);
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
      setSaving(false);
    },
  });

  const hasKey = !!keyForm.trim();
  const isValidKey = keyForm.startsWith("pk_live_") || keyForm.startsWith("pk_test_");

  const runStripeCatalogSync = async () => {
    if (syncingStripeCatalog) return;
    setSyncingStripeCatalog(true);
    setStripeSyncProgress("Iniciando...");
    let offset = 0;
    const batchSize = 10;
    let totalProducts = 0;
    let totalPrices = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    try {
      while (true) {
        setStripeSyncProgress(`Enviando produtos ${offset + 1}-${offset + batchSize}...`);
        const { data, error } = await supabase.functions.invoke("stripe-catalog-sync", {
          body: { only_active: true, offset, limit: batchSize },
        });
        if (error) throw error;
        totalProducts += data?.created_products ?? 0;
        totalPrices += data?.created_prices ?? 0;
        totalUpdated += data?.updated_products ?? 0;
        totalErrors += data?.errors_count ?? 0;
        const processed = data?.processed ?? 0;
        setStripeSyncProgress(`${offset + processed} produtos processados`);
        if (!data?.has_more) break;
        offset += batchSize;
      }
      setStripeSyncProgress("");
      toast({
        title: "Catálogo Stripe sincronizado!",
        description: `${totalProducts} produtos criados, ${totalPrices} preços criados, ${totalUpdated} produtos atualizados${totalErrors > 0 ? `, ${totalErrors} erros` : ""}.`,
        variant: totalErrors > 0 ? "destructive" : "default",
      });
      queryClient.invalidateQueries({ queryKey: ["integrations-checkout-providers"] });
    } catch (err: unknown) {
      setStripeSyncProgress("");
      toast({
        title: "Erro ao sincronizar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setSyncingStripeCatalog(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Stripe</CardTitle>
              <CardDescription>Gateway principal de pagamentos</CardDescription>
            </div>
          </div>
          {stripeProvider && (
            <Switch
              checked={stripeProvider.is_active}
              onCheckedChange={(checked) => updateStripeActive.mutate(checked)}
              disabled={updateStripeActive.isPending}
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Checkout Mode */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Modo de Checkout</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setCheckoutMode("embedded")}
              className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                checkoutMode === "embedded"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              {checkoutMode === "embedded" && (
                <div className="absolute top-3 right-3">
                  <Check className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Checkout Transparente</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Formulário de pagamento integrado na página. O cliente não sai do site.
              </p>
              <div className="mt-2 flex gap-1.5">
                <Badge variant="outline" className="text-[10px]">Cartão</Badge>
                <Badge variant="outline" className="text-[10px]">PIX</Badge>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setCheckoutMode("external")}
              className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                checkoutMode === "external"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              {checkoutMode === "external" && (
                <div className="absolute top-3 right-3">
                  <Check className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className="flex items-center gap-2 mb-2">
                <Globe className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Checkout Externo Stripe</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Redireciona para a página de checkout segura da Stripe.
              </p>
              <div className="mt-2 flex gap-1.5">
                <Badge variant="outline" className="text-[10px]">Todos os métodos</Badge>
                <Badge variant="outline" className="text-[10px]">Link de pagamento</Badge>
              </div>
            </button>
          </div>
        </div>

        <Separator />

        {/* API Key */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Chave Pública (Publishable Key)</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? "text" : "password"}
                value={keyForm}
                onChange={(e) => setKeyForm(e.target.value)}
                placeholder="pk_live_... ou pk_test_..."
                className="font-mono text-xs pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {hasKey && !isValidKey && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              A chave deve começar com pk_live_ ou pk_test_
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Encontre em{" "}
            <a
              href="https://dashboard.stripe.com/apikeys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline inline-flex items-center gap-0.5"
            >
              Stripe Dashboard <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </p>
        </div>

        {/* Secret Key */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Chave Secreta (Secret Key)</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showSecretKey ? "text" : "password"}
                value={secretKeyForm}
                onChange={(e) => setSecretKeyForm(e.target.value)}
                placeholder="sk_live_... ou sk_test_..."
                className="font-mono text-xs pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSecretKey(!showSecretKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {secretKeyForm.trim() && !secretKeyForm.startsWith("sk_live_") && !secretKeyForm.startsWith("sk_test_") && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              A chave deve começar com sk_live_ ou sk_test_
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Necessária para criar sessões de checkout e processar pagamentos. Mantenha em sigilo. Mesma página do Dashboard acima.
          </p>
        </div>

        {/* Sincronizar catálogo Stripe */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Catálogo no Stripe</Label>
          <p className="text-xs text-muted-foreground">
            Envia todos os produtos ativos e suas variantes para o catálogo do Stripe (Products e Prices). Assim os itens aparecem no Dashboard da Stripe. Salve as chaves acima antes de sincronizar.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={runStripeCatalogSync}
            disabled={syncingStripeCatalog || !secretKeyForm.trim()}
            className="w-full"
          >
            {syncingStripeCatalog ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {syncingStripeCatalog ? stripeSyncProgress || "Sincronizando..." : "Sincronizar catálogo Stripe"}
          </Button>
        </div>

        {/* Fallback */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div>
            <Label className="text-sm">Fallback para checkout nativo</Label>
            <p className="text-xs text-muted-foreground">Se a Stripe falhar, usa o checkout do site</p>
          </div>
          <Switch
            checked={checkoutConfig?.fallback_to_native || false}
            onCheckedChange={(fallback_to_native) => updateConfig.mutate({ fallback_to_native })}
          />
        </div>

        {/* Save */}
        <Button
          onClick={() => {
            setSaving(true);
            saveConfig.mutate();
          }}
          disabled={saving || !hasKey}
          className="w-full"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar Configurações Stripe
        </Button>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════
// YAMPI SECTION (Collapsible)
// ═══════════════════════════════════════════════════════════

function YampiSection({
  providers,
  queryClient,
  toast,
  projectId,
  testLogs,
}: {
  providers: any[] | undefined;
  queryClient: ReturnType<typeof useQueryClient>;
  toast: ReturnType<typeof useToast>["toast"];
  projectId: string;
  testLogs: any[] | undefined;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showYampiModal, setShowYampiModal] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingCategories, setSyncingCategories] = useState(false);
  const [syncingVariations, setSyncingVariations] = useState(false);
  const [syncingImages, setSyncingImages] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [imageProgress, setImageProgress] = useState("");
  const [errorDetailModal, setErrorDetailModal] = useState<any>(null);

  const yampiProvider = providers?.find((p) => p.provider === "yampi");
  const yampiConfig = (yampiProvider?.config || {}) as Record<string, unknown>;
  const [yampiForm, setYampiForm] = useState<Record<string, string>>({});

  const yampiActive = yampiProvider?.is_active ?? false;

  const { data: lastSyncRun, refetch: refetchSyncRun } = useQuery({
    queryKey: ["last-catalog-sync-run"],
    queryFn: async () => {
      const { data } = await supabase
        .from("catalog_sync_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: unmappedProducts } = useQuery({
    queryKey: ["unmapped-yampi-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku")
        .is("yampi_product_id", null)
        .eq("is_active", true)
        .limit(20);
      return data || [];
    },
    enabled: isOpen,
  });

  const { data: unmappedVariants } = useQuery({
    queryKey: ["unmapped-yampi-variants"],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_variants")
        .select("id, size, color, sku, product_id, products(name)")
        .is("yampi_sku_id", null)
        .eq("is_active", true)
        .limit(20);
      return data || [];
    },
    enabled: isOpen,
  });

  const toggleYampiActive = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!yampiProvider?.id) return;
      const { error } = await supabase
        .from("integrations_checkout_providers")
        .update({ is_active: isActive })
        .eq("id", yampiProvider.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations-checkout-providers"] });
      toast({ title: yampiActive ? "Yampi desativada" : "Yampi ativada" });
    },
  });

  const saveYampiConfig = useMutation({
    mutationFn: async () => {
      if (!yampiProvider?.id) return;
      const newConfig = {
        alias: yampiForm.alias,
        user_token: yampiForm.user_token,
        user_secret_key: yampiForm.user_secret_key,
        checkout_name_template: yampiForm.checkout_name_template,
        success_url: yampiForm.success_url,
        cancel_url: yampiForm.cancel_url,
        mode: yampiForm.mode,
        sync_enabled: yampiForm.sync_enabled === "true",
        stock_mode: yampiForm.stock_mode,
        default_brand_id: yampiForm.default_brand_id ? Number(yampiForm.default_brand_id) : null,
      };
      const { error } = await supabase
        .from("integrations_checkout_providers")
        .update({ config: newConfig })
        .eq("id", yampiProvider.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations-checkout-providers"] });
      setShowYampiModal(false);
      toast({ title: "Configuração Yampi salva!" });
    },
  });

  const openYampiModal = () => {
    setYampiForm({
      alias: (yampiConfig.alias as string) || "",
      user_token: (yampiConfig.user_token as string) || "",
      user_secret_key: (yampiConfig.user_secret_key as string) || "",
      checkout_name_template: (yampiConfig.checkout_name_template as string) || "Pedido #{order_number}",
      success_url: (yampiConfig.success_url as string) || "",
      cancel_url: (yampiConfig.cancel_url as string) || "",
      mode: (yampiConfig.mode as string) || "redirect",
      sync_enabled: String(yampiConfig.sync_enabled ?? true),
      stock_mode: (yampiConfig.stock_mode as string) || "reserve",
      default_brand_id: String(yampiConfig.default_brand_id || ""),
    });
    setShowYampiModal(true);
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("integrations-test", {
        body: { provider: "yampi" },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["checkout-test-logs"] });
      toast({
        title: data?.status === "success" ? "Conexão OK!" : "Falha",
        description: data?.message,
        variant: data?.status === "success" ? "default" : "destructive",
      });
    } catch (err: unknown) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const syncCatalog = async () => {
    setSyncing(true);
    setSyncProgress("Iniciando...");
    const BATCH_SIZE = 3;
    let offset = 0;
    let syncRunId: string | null = null;
    let totalCreated = 0, totalSkus = 0, totalUpdated = 0, totalErrors = 0;
    try {
      while (true) {
        setSyncProgress(`Processando ${offset + 1}-${offset + BATCH_SIZE}...`);
        const { data, error } = await supabase.functions.invoke("yampi-catalog-sync", {
          body: { only_active: true, offset, limit: BATCH_SIZE, sync_run_id: syncRunId },
        });
        if (error) throw error;
        syncRunId = data?.sync_run_id || syncRunId;
        totalCreated += data?.created_products || 0;
        totalSkus += data?.created_skus || 0;
        totalUpdated += data?.updated_skus || 0;
        totalErrors += data?.errors_count || 0;
        const total = data?.total_products || 0;
        const processed = offset + (data?.processed || 0);
        setSyncProgress(`${processed}/${total} produtos`);
        if (!data?.has_more) break;
        offset += BATCH_SIZE;
      }
      queryClient.invalidateQueries({ queryKey: ["unmapped-yampi-products"] });
      queryClient.invalidateQueries({ queryKey: ["unmapped-yampi-variants"] });
      refetchSyncRun();
      toast({
        title: "Sincronização concluída!",
        description: `${totalCreated} criados, ${totalSkus} SKUs, ${totalUpdated} atualizados, ${totalErrors} erros`,
        variant: totalErrors > 0 ? "destructive" : "default",
      });
    } catch (err: unknown) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSyncing(false);
      setSyncProgress("");
    }
  };

  const syncCategories = async () => {
    setSyncingCategories(true);
    try {
      const { data, error } = await supabase.functions.invoke("yampi-sync-categories");
      if (error) throw error;
      toast({
        title: "Categorias sincronizadas!",
        description: `${data?.created || 0} criadas, ${data?.matched || 0} mapeadas`,
      });
    } catch (err: unknown) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSyncingCategories(false);
    }
  };

  const syncVariations = async () => {
    setSyncingVariations(true);
    try {
      const { data, error } = await supabase.functions.invoke("yampi-sync-variation-values");
      if (error) throw error;
      toast({
        title: "Variações sincronizadas!",
        description: `${data?.created || 0} criadas, ${data?.matched || 0} mapeadas`,
      });
    } catch (err: unknown) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSyncingVariations(false);
    }
  };

  const syncImages = async () => {
    setSyncingImages(true);
    setImageProgress("Iniciando...");
    const BATCH_SIZE = 10;
    let offset = 0;
    let totalUploaded = 0, totalSkipped = 0, totalErrors = 0;
    try {
      while (true) {
        setImageProgress(`Processando ${offset + 1}-${offset + BATCH_SIZE}...`);
        const { data, error } = await supabase.functions.invoke("yampi-sync-images", {
          body: { offset, limit: BATCH_SIZE },
        });
        if (error) throw error;
        totalUploaded += data?.uploaded || 0;
        totalSkipped += data?.skipped || 0;
        totalErrors += data?.errors || 0;
        const total = data?.total || 0;
        const processed = offset + (data?.processed || 0);
        setImageProgress(`${processed}/${total} produtos`);
        if (!data?.has_more) break;
        offset += BATCH_SIZE;
      }
      toast({
        title: "Imagens sincronizadas!",
        description: `${totalUploaded} enviadas, ${totalSkipped} puladas, ${totalErrors} erros`,
        variant: totalErrors > 0 ? "destructive" : "default",
      });
    } catch (err: unknown) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSyncingImages(false);
      setImageProgress("");
    }
  };

  const webhookUrl = projectId ? `https://${projectId}.supabase.co/functions/v1/yampi-webhook` : "";

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <Plug className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Yampi
                      <Badge variant={yampiActive ? "default" : "secondary"} className="text-[10px]">
                        {yampiActive ? "Ativa" : "Inativa"}
                      </Badge>
                    </CardTitle>
                    <CardDescription>Integração com checkout e catálogo Yampi</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={yampiActive}
                      onCheckedChange={(checked) => toggleYampiActive.mutate(checked)}
                      disabled={toggleYampiActive.isPending}
                    />
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="space-y-6 pt-0">
              {/* Quick Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground block mb-1">Alias</span>
                  <span className="font-mono font-medium">{(yampiConfig.alias as string) || "—"}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground block mb-1">Modo</span>
                  <span className="font-medium capitalize">{(yampiConfig.mode as string) || "redirect"}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground block mb-1">Estoque</span>
                  <span className="font-medium capitalize">{(yampiConfig.stock_mode as string) || "reserve"}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground block mb-1">Sync</span>
                  <Badge variant={yampiConfig.sync_enabled ? "default" : "secondary"} className="text-[10px]">
                    {yampiConfig.sync_enabled ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={openYampiModal}>
                  <Settings2 className="h-3 w-3 mr-1" /> Configurar
                </Button>
                <Button size="sm" variant="outline" onClick={testConnection} disabled={testing}>
                  {testing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  Testar Conexão
                </Button>
              </div>

              {/* Webhook URL */}
              {webhookUrl && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs font-medium">Webhook URL</p>
                  <div className="flex items-center gap-2">
                    <code className="text-[10px] font-mono bg-background px-2 py-1 rounded flex-1 overflow-x-auto border">
                      {webhookUrl}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(webhookUrl);
                        toast({ title: "URL copiada!" });
                      }}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              <Separator />

              {/* Catalog Sync - Inside Yampi */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Sincronização de Catálogo
                    </h4>
                    <p className="text-xs text-muted-foreground">Replica produtos para a Yampi</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Button size="sm" variant="outline" onClick={syncCategories} disabled={syncingCategories} className="text-xs">
                    {syncingCategories ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Package className="h-3 w-3 mr-1" />}
                    Categorias
                  </Button>
                  <Button size="sm" variant="outline" onClick={syncVariations} disabled={syncingVariations} className="text-xs">
                    {syncingVariations ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Package className="h-3 w-3 mr-1" />}
                    Variações
                  </Button>
                  <Button size="sm" onClick={syncCatalog} disabled={syncing} className="text-xs">
                    {syncing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Database className="h-3 w-3 mr-1" />}
                    {syncing ? syncProgress || "Sincronizando..." : "Catálogo"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={syncImages} disabled={syncingImages} className="text-xs">
                    {syncingImages ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                    {syncingImages ? imageProgress || "Enviando..." : "Imagens"}
                  </Button>
                </div>

                {/* Last Sync Stats */}
                {lastSyncRun && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Último sync: {format(new Date((lastSyncRun as any).started_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                      <Badge variant={(lastSyncRun as any).status === "success" ? "default" : "secondary"} className="text-[10px]">
                        {(lastSyncRun as any).status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-center text-xs">
                      {[
                        { label: "Criados", value: (lastSyncRun as any).created_products || 0, color: "text-primary" },
                        { label: "SKUs", value: (lastSyncRun as any).created_skus || 0, color: "text-primary" },
                        { label: "Atualizados", value: (lastSyncRun as any).updated_skus || 0, color: "" },
                        { label: "Ignorados", value: (lastSyncRun as any).skipped_inactive || 0, color: "text-muted-foreground" },
                        { label: "Erros", value: (lastSyncRun as any).errors_count || 0, color: (lastSyncRun as any).errors_count > 0 ? "text-destructive" : "" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="p-1.5 rounded bg-muted/50">
                          <p className="text-muted-foreground text-[10px]">{label}</p>
                          <p className={`font-bold ${color}`}>{value}</p>
                        </div>
                      ))}
                    </div>
                    {(lastSyncRun as any).errors_count > 0 && (lastSyncRun as any).error_details && (
                      <div className="border rounded p-2 max-h-32 overflow-y-auto">
                        <p className="text-xs font-medium mb-1 flex items-center gap-1">
                          <XCircle className="h-3 w-3 text-destructive" /> Erros
                        </p>
                        {((lastSyncRun as any).error_details as any[]).slice(0, 5).map((err: any, i: number) => (
                          <div key={i} className="text-[10px] border-b py-1 last:border-0 flex items-center justify-between">
                            <span>
                              <span className="font-mono text-muted-foreground">{err.product_id?.slice(0, 8)}...</span>{" "}
                              {err.message}
                            </span>
                            {(err.response_body || err.sent_payload) && (
                              <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1" onClick={() => setErrorDetailModal(err)}>
                                Detalhes
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Unmapped validator */}
                {isOpen && ((unmappedProducts?.length || 0) > 0 || (unmappedVariants?.length || 0) > 0) && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <h5 className="text-xs font-medium flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                      Itens sem mapeamento Yampi
                    </h5>
                    {(unmappedProducts?.length || 0) > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {unmappedProducts?.length} produtos sem yampi_product_id
                      </p>
                    )}
                    {(unmappedVariants?.length || 0) > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {unmappedVariants?.length} variantes sem yampi_sku_id
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Yampi Config Modal */}
      <Dialog open={showYampiModal} onOpenChange={setShowYampiModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurar Yampi</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Alias da Loja</Label>
              <Input value={yampiForm.alias || ""} onChange={(e) => setYampiForm((p) => ({ ...p, alias: e.target.value }))} placeholder="minha-loja" className="text-xs h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">User Token</Label>
              <Input value={yampiForm.user_token || ""} onChange={(e) => setYampiForm((p) => ({ ...p, user_token: e.target.value }))} placeholder="Token do usuário" className="text-xs h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">User Secret Key</Label>
              <div className="relative">
                <Input type={showSecret ? "text" : "password"} value={yampiForm.user_secret_key || ""} onChange={(e) => setYampiForm((p) => ({ ...p, user_secret_key: e.target.value }))} placeholder="Secret key" className="text-xs h-8 pr-8" />
                <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-2 top-1/2 -translate-y-1/2">
                  {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <Separator />
            <div className="space-y-1">
              <Label className="text-xs">Brand ID padrão</Label>
              <Input value={yampiForm.default_brand_id || ""} onChange={(e) => setYampiForm((p) => ({ ...p, default_brand_id: e.target.value }))} placeholder="Auto-detectar" className="text-xs h-8" type="number" />
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">URL de Sucesso</Label>
                <Input value={yampiForm.success_url || ""} onChange={(e) => setYampiForm((p) => ({ ...p, success_url: e.target.value }))} placeholder="/pedido-confirmado/{order_id}" className="text-xs h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">URL de Cancelamento</Label>
                <Input value={yampiForm.cancel_url || ""} onChange={(e) => setYampiForm((p) => ({ ...p, cancel_url: e.target.value }))} placeholder="/carrinho" className="text-xs h-8" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Modo</Label>
                <Select value={yampiForm.mode || "redirect"} onValueChange={(v) => setYampiForm((p) => ({ ...p, mode: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="redirect">Redirect</SelectItem>
                    <SelectItem value="embed_iframe">Embed (iframe)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Regra de Estoque</Label>
                <Select value={yampiForm.stock_mode || "reserve"} onValueChange={(v) => setYampiForm((p) => ({ ...p, stock_mode: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reserve">Reservar</SelectItem>
                    <SelectItem value="debit_immediate">Débito imediato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">Sincronizar SKUs automaticamente</Label>
                <p className="text-[10px] text-muted-foreground">Atualiza preço/estoque antes do checkout</p>
              </div>
              <Switch checked={yampiForm.sync_enabled === "true"} onCheckedChange={(v) => setYampiForm((p) => ({ ...p, sync_enabled: String(v) }))} />
            </div>
            <Button onClick={() => saveYampiConfig.mutate()} disabled={saveYampiConfig.isPending} className="w-full">
              {saveYampiConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Error Detail Modal */}
      <Dialog open={!!errorDetailModal} onOpenChange={() => setErrorDetailModal(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">Detalhes do Erro</DialogTitle>
          </DialogHeader>
          {errorDetailModal && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Mensagem</p>
                <p className="text-xs">{errorDetailModal.message}</p>
              </div>
              {errorDetailModal.response_body && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Resposta</p>
                  <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-40">
                    {JSON.stringify(errorDetailModal.response_body, null, 2)}
                  </pre>
                </div>
              )}
              {errorDetailModal.sent_payload && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Payload</p>
                  <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-40">
                    {JSON.stringify(errorDetailModal.sent_payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
