import { useEffect, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Store, Phone, Save, Upload, Image, AlertTriangle, Shield, RefreshCw, LayoutGrid } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { ErrorLogsPanel } from '@/components/admin/ErrorLogsPanel';
import { TwoFactorSetup } from '@/components/admin/TwoFactorSetup';
import { APP_VERSION } from '@/lib/appVersion';
import { HelpHint } from '@/components/HelpHint';

interface StoreSettings {
  id: string;
  store_name: string | null;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  address: string | null;
  free_shipping_threshold: number | null;
}

export default function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [logoUploading, setLogoUploading] = useState(false);
  const [purging, setPurging] = useState(false);
  
  const [formData, setFormData] = useState<Partial<StoreSettings & { show_variants_on_grid: boolean }>>({
    store_name: '',
    logo_url: '',
    contact_email: '',
    contact_phone: '',
    contact_whatsapp: '',
    address: '',
    free_shipping_threshold: 399,
    show_variants_on_grid: true,
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['store-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_settings')
        .select('*')
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data as StoreSettings | null;
    },
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        store_name: settings.store_name || '',
        logo_url: settings.logo_url || '',
        contact_email: settings.contact_email || '',
        contact_phone: settings.contact_phone || '',
        contact_whatsapp: settings.contact_whatsapp || '',
        address: settings.address || '',
        free_shipping_threshold: settings.free_shipping_threshold || 399,
        show_variants_on_grid: (settings as any).show_variants_on_grid ?? true,
      });
    }
  }, [settings]);

  const handleLogoUpload = useCallback(async (file: File) => {
    setLogoUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('product-media')
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('product-media')
        .getPublicUrl(fileName);
      
      setFormData(prev => ({ ...prev, logo_url: publicUrl }));
      toast({ title: 'Logo enviado!' });
    } catch (error: any) {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
    } finally {
      setLogoUploading(false);
    }
  }, [toast]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<StoreSettings>) => {
      if (settings?.id) {
        const { error } = await supabase
          .from('store_settings')
          .update(data as any)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('store_settings')
          .insert(data as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-settings'] });
      toast({ title: 'Configurações salvas!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  if (isLoading) {
    return <div className="text-center py-8">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl sm:text-3xl font-bold">Configurações da Loja</h1>
        <HelpHint helpKey="admin.settings" />
      </div>
      <p className="text-muted-foreground">Gerencie as informações e configurações da sua loja</p>

      <form onSubmit={handleSubmit}>
        <Tabs defaultValue="general" className="space-y-6">
           <TabsList className="flex-wrap">
            <TabsTrigger value="general">Geral</TabsTrigger>
            <TabsTrigger value="contact">Contato</TabsTrigger>
            <TabsTrigger value="footer">Footer</TabsTrigger>
             <TabsTrigger value="security">
               <Shield className="h-3 w-3 mr-1" />
               Segurança
             </TabsTrigger>
              <TabsTrigger value="errors" className="text-destructive">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Logs
              </TabsTrigger>
              <TabsTrigger value="cache">
                <RefreshCw className="h-3 w-3 mr-1" />
                Cache
              </TabsTrigger>
           </TabsList>

           {/* Security Tab */}
           <TabsContent value="security">
             <TwoFactorSetup />
           </TabsContent>

           {/* Error Logs Tab */}
           <TabsContent value="errors">
             <Card>
               <CardContent className="pt-6">
                 <ErrorLogsPanel />
               </CardContent>
             </Card>
           </TabsContent>

          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="h-5 w-5" />
                  Informações da Loja
                </CardTitle>
                <CardDescription>Dados básicos que aparecem na sua loja</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome da Loja</Label>
                  <Input
                    value={formData.store_name || ''}
                    onChange={(e) => setFormData({ ...formData, store_name: e.target.value })}
                    placeholder="Minha Loja"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Logo da Loja</Label>
                  <div className="flex items-start gap-4">
                    {formData.logo_url && (
                      <img src={formData.logo_url} alt="Logo" className="h-16 object-contain rounded border p-1" />
                    )}
                    <div className="flex-1 space-y-2">
                      <label className="cursor-pointer block">
                        <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary transition-colors">
                          <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            {logoUploading ? 'Enviando...' : 'Clique para enviar o logo'}
                          </p>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
                          disabled={logoUploading}
                        />
                      </label>
                      <Input
                        value={formData.logo_url || ''}
                        onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                        placeholder="Ou cole a URL do logo"
                        className="text-xs"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LayoutGrid className="h-5 w-5" />
                  Exibição do Grid de Produtos
                </CardTitle>
                <CardDescription>Configure o que aparece nos cards de produto</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Mostrar variações no grid</Label>
                    <p className="text-xs text-muted-foreground">Exibe os tamanhos disponíveis nos cards de produto</p>
                  </div>
                  <Switch
                    checked={formData.show_variants_on_grid ?? true}
                    onCheckedChange={(checked) => setFormData({ ...formData, show_variants_on_grid: checked })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contact" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Informações de Contato
                </CardTitle>
                <CardDescription>Como os clientes podem entrar em contato</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      value={formData.contact_email || ''}
                      onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                      placeholder="contato@loja.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input
                      value={formData.contact_phone || ''}
                      onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>WhatsApp</Label>
                    <Input
                      value={formData.contact_whatsapp || ''}
                      onChange={(e) => setFormData({ ...formData, contact_whatsapp: e.target.value })}
                      placeholder="5511999999999"
                    />
                    <p className="text-xs text-muted-foreground">Número com código do país (55) e DDD</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Endereço</Label>
                  <Textarea
                    value={formData.address || ''}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Rua, número, bairro, cidade - estado"
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Redes Sociais agora em /admin/redes-sociais */}

          {/* Shipping, Payments and Rede tabs moved to Integrações */}

          <TabsContent value="footer" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="h-5 w-5" />
                  Personalização do Footer
                </CardTitle>
                <CardDescription>Configure dados da empresa, selos de segurança e formas de pagamento que aparecem no rodapé</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>CNPJ</Label>
                    <Input
                      value={(formData as any).cnpj || ''}
                      onChange={(e) => setFormData({ ...formData, cnpj: e.target.value } as any)}
                      placeholder="00.000.000/0001-00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Endereço Completo</Label>
                    <Input
                      value={(formData as any).full_address || ''}
                      onChange={(e) => setFormData({ ...formData, full_address: e.target.value } as any)}
                      placeholder="Rua, Cidade - UF, CEP"
                    />
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
                  <p className="font-medium">Informações exibidas no footer:</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    <li>Formas de pagamento (Visa, Mastercard, Elo, etc.) e selos de segurança são exibidos automaticamente.</li>
                    <li>Para personalizar as imagens dos selos e bandeiras, entre em contato com o suporte.</li>
                    <li>O CNPJ e endereço aparecem na linha de dados da empresa.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

           {/* Cache Tab */}
           <TabsContent value="cache">
             <Card>
               <CardHeader>
                 <CardTitle className="flex items-center gap-2">
                   <RefreshCw className="h-5 w-5" />
                   Gerenciamento de Cache
                 </CardTitle>
                 <CardDescription>Force todos os visitantes a carregar a versão mais recente do site</CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                 <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                   <p className="text-sm font-medium">Versão atual: <code className="bg-background px-2 py-0.5 rounded text-xs">{APP_VERSION}</code></p>
                   <p className="text-xs text-muted-foreground">
                     Ao clicar no botão abaixo, todos os usuários que estiverem com uma versão antiga serão forçados a recarregar automaticamente.
                   </p>
                 </div>
                 <Button
                   onClick={async () => {
                     setPurging(true);
                     try {
                       const newVersion = Date.now().toString();
                       const { data: s } = await supabase.from('store_settings').select('id').limit(1).maybeSingle();
                       if (s?.id) {
                         await supabase.from('store_settings').update({ app_version: newVersion } as any).eq('id', s.id);
                       } else {
                         await supabase.from('store_settings').insert({ app_version: newVersion } as any);
                       }
                       toast({ title: 'Cache limpo!', description: 'Todos os visitantes carregarão a versão mais recente.' });
                     } catch (err: any) {
                       toast({ title: 'Erro', description: err.message, variant: 'destructive' });
                     } finally {
                       setPurging(false);
                     }
                   }}
                   disabled={purging}
                   variant="destructive"
                   className="w-full"
                 >
                   <RefreshCw className={`h-4 w-4 mr-2 ${purging ? 'animate-spin' : ''}`} />
                   {purging ? 'Limpando...' : 'Forçar Atualização para Todos'}
                 </Button>
               </CardContent>
             </Card>
           </TabsContent>
        </Tabs>

        <div className="flex justify-end mt-6">
          <Button type="submit" disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </div>
      </form>
    </div>
  );
}
