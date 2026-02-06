import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Store, Phone, Mail, MapPin, Instagram, Facebook, Truck, CreditCard, Save } from 'lucide-react';

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
}

export default function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
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
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<StoreSettings>) => {
      if (settings?.id) {
        const { error } = await supabase
          .from('store_settings')
          .update(data)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('store_settings')
          .insert(data);
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
            <TabsTrigger value="shipping">Frete & Pagamento</TabsTrigger>
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome da Loja</Label>
                    <Input
                      value={formData.store_name || ''}
                      onChange={(e) => setFormData({ ...formData, store_name: e.target.value })}
                      placeholder="Minha Loja"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>URL do Logo</Label>
                    <Input
                      value={formData.logo_url || ''}
                      onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                </div>
                {formData.logo_url && (
                  <div>
                    <Label>Preview do Logo</Label>
                    <img src={formData.logo_url} alt="Logo" className="h-16 mt-2 object-contain" />
                  </div>
                )}
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
                  Frete & Pagamento
                </CardTitle>
                <CardDescription>Configurações de entrega e parcelamento</CardDescription>
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
                  <div className="space-y-2">
                    <Label>Máximo de Parcelas</Label>
                    <Input
                      type="number"
                      value={formData.max_installments || ''}
                      onChange={(e) => setFormData({ ...formData, max_installments: parseInt(e.target.value) })}
                      placeholder="6"
                    />
                  </div>
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
