import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard, Settings2, Check, AlertCircle, Loader2, RefreshCw,
  Eye, EyeOff, Save, Plug, ShoppingCart, Package, Activity, Clock,
  AlertTriangle, ExternalLink
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

export default function CheckoutSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showYampiModal, setShowYampiModal] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(false);
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

  // Yampi form state
  const yampiProvider = providers?.find((p) => p.provider === "yampi");
  const yampiConfig = (yampiProvider?.config || {}) as Record<string, unknown>;

  const [yampiForm, setYampiForm] = useState<Record<string, string>>({});

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
    </div>
  );
}
