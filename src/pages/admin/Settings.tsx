import { useEffect, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Store, Phone, Instagram, Facebook, Truck, CreditCard, Save, Upload, Image } from 'lucide-react';

interface StoreSettings {
  id: string;
  store_name: string | null;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  address: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  free_shipping_threshold: number | null;
  max_installments: number | null;
  pix_discount: number | null;
  cash_discount: number | null;
  installment_interest_rate: number | null;
  min_installment_value: number | null;
  installments_without_interest: number | null;
}

export default function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [logoUploading, setLogoUploading] = useState(false);
  
  const [formData, setFormData] = useState<Partial<StoreSettings>>({
    store_name: '',
    logo_url: '',
    contact_email: '',
    contact_phone: '',
    contact_whatsapp: '',
    address: '',
    instagram_url: '',
    facebook_url: '',
    free_shipping_threshold: 399,
    max_installments: 6,
    pix_discount: 5,
    cash_discount: 5,
    installment_interest_rate: 0,
    min_installment_value: 30,
    installments_without_interest: 3,
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
        instagram_url: settings.instagram_url || '',
        facebook_url: settings.facebook_url || '',
        free_shipping_threshold: settings.free_shipping_threshold || 399,
        max_installments: settings.max_installments || 6,
        pix_discount: (settings as any).pix_discount ?? 5,
        cash_discount: (settings as any).cash_discount ?? 5,
        installment_interest_rate: (settings as any).installment_interest_rate ?? 0,
        min_installment_value: (settings as any).min_installment_value ?? 30,
        installments_without_interest: (settings as any).installments_without_interest ?? 3,
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
      <div>
        <h1 className="text-3xl font-bold">Configurações da Loja</h1>
        <p className="text-muted-foreground">Gerencie as informações e configurações da sua loja</p>
      </div>

      <form onSubmit={handleSubmit}>
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList>
            <TabsTrigger value="general">Geral</TabsTrigger>
            <TabsTrigger value="contact">Contato</TabsTrigger>
            <TabsTrigger value="social">Redes Sociais</TabsTrigger>
            <TabsTrigger value="shipping">Frete</TabsTrigger>
            <TabsTrigger value="payments">Pagamentos</TabsTrigger>
          </TabsList>

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
                <div className="grid grid-cols-2 gap-4">
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
                <div className="grid grid-cols-2 gap-4">
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

          <TabsContent value="social" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Instagram className="h-5 w-5" />
                  Redes Sociais
                </CardTitle>
                <CardDescription>Links para suas redes sociais</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Instagram className="h-4 w-4" />
                      Instagram
                    </Label>
                    <Input
                      value={formData.instagram_url || ''}
                      onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
                      placeholder="https://instagram.com/sualoja"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Facebook className="h-4 w-4" />
                      Facebook
                    </Label>
                    <Input
                      value={formData.facebook_url || ''}
                      onChange={(e) => setFormData({ ...formData, facebook_url: e.target.value })}
                      placeholder="https://facebook.com/sualoja"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="shipping" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Frete
                </CardTitle>
                <CardDescription>Configurações de entrega</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Frete Grátis a partir de (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.free_shipping_threshold || ''}
                      onChange={(e) => setFormData({ ...formData, free_shipping_threshold: parseFloat(e.target.value) })}
                      placeholder="399.00"
                    />
                    <p className="text-xs text-muted-foreground">Deixe 0 para desabilitar frete grátis</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Pagamentos e Cartões
                </CardTitle>
                <CardDescription>Configure taxas de juros, descontos à vista e Pix</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Desconto no Pix (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.pix_discount ?? ''}
                      onChange={(e) => setFormData({ ...formData, pix_discount: parseFloat(e.target.value) })}
                      placeholder="5"
                    />
                    <p className="text-xs text-muted-foreground">Percentual de desconto para pagamento via Pix</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Desconto à Vista (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.cash_discount ?? ''}
                      onChange={(e) => setFormData({ ...formData, cash_discount: parseFloat(e.target.value) })}
                      placeholder="5"
                    />
                    <p className="text-xs text-muted-foreground">Percentual de desconto para pagamento à vista</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Máximo de Parcelas</Label>
                    <Input
                      type="number"
                      value={formData.max_installments || ''}
                      onChange={(e) => setFormData({ ...formData, max_installments: parseInt(e.target.value) })}
                      placeholder="6"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Parcelas sem Juros</Label>
                    <Input
                      type="number"
                      value={formData.installments_without_interest ?? ''}
                      onChange={(e) => setFormData({ ...formData, installments_without_interest: parseInt(e.target.value) })}
                      placeholder="3"
                    />
                    <p className="text-xs text-muted-foreground">Até quantas parcelas sem juros</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Taxa de Juros (%/mês)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.installment_interest_rate ?? ''}
                      onChange={(e) => setFormData({ ...formData, installment_interest_rate: parseFloat(e.target.value) })}
                      placeholder="1.99"
                    />
                    <p className="text-xs text-muted-foreground">Juros para parcelas acima do sem juros</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Valor mínimo da parcela (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.min_installment_value ?? ''}
                    onChange={(e) => setFormData({ ...formData, min_installment_value: parseFloat(e.target.value) })}
                    placeholder="30"
                  />
                  <p className="text-xs text-muted-foreground">Parcela mínima para habilitar parcelamento</p>
                </div>
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
