import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Code, Save, AlertTriangle, BarChart3 } from 'lucide-react';

interface CodeSettings {
  id: string;
  head_code: string | null;
  body_code: string | null;
  google_analytics_id: string | null;
  facebook_pixel_id: string | null;
  tiktok_pixel_id: string | null;
}

export default function CodeSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    head_code: '',
    body_code: '',
    google_analytics_id: '',
    facebook_pixel_id: '',
    tiktok_pixel_id: '',
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
      return data as CodeSettings | null;
    },
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        head_code: settings.head_code || '',
        body_code: settings.body_code || '',
        google_analytics_id: settings.google_analytics_id || '',
        facebook_pixel_id: settings.facebook_pixel_id || '',
        tiktok_pixel_id: settings.tiktok_pixel_id || '',
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
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
      toast({ title: 'Códigos salvos!' });
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
        <h1 className="text-3xl font-bold">Código Externo</h1>
        <p className="text-muted-foreground">Adicione scripts, pixels e códigos de rastreamento</p>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Códigos inseridos aqui serão adicionados a todas as páginas da loja. 
          Certifique-se de que os códigos estão corretos para não afetar o funcionamento do site.
        </AlertDescription>
      </Alert>

      <form onSubmit={handleSubmit}>
        <Tabs defaultValue="pixels" className="space-y-6">
          <TabsList>
            <TabsTrigger value="pixels">Pixels & Analytics</TabsTrigger>
            <TabsTrigger value="head">Código Head</TabsTrigger>
            <TabsTrigger value="body">Código Body</TabsTrigger>
          </TabsList>

          <TabsContent value="pixels" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Pixels de Rastreamento
                </CardTitle>
                <CardDescription>
                  Configure seus pixels de conversão e analytics. Apenas o ID é necessário.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Google Analytics ID</Label>
                  <Input
                    value={formData.google_analytics_id}
                    onChange={(e) => setFormData({ ...formData, google_analytics_id: e.target.value })}
                    placeholder="G-XXXXXXXXXX ou UA-XXXXXXX-X"
                  />
                  <p className="text-xs text-muted-foreground">
                    Encontre seu ID em Google Analytics → Administrador → Propriedade → ID da medição
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Facebook Pixel ID</Label>
                  <Input
                    value={formData.facebook_pixel_id}
                    onChange={(e) => setFormData({ ...formData, facebook_pixel_id: e.target.value })}
                    placeholder="XXXXXXXXXXXXXXXX"
                  />
                  <p className="text-xs text-muted-foreground">
                    Encontre seu Pixel ID em Meta Business Suite → Eventos → Fontes de dados
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>TikTok Pixel ID</Label>
                  <Input
                    value={formData.tiktok_pixel_id}
                    onChange={(e) => setFormData({ ...formData, tiktok_pixel_id: e.target.value })}
                    placeholder="XXXXXXXXXXXXXXXX"
                  />
                  <p className="text-xs text-muted-foreground">
                    Encontre seu Pixel ID em TikTok Ads Manager → Biblioteca de ativos → Eventos
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="head" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  Código no Head
                </CardTitle>
                <CardDescription>
                  Este código será inserido dentro da tag &lt;head&gt; em todas as páginas.
                  Ideal para meta tags, scripts de analytics, CSS customizado, etc.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={formData.head_code}
                  onChange={(e) => setFormData({ ...formData, head_code: e.target.value })}
                  placeholder={`<!-- Exemplo: Meta tags, scripts, CSS -->
<meta name="google-site-verification" content="xxx" />
<script src="https://exemplo.com/script.js"></script>
<style>
  /* CSS customizado */
</style>`}
                  className="font-mono text-sm min-h-[300px]"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="body" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  Código no Body
                </CardTitle>
                <CardDescription>
                  Este código será inserido antes do fechamento da tag &lt;/body&gt;.
                  Ideal para widgets de chat, scripts que precisam rodar após o carregamento, etc.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={formData.body_code}
                  onChange={(e) => setFormData({ ...formData, body_code: e.target.value })}
                  placeholder={`<!-- Exemplo: Chat widgets, scripts -->
<script>
  // Widget de chat
  (function() {
    // código do widget
  })();
</script>

<!-- Noscript para pixels -->
<noscript>
  <img src="https://..." />
</noscript>`}
                  className="font-mono text-sm min-h-[300px]"
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end mt-6">
          <Button type="submit" disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? 'Salvando...' : 'Salvar Códigos'}
          </Button>
        </div>
      </form>
    </div>
  );
}
