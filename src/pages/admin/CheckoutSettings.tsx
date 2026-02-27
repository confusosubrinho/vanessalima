import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard, Settings2, Check, AlertCircle, Loader2, RefreshCw,
  Eye, EyeOff, Save, Plug, ShoppingCart, Package, Activity, Clock,
  AlertTriangle, ExternalLink, Upload, Database, CheckCircle2, XCircle
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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Stripe: toggle para usar checkout Stripe (cartão + PIX no site) ou checkout próprio (Appmax)
function StripeCheckoutToggle({
  providers,
  queryClient,
  toast,
}: {
  providers: { id: string; provider: string; display_name: string; is_active: boolean; config: unknown }[] | undefined;
  queryClient: ReturnType<typeof useQueryClient>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const stripeProvider = providers?.find((p) => p.provider === "stripe");
  const stripeConfig = (stripeProvider?.config as Record<string, unknown>) || {};
  const [showStripeKey, setShowStripeKey] = useState(false);
  const [stripeKeyForm, setStripeKeyForm] = useState((stripeConfig.publishable_key as string) || "");
  const [savingStripe, setSavingStripe] = useState(false);

  useEffect(() => {
    const key = (stripeConfig.publishable_key as string) || "";
    if (key) setStripeKeyForm(key);
  }, [stripeProvider?.id, stripeConfig.publishable_key]);

  const updateStripeActive = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!stripeProvider?.id) throw new Error("Stripe não configurado");
      const { error } = await supabase
        .from("integrations_checkout_providers")
        .update({ is_active: isActive })
        .eq("id", stripeProvider.id);
      if (error) throw error;
    },
    onSuccess: (_, isActive) => {
      queryClient.invalidateQueries({ queryKey: ["integrations-checkout-providers"] });
      toast({
        title: isActive ? "Checkout Stripe ativado" : "Checkout Stripe desativado",
        description: isActive
          ? "Cartão e PIX serão processados pela Stripe na página de checkout."
          : "O checkout usará o gateway configurado (ex.: Appmax).",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    },
  });

  const saveStripeConfig = useMutation({
    mutationFn: async () => {
      const config = { ...stripeConfig, publishable_key: stripeKeyForm.trim() || null };
      if (stripeProvider?.id) {
        const { error } = await supabase
          .from("integrations_checkout_providers")
          .update({ config })
          .eq("id", stripeProvider.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("integrations_checkout_providers").insert({
          provider: "stripe",
          display_name: "Stripe (checkout no site)",
          is_active: false,
          config,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations-checkout-providers"] });
      toast({ title: "Configuração Stripe salva!" });
      setSavingStripe(false);
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
      setSavingStripe(false);
    },
  });

  const handleStripeKeySave = () => {
    setSavingStripe(true);
    saveStripeConfig.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Stripe (checkout no seu site)
            </CardTitle>
            <CardDescription>
              Cartão e PIX processados pela Stripe na própria página de checkout, sem redirecionamento. Desative para usar outro gateway (ex.: Appmax).
            </CardDescription>
          </div>
          {stripeProvider && (
            <Badge variant={stripeProvider.is_active ? "default" : "secondary"}>
              {stripeProvider.is_active ? "Ativo" : "Inativo"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {stripeProvider ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <Label>Usar checkout Stripe</Label>
                <p className="text-xs text-muted-foreground">
                  Quando ativo: cartão e PIX na página de checkout (Stripe). Quando inativo: checkout do site com o gateway configurado (ex.: Appmax).
                </p>
              </div>
              <Switch
                checked={stripeProvider.is_active}
                onCheckedChange={(checked) => updateStripeActive.mutate(checked)}
                disabled={updateStripeActive.isPending}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs">Chave pública (publishable key)</Label>
              <div className="flex gap-2">
                <Input
                  type={showStripeKey ? "text" : "password"}
                  value={stripeKeyForm}
                  onChange={(e) => setStripeKeyForm(e.target.value)}
                  placeholder="pk_live_... ou pk_test_..."
                  className="font-mono text-xs"
                />
                <Button variant="ghost" size="icon" onClick={() => setShowStripeKey(!showStripeKey)}>
                  {showStripeKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button size="sm" onClick={handleStripeKeySave} disabled={savingStripe}>
                  {savingStripe ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  <span className="ml-1">Salvar chave</span>
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Obtenha em{" "}
                <a
                  href="https://dashboard.stripe.com/apikeys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Stripe Dashboard → API Keys
                </a>
                . A chave secreta (sk_) deve estar nas variáveis de ambiente da Edge Function (STRIPE_SECRET_KEY).
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Nenhum provider Stripe configurado. Adicione a chave pública para poder ativar o checkout Stripe.
            </p>
            <div className="space-y-2">
              <Label className="text-xs">Chave pública Stripe (publishable key)</Label>
              <div className="flex gap-2">
                <Input
                  type={showStripeKey ? "text" : "password"}
                  value={stripeKeyForm}
                  onChange={(e) => setStripeKeyForm(e.target.value)}
                  placeholder="pk_live_... ou pk_test_..."
                  className="font-mono text-xs flex-1"
                />
                <Button variant="ghost" size="icon" onClick={() => setShowStripeKey(!showStripeKey)}>
                  {showStripeKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Button onClick={handleStripeKeySave} disabled={savingStripe || !stripeKeyForm.trim()}>
                {savingStripe ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plug className="h-4 w-4 mr-2" />}
                Adicionar Stripe
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CheckoutSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showYampiModal, setShowYampiModal] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingCategories, setSyncingCategories] = useState(false);
  const [syncingVariations, setSyncingVariations] = useState(false);
  const [syncingImages, setSyncingImages] = useState(false);
  const [imageProgress, setImageProgress] = useState("");
  const [imageLogs, setImageLogs] = useState<Array<{
    sku_id: number; product_id: string; product_name?: string;
    source_url: string; yampi_returned_url: string | null;
    head_status: number | null; status: string; error?: string;
  }>>([]);
  const [showImageLogs, setShowImageLogs] = useState(false);
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "";

  // Queries
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
  });

  const { data: lastOrder } = useQuery({
    queryKey: ["last-yampi-order"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, status, created_at, total_amount, provider")
        .eq("provider", "yampi")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

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

  // Yampi form state
  const yampiProvider = providers?.find((p) => p.provider === "yampi");
  const yampiConfig = (yampiProvider?.config || {}) as Record<string, unknown>;

  const [yampiForm, setYampiForm] = useState<Record<string, string>>({});

  const [errorDetailModal, setErrorDetailModal] = useState<unknown>(null);

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

  // Mutations
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
        .update({ config: newConfig, is_active: true })
        .eq("id", yampiProvider.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations-checkout-providers"] });
      setShowYampiModal(false);
      toast({ title: "Configuração Yampi salva!" });
    },
  });

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("integrations-test", {
        body: { provider: "yampi" },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["checkout-test-logs"] });
      toast({
        title: data?.status === "success" ? "Conexão OK!" : "Falha na conexão",
        description: data?.message,
        variant: data?.status === "success" ? "default" : "destructive",
      });
    } catch (err: unknown) {
      toast({ title: "Erro no teste", description: (err as Error).message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const [syncProgress, setSyncProgress] = useState("");

  const syncCatalog = async () => {
    setSyncing(true);
    setSyncProgress("Iniciando...");
    const BATCH_SIZE = 3;
    let offset = 0;
    let syncRunId: string | null = null;
    let totalCreated = 0, totalSkus = 0, totalUpdated = 0, totalErrors = 0;

    try {
      while (true) {
        setSyncProgress(`Processando produtos ${offset + 1}-${offset + BATCH_SIZE}...`);
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
        setSyncProgress(`${processed}/${total} produtos processados`);

        if (!data?.has_more) break;
        offset += BATCH_SIZE;
      }

      queryClient.invalidateQueries({ queryKey: ["checkout-test-logs"] });
      queryClient.invalidateQueries({ queryKey: ["unmapped-yampi-products"] });
      queryClient.invalidateQueries({ queryKey: ["unmapped-yampi-variants"] });
      refetchSyncRun();
      toast({
        title: "Sincronização concluída!",
        description: `${totalCreated} produtos criados, ${totalSkus} SKUs criados, ${totalUpdated} atualizados, ${totalErrors} erros`,
        variant: totalErrors > 0 ? "destructive" : "default",
      });
    } catch (err: unknown) {
      toast({ title: "Erro na sincronização", description: (err as Error).message, variant: "destructive" });
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
      queryClient.invalidateQueries({ queryKey: ["checkout-test-logs"] });
      toast({
        title: "Categorias sincronizadas!",
        description: `${data?.created || 0} criadas, ${data?.matched || 0} mapeadas, ${data?.errors || 0} erros`,
        variant: data?.errors > 0 ? "destructive" : "default",
      });
    } catch (err: unknown) {
      toast({ title: "Erro ao sincronizar categorias", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSyncingCategories(false);
    }
  };

  const syncVariations = async () => {
    setSyncingVariations(true);
    try {
      const { data, error } = await supabase.functions.invoke("yampi-sync-variation-values");
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["checkout-test-logs"] });
      toast({
        title: "Variações sincronizadas!",
        description: `${data?.created || 0} criadas, ${data?.matched || 0} mapeadas, ${data?.errors || 0} erros`,
        variant: data?.errors > 0 ? "destructive" : "default",
      });
    } catch (err: unknown) {
      toast({ title: "Erro ao sincronizar variações", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSyncingVariations(false);
    }
  };

  const syncImages = async () => {
    setSyncingImages(true);
    setImageProgress("Iniciando...");
    setImageLogs([]);
    setShowImageLogs(true);
    const BATCH_SIZE = 10;
    let offset = 0;
    let totalUploaded = 0, totalSkipped = 0, totalErrors = 0;
    const allLogs: typeof imageLogs = [];

    try {
      while (true) {
        setImageProgress(`Processando produtos ${offset + 1}-${offset + BATCH_SIZE}...`);
        const { data, error } = await supabase.functions.invoke("yampi-sync-images", {
          body: { offset, limit: BATCH_SIZE },
        });
        if (error) throw error;

        totalUploaded += data?.uploaded || 0;
        totalSkipped += data?.skipped || 0;
        totalErrors += data?.errors || 0;

        if (data?.logs) {
          allLogs.push(...data.logs);
          setImageLogs([...allLogs]);
        }

        const total = data?.total || 0;
        const processed = offset + (data?.processed || 0);
        setImageProgress(`${processed}/${total} produtos processados`);

        if (!data?.has_more) break;
        offset += BATCH_SIZE;
      }

      toast({
        title: "Imagens sincronizadas!",
        description: `${totalUploaded} enviadas, ${totalSkipped} puladas, ${totalErrors} erros`,
        variant: totalErrors > 0 ? "destructive" : "default",
      });
    } catch (err: unknown) {
      toast({ title: "Erro ao sincronizar imagens", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSyncingImages(false);
      setImageProgress("");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const webhookUrl = projectId ? `https://${projectId}.supabase.co/functions/v1/yampi-webhook` : "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Checkout Transparente
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure o checkout transparente para processar pagamentos via Yampi ou outro provider.
        </p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Status do Checkout
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Provider Ativo</p>
              <Badge variant={checkoutConfig?.enabled ? "default" : "secondary"}>
                {checkoutConfig?.enabled ? checkoutConfig.provider?.toUpperCase() : "DESATIVADO"}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Última Compra</p>
              <p className="text-sm font-medium">
                {lastOrder ? format(new Date(lastOrder.created_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Fallback</p>
              <Badge variant={checkoutConfig?.fallback_to_native ? "outline" : "secondary"}>
                {checkoutConfig?.fallback_to_native ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Erros Recentes</p>
              <p className="text-sm font-medium">
                {testLogs?.filter((l) => l.status === "error").length || 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Configurações Gerais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Ativar checkout transparente</Label>
              <p className="text-xs text-muted-foreground">Redireciona para o provider configurado</p>
            </div>
            <Switch
              checked={checkoutConfig?.enabled || false}
              onCheckedChange={(enabled) => updateConfig.mutate({ enabled })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Fallback para checkout nativo</Label>
              <p className="text-xs text-muted-foreground">Se o provider falhar, usa o checkout do site</p>
            </div>
            <Switch
              checked={checkoutConfig?.fallback_to_native || false}
              onCheckedChange={(fallback_to_native) => updateConfig.mutate({ fallback_to_native })}
            />
          </div>

          <div className="space-y-1">
            <Label>Provider</Label>
            <Select
              value={checkoutConfig?.provider || "native"}
              onValueChange={(provider) => updateConfig.mutate({ provider })}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="native">Nativo</SelectItem>
                <SelectItem value="yampi">Yampi</SelectItem>
                <SelectItem value="appmax">Appmax</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stripe: ativar/desativar checkout Stripe (cartão + PIX no seu site) */}
      <StripeCheckoutToggle providers={providers} queryClient={queryClient} toast={toast} />

      {/* Provider Card: Yampi */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Plug className="h-4 w-4" />
                Yampi
              </CardTitle>
              <CardDescription>Checkout transparente via Yampi</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={testConnection} disabled={testing}>
                {testing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Testar
              </Button>
              <Button size="sm" onClick={openYampiModal}>
                <Settings2 className="h-3 w-3 mr-1" />
                Configurar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Alias:</span>{" "}
              <span className="font-mono">{(yampiConfig.alias as string) || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Modo:</span>{" "}
              <Badge variant="outline" className="text-[10px]">{(yampiConfig.mode as string) || "redirect"}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Estoque:</span>{" "}
              <Badge variant="outline" className="text-[10px]">{(yampiConfig.stock_mode as string) || "reserve"}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Sync:</span>{" "}
              <Badge variant={yampiConfig.sync_enabled ? "default" : "secondary"} className="text-[10px]">
                {yampiConfig.sync_enabled ? "Ativo" : "Inativo"}
              </Badge>
            </div>
          </div>

          {webhookUrl && (
            <div className="bg-muted/50 rounded-md p-2 space-y-1">
              <p className="text-xs font-medium">URL do Webhook (configure na Yampi):</p>
              <div className="flex items-center gap-1">
                <code className="text-[10px] font-mono bg-background px-2 py-1 rounded flex-1 overflow-x-auto">
                  {webhookUrl}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
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
        </CardContent>
      </Card>

      {/* Catalog Sync */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Sincronização de Catálogo
              </CardTitle>
              <CardDescription>Replica produtos ativos do seu site para a Yampi</CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={syncCategories}
                disabled={syncingCategories}
              >
                {syncingCategories ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Package className="h-3 w-3 mr-1" />}
                {syncingCategories ? "Sincronizando..." : "Sync Categorias"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={syncVariations}
                disabled={syncingVariations}
              >
                {syncingVariations ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Package className="h-3 w-3 mr-1" />}
                {syncingVariations ? "Sincronizando..." : "Sync Variações"}
              </Button>
              <Button
                size="sm"
                onClick={syncCatalog}
                disabled={syncing}
              >
                {syncing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Database className="h-3 w-3 mr-1" />}
                {syncing ? (syncProgress || "Sincronizando...") : "Sincronizar catálogo (ativos)"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={syncImages}
                disabled={syncingImages}
              >
                {syncingImages ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                {syncingImages ? (imageProgress || "Enviando...") : "Sincronizar imagens"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {lastSyncRun ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                <div className="text-center p-2 rounded border bg-muted/30">
                  <p className="text-muted-foreground">Produtos criados</p>
                  <p className="text-lg font-bold text-primary">{(lastSyncRun as any).created_products || 0}</p>
                </div>
                <div className="text-center p-2 rounded border bg-muted/30">
                  <p className="text-muted-foreground">SKUs criados</p>
                  <p className="text-lg font-bold text-primary">{(lastSyncRun as any).created_skus || 0}</p>
                </div>
                <div className="text-center p-2 rounded border bg-muted/30">
                  <p className="text-muted-foreground">SKUs atualizados</p>
                  <p className="text-lg font-bold">{(lastSyncRun as any).updated_skus || 0}</p>
                </div>
                <div className="text-center p-2 rounded border bg-muted/30">
                  <p className="text-muted-foreground">Inativos ignorados</p>
                  <p className="text-lg font-bold text-muted-foreground">{(lastSyncRun as any).skipped_inactive || 0}</p>
                </div>
                <div className="text-center p-2 rounded border bg-muted/30">
                  <p className="text-muted-foreground">Erros</p>
                  <p className={`text-lg font-bold ${(lastSyncRun as any).errors_count > 0 ? "text-destructive" : "text-primary"}`}>
                    {(lastSyncRun as any).errors_count || 0}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Último sync: {format(new Date((lastSyncRun as any).started_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                <Badge variant={(lastSyncRun as any).status === "success" ? "default" : "secondary"} className="text-[10px]">
                  {(lastSyncRun as any).status}
                </Badge>
              </div>
              {(lastSyncRun as any).errors_count > 0 && (lastSyncRun as any).error_details && (
                <div className="border rounded p-2 max-h-48 overflow-y-auto">
                  <p className="text-xs font-medium mb-1 flex items-center gap-1">
                    <XCircle className="h-3 w-3 text-destructive" /> Erros recentes
                  </p>
                  {((lastSyncRun as any).error_details as any[]).slice(0, 10).map((err: any, i: number) => (
                    <div key={i} className="text-[10px] border-b py-1 last:border-0 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>
                          <span className="font-mono text-muted-foreground">{err.product_id?.slice(0, 8)}...</span>{" "}
                          {err.message}
                        </span>
                        {(err.response_body || err.sent_payload) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 text-[9px] px-1"
                            onClick={() => setErrorDetailModal(err)}
                          >
                            Ver detalhes
                          </Button>
                        )}
                      </div>
                      {err.response_body && (
                        <pre className="text-[9px] bg-muted/50 p-1 rounded overflow-x-auto max-h-16">
                          {JSON.stringify(err.response_body, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhuma sincronização realizada ainda. Clique em "Sincronizar catálogo" para iniciar.</p>
          )}
        </CardContent>
      </Card>

      {/* Mapping Validator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Validador de Mapeamento
          </CardTitle>
          <CardDescription>Produtos e variantes sem ID Yampi configurado</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-xs font-medium mb-2">
              Produtos sem yampi_product_id ({unmappedProducts?.length || 0})
            </h4>
            {(unmappedProducts?.length || 0) > 0 ? (
              <div className="max-h-32 overflow-y-auto border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Nome</TableHead>
                      <TableHead className="text-xs">SKU</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unmappedProducts?.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{p.name}</TableCell>
                        <TableCell className="text-xs font-mono">{p.sku || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Check className="h-3 w-3 text-green-600" /> Todos mapeados
              </p>
            )}
          </div>

          <Separator />

          <div>
            <h4 className="text-xs font-medium mb-2">
              Variantes sem yampi_sku_id ({unmappedVariants?.length || 0})
            </h4>
            {(unmappedVariants?.length || 0) > 0 ? (
              <div className="max-h-32 overflow-y-auto border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Produto</TableHead>
                      <TableHead className="text-xs">Tamanho</TableHead>
                      <TableHead className="text-xs">Cor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unmappedVariants?.map((v: any) => (
                      <TableRow key={v.id}>
                        <TableCell className="text-xs">{v.products?.name || "—"}</TableCell>
                        <TableCell className="text-xs">{v.size}</TableCell>
                        <TableCell className="text-xs">{v.color || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Check className="h-3 w-3 text-green-600" /> Todos mapeados
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Image Sync Logs */}
      {showImageLogs && imageLogs.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Logs de Imagens ({imageLogs.length})
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setShowImageLogs(false)}>
                Fechar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-y-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Produto</TableHead>
                    <TableHead className="text-[10px]">SKU ID</TableHead>
                    <TableHead className="text-[10px]">Source URL</TableHead>
                    <TableHead className="text-[10px]">Yampi URL</TableHead>
                    <TableHead className="text-[10px]">HEAD</TableHead>
                    <TableHead className="text-[10px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {imageLogs.map((log, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-[10px] max-w-[120px] truncate" title={log.product_name}>
                        {log.product_name || log.product_id?.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">{log.sku_id}</TableCell>
                      <TableCell className="text-[10px] max-w-[150px] truncate" title={log.source_url}>
                        {log.source_url}
                      </TableCell>
                      <TableCell className="text-[10px] max-w-[150px] truncate" title={log.yampi_returned_url || "—"}>
                        {log.yampi_returned_url || "—"}
                      </TableCell>
                      <TableCell className="text-[10px]">
                        {log.head_status !== null ? (
                          <Badge variant={log.head_status === 200 ? "default" : "destructive"} className="text-[9px]">
                            {log.head_status}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-[10px]">
                        <Badge
                          variant={log.status === "success" ? "default" : log.status === "skipped" ? "secondary" : "destructive"}
                          className="text-[9px]"
                        >
                          {log.status}
                        </Badge>
                        {log.error && (
                          <p className="text-[9px] text-destructive mt-0.5 max-w-[200px] truncate" title={log.error}>
                            {log.error}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Últimos Logs de Teste
          </CardTitle>
        </CardHeader>
        <CardContent>
          {testLogs?.length ? (
            <div className="space-y-2">
              {testLogs.map((log) => (
                <div
                  key={log.id}
                  className={`text-xs p-2 rounded border ${
                    log.status === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Badge variant={log.status === "success" ? "default" : "destructive"} className="text-[10px]">
                      {log.status}
                    </Badge>
                    <span className="text-muted-foreground">
                      {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="mt-1">{log.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhum log encontrado</p>
          )}
        </CardContent>
      </Card>

      {/* Yampi Config Modal */}
      <Dialog open={showYampiModal} onOpenChange={setShowYampiModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurar Yampi</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Alias da Loja</Label>
              <Input
                value={yampiForm.alias || ""}
                onChange={(e) => setYampiForm((p) => ({ ...p, alias: e.target.value }))}
                placeholder="minha-loja"
                className="text-xs h-8"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">User Token</Label>
              <Input
                value={yampiForm.user_token || ""}
                onChange={(e) => setYampiForm((p) => ({ ...p, user_token: e.target.value }))}
                placeholder="Token do usuário"
                className="text-xs h-8"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">User Secret Key</Label>
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  value={yampiForm.user_secret_key || ""}
                  onChange={(e) => setYampiForm((p) => ({ ...p, user_secret_key: e.target.value }))}
                  placeholder="Secret key do usuário"
                  className="text-xs h-8 pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <Separator />

            <div className="space-y-1">
              <Label className="text-xs">Brand ID padrão (Yampi)</Label>
              <Input
                value={yampiForm.default_brand_id || ""}
                onChange={(e) => setYampiForm((p) => ({ ...p, default_brand_id: e.target.value }))}
                placeholder="Deixe vazio para auto-detectar"
                className="text-xs h-8"
                type="number"
              />
              <p className="text-[10px] text-muted-foreground">ID da marca na Yampi. Se vazio, será buscado/criado automaticamente.</p>
            </div>

            <Separator />

            <div className="space-y-1">
              <Label className="text-xs">Template do Nome do Checkout</Label>
              <Input
                value={yampiForm.checkout_name_template || ""}
                onChange={(e) => setYampiForm((p) => ({ ...p, checkout_name_template: e.target.value }))}
                placeholder="Pedido #{order_number}"
                className="text-xs h-8"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">URL de Sucesso</Label>
                <Input
                  value={yampiForm.success_url || ""}
                  onChange={(e) => setYampiForm((p) => ({ ...p, success_url: e.target.value }))}
                  placeholder="/pedido-confirmado/{order_id}"
                  className="text-xs h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">URL de Cancelamento</Label>
                <Input
                  value={yampiForm.cancel_url || ""}
                  onChange={(e) => setYampiForm((p) => ({ ...p, cancel_url: e.target.value }))}
                  placeholder="/carrinho"
                  className="text-xs h-8"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Modo</Label>
                <Select
                  value={yampiForm.mode || "redirect"}
                  onValueChange={(v) => setYampiForm((p) => ({ ...p, mode: v }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="redirect">Redirect</SelectItem>
                    <SelectItem value="embed_iframe">Embed (iframe)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Regra de Estoque</Label>
                <Select
                  value={yampiForm.stock_mode || "reserve"}
                  onValueChange={(v) => setYampiForm((p) => ({ ...p, stock_mode: v }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reserve">Reservar (débito no pagamento)</SelectItem>
                    <SelectItem value="debit_immediate">Débito imediato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">Sincronizar SKUs automaticamente</Label>
                <p className="text-[10px] text-muted-foreground">Atualiza preço/estoque na Yampi antes do checkout</p>
              </div>
              <Switch
                checked={yampiForm.sync_enabled === "true"}
                onCheckedChange={(v) => setYampiForm((p) => ({ ...p, sync_enabled: String(v) }))}
              />
            </div>

            <Button
              onClick={() => saveYampiConfig.mutate()}
              disabled={saveYampiConfig.isPending}
              className="w-full"
            >
              {saveYampiConfig.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Configuração
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
                <p className="text-xs">{(errorDetailModal as any).message}</p>
              </div>
              {(errorDetailModal as any).response_body && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Resposta da Yampi</p>
                  <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-40">
                    {JSON.stringify((errorDetailModal as any).response_body, null, 2)}
                  </pre>
                </div>
              )}
              {(errorDetailModal as any).sent_payload && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Payload Enviado</p>
                  <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-40">
                    {JSON.stringify((errorDetailModal as any).sent_payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
