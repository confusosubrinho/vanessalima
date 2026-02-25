import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { compressImageToWebP } from '@/lib/imageCompressor';
import { darkenHex, lightenHex } from '@/hooks/useSiteTheme';
import { Upload, X, Check, ArrowRight, ArrowLeft, Store, ExternalLink } from 'lucide-react';

const STEPS = [
  { title: 'Identidade da Loja', icon: '🏪' },
  { title: 'Segmento', icon: '🎯' },
  { title: 'Tema Visual', icon: '🎨' },
  { title: 'Integrações', icon: '🔗' },
  { title: 'Pronto!', icon: '🎉' },
];

const SEGMENTS = [
  { id: 'shoes', icon: '👠', label: 'Calçados', categories: ['Tênis', 'Sandálias', 'Botas', 'Sapatos', 'Chinelos'] },
  { id: 'jewelry', icon: '💍', label: 'Bijuterias & Acessórios', categories: ['Colares', 'Brincos', 'Pulseiras', 'Anéis', 'Bolsas'] },
  { id: 'fashion', icon: '👗', label: 'Moda Feminina', categories: ['Vestidos', 'Blusas', 'Calças', 'Saias', 'Conjuntos'] },
  { id: 'home', icon: '🏠', label: 'Casa & Decoração', categories: ['Sala', 'Quarto', 'Cozinha', 'Banheiro', 'Jardim'] },
  { id: 'beauty', icon: '💄', label: 'Beleza & Cosméticos', categories: ['Maquiagem', 'Skincare', 'Cabelos', 'Perfumes', 'Unhas'] },
  { id: 'other', icon: '📦', label: 'Outros', categories: ['Categoria 1', 'Categoria 2', 'Categoria 3'] },
];

const GOOGLE_FONTS = [
  'Maven Pro', 'Lato', 'Inter', 'Poppins', 'Roboto', 'Open Sans', 'Montserrat',
  'Nunito', 'Raleway', 'Playfair Display', 'Merriweather', 'DM Sans', 'Outfit',
  'Sora', 'Space Grotesk', 'Plus Jakarta Sans', 'Jost', 'Mulish', 'Karla',
];

interface StoreForm {
  store_name: string;
  logo_url: string;
  favicon_url: string;
  contact_whatsapp: string;
  contact_email: string;
}

interface ThemeForm {
  primary_color: string;
  accent_color: string;
  background_color: string;
  font_family: string;
}

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);

  const [storeForm, setStoreForm] = useState<StoreForm>({
    store_name: '', logo_url: '', favicon_url: '', contact_whatsapp: '', contact_email: '',
  });

  const [themeForm, setThemeForm] = useState<ThemeForm>({
    primary_color: '#33cc99', accent_color: '#1a1a1a', background_color: '#ffffff', font_family: 'Maven Pro',
  });

  // Load current settings
  const { data: currentSettings } = useQuery({
    queryKey: ['setup-store-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('store_settings').select('*').limit(1).maybeSingle();
      return data;
    },
  });

  // Load integration statuses
  const { data: integrationStatus } = useQuery({
    queryKey: ['setup-integrations'],
    queryFn: async () => {
      const [appmax, instagram, shipping] = await Promise.all([
        supabase.from('appmax_settings').select('client_id').limit(1).maybeSingle(),
        supabase.from('instagram_videos').select('id', { count: 'exact' }).limit(1),
        supabase.from('store_settings').select('shipping_regions').limit(1).maybeSingle(),
      ]);
      return {
        appmax: !!appmax.data?.client_id,
        bling: !!(currentSettings as Record<string, unknown>)?.bling_client_id,
        instagram: (instagram.count || 0) > 0,
        shipping: !!(shipping.data?.shipping_regions),
      };
    },
    enabled: step === 4,
  });

  useEffect(() => {
    if (currentSettings) {
      setStoreForm(prev => ({
        ...prev,
        store_name: currentSettings.store_name === 'Minha Loja' ? '' : (currentSettings.store_name || ''),
        logo_url: currentSettings.logo_url || '',
        favicon_url: (currentSettings as { favicon_url?: string }).favicon_url || '',
        contact_whatsapp: currentSettings.contact_whatsapp || '',
        contact_email: currentSettings.contact_email || '',
      }));
    }
  }, [currentSettings]);

  const saveStoreMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('store_settings').update({
        store_name: storeForm.store_name || 'Minha Loja',
        logo_url: storeForm.logo_url || null,
        favicon_url: storeForm.favicon_url || null,
        contact_whatsapp: storeForm.contact_whatsapp || null,
        contact_email: storeForm.contact_email || null,
      }).neq('id', '00000000-0000-0000-0000-000000000000'); // update all rows
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-settings'] });
      queryClient.invalidateQueries({ queryKey: ['store-settings-public'] });
      toast({ title: 'Dados da loja salvos!' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const saveThemeMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        primary_color: themeForm.primary_color,
        primary_color_dark: darkenHex(themeForm.primary_color),
        primary_color_light: lightenHex(themeForm.primary_color),
        accent_color: themeForm.accent_color,
        background_color: themeForm.background_color,
        text_color: themeForm.accent_color,
        font_family: themeForm.font_family,
        font_heading: themeForm.font_family,
      };
      // Try update first, then insert
      const { data: existing } = await supabase.from('site_theme').select('id').limit(1).maybeSingle();
      if (existing?.id) {
        const { error } = await supabase.from('site_theme').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('site_theme').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-theme'] });
      toast({ title: 'Tema salvo!' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const { data: setup } = await supabase.from('store_setup').select('id').limit(1).maybeSingle();
      if (setup?.id) {
        await supabase.from('store_setup').update({ setup_completed: true }).eq('id', setup.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-setup'] });
      onComplete();
    },
  });

  const handleLogoUpload = async (file: File) => {
    setUploading(true);
    try {
      const { file: compressed, fileName } = await compressImageToWebP(file);
      const { error } = await supabase.storage.from('product-media').upload(fileName, compressed);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-media').getPublicUrl(fileName);
      setStoreForm(prev => ({ ...prev, logo_url: publicUrl }));
      toast({ title: 'Logo enviado!' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleFaviconUpload = async (file: File) => {
    setUploading(true);
    try {
      const { file: compressed, fileName } = await compressImageToWebP(file);
      const { error } = await supabase.storage.from('product-media').upload(`favicon-${fileName}`, compressed);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-media').getPublicUrl(`favicon-${fileName}`);
      setStoreForm(prev => ({ ...prev, favicon_url: publicUrl }));
      toast({ title: 'Favicon enviado!' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleNext = async () => {
    if (step === 1) {
      if (!storeForm.store_name.trim()) {
        toast({ title: 'Informe o nome da loja', variant: 'destructive' });
        return;
      }
      await saveStoreMutation.mutateAsync();
    }
    if (step === 3) {
      await saveThemeMutation.mutateAsync();
    }
    if (step === 5) {
      completeMutation.mutate();
      return;
    }
    setStep(s => Math.min(s + 1, 5));
  };

  const handleSkip = () => {
    completeMutation.mutate();
  };

  const progress = (step / 5) * 100;

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-background border rounded-2xl shadow-2xl overflow-hidden">
        {/* Progress */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Passo {step} de 5</span>
            <button onClick={handleSkip} className="text-xs text-muted-foreground hover:text-foreground underline">
              Pular configuração
            </button>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between mt-2">
            {STEPS.map((s, i) => (
              <span key={i} className={`text-xs ${i + 1 <= step ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                {s.icon}
              </span>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[400px] flex flex-col">
          {step === 1 && (
            <div className="space-y-5 flex-1">
              <div>
                <h2 className="text-xl font-bold">🏪 Identidade da Loja</h2>
                <p className="text-sm text-muted-foreground">Configure as informações básicas da sua loja</p>
              </div>
              <div className="space-y-4">
                <div>
                  <Label>Nome da Loja *</Label>
                  <Input
                    value={storeForm.store_name}
                    onChange={e => setStoreForm(p => ({ ...p, store_name: e.target.value }))}
                    placeholder="Ex: Minha Loja Online"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Logo</Label>
                  <div className="flex items-center gap-4 mt-1">
                    <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center overflow-hidden border">
                      {storeForm.logo_url ? (
                        <img src={storeForm.logo_url} alt="Logo" className="h-full w-full object-contain" />
                      ) : (
                        <Store className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
                        <Button type="button" variant="outline" size="sm" asChild>
                          <span><Upload className="h-4 w-4 mr-1" />{uploading ? 'Enviando...' : 'Enviar logo'}</span>
                        </Button>
                      </label>
                      {storeForm.logo_url && (
                        <Button variant="ghost" size="sm" onClick={() => setStoreForm(p => ({ ...p, logo_url: '' }))}>
                          <X className="h-3 w-3 mr-1" />Remover
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Favicon</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-1">Ícone exibido na aba do navegador (PNG ou ICO, recomendado 32×32 ou 16×16)</p>
                  <div className="flex items-center gap-4 mt-1">
                    <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center overflow-hidden border">
                      {storeForm.favicon_url ? (
                        <img src={storeForm.favicon_url} alt="Favicon" className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-muted-foreground text-xl">🔖</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="cursor-pointer">
                        <input type="file" accept="image/*,.ico" className="hidden" onChange={e => e.target.files?.[0] && handleFaviconUpload(e.target.files[0])} />
                        <Button type="button" variant="outline" size="sm" asChild>
                          <span><Upload className="h-4 w-4 mr-1" />{uploading ? 'Enviando...' : 'Enviar favicon'}</span>
                        </Button>
                      </label>
                      {storeForm.favicon_url && (
                        <Button variant="ghost" size="sm" onClick={() => setStoreForm(p => ({ ...p, favicon_url: '' }))}>
                          <X className="h-3 w-3 mr-1" />Remover
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>WhatsApp</Label>
                    <Input
                      value={storeForm.contact_whatsapp}
                      onChange={e => setStoreForm(p => ({ ...p, contact_whatsapp: e.target.value }))}
                      placeholder="(00) 00000-0000"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>E-mail de contato</Label>
                    <Input
                      value={storeForm.contact_email}
                      onChange={e => setStoreForm(p => ({ ...p, contact_email: e.target.value }))}
                      placeholder="contato@minhaloja.com"
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 flex-1">
              <div>
                <h2 className="text-xl font-bold">🎯 Segmento de Negócio</h2>
                <p className="text-sm text-muted-foreground">Selecione o segmento da sua loja para sugestões personalizadas</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {SEGMENTS.map(seg => (
                  <button
                    key={seg.id}
                    onClick={() => setSelectedSegment(seg.id)}
                    className={`p-4 rounded-xl border-2 text-center transition-all hover:shadow-md ${
                      selectedSegment === seg.id
                        ? 'border-primary bg-primary/5 shadow-md'
                        : 'border-border hover:border-primary/30'
                    }`}
                  >
                    <span className="text-3xl">{seg.icon}</span>
                    <p className="text-sm font-medium mt-2">{seg.label}</p>
                  </button>
                ))}
              </div>
              {selectedSegment && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Categorias sugeridas:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SEGMENTS.find(s => s.id === selectedSegment)?.categories.map(cat => (
                      <span key={cat} className="text-xs bg-background px-2 py-1 rounded-full border">{cat}</span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Você poderá criar e editar categorias a qualquer momento no painel.</p>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 flex-1">
              <div>
                <h2 className="text-xl font-bold">🎨 Tema Visual</h2>
                <p className="text-sm text-muted-foreground">Escolha as cores e fonte da sua loja</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Cor Primária</Label>
                  <div className="flex gap-2 items-center mt-1">
                    <input type="color" value={themeForm.primary_color} onChange={e => setThemeForm(p => ({ ...p, primary_color: e.target.value }))} className="w-10 h-10 rounded cursor-pointer border-0 p-0" />
                    <Input value={themeForm.primary_color} onChange={e => setThemeForm(p => ({ ...p, primary_color: e.target.value }))} className="font-mono text-sm" maxLength={7} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Cor de Destaque</Label>
                  <div className="flex gap-2 items-center mt-1">
                    <input type="color" value={themeForm.accent_color} onChange={e => setThemeForm(p => ({ ...p, accent_color: e.target.value }))} className="w-10 h-10 rounded cursor-pointer border-0 p-0" />
                    <Input value={themeForm.accent_color} onChange={e => setThemeForm(p => ({ ...p, accent_color: e.target.value }))} className="font-mono text-sm" maxLength={7} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Cor de Fundo</Label>
                  <div className="flex gap-2 items-center mt-1">
                    <input type="color" value={themeForm.background_color} onChange={e => setThemeForm(p => ({ ...p, background_color: e.target.value }))} className="w-10 h-10 rounded cursor-pointer border-0 p-0" />
                    <Input value={themeForm.background_color} onChange={e => setThemeForm(p => ({ ...p, background_color: e.target.value }))} className="font-mono text-sm" maxLength={7} />
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Fonte</Label>
                <Select value={themeForm.font_family} onValueChange={v => setThemeForm(p => ({ ...p, font_family: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GOOGLE_FONTS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {/* Preview */}
              <div className="p-4 rounded-lg border space-y-2" style={{ backgroundColor: themeForm.background_color }}>
                <p className="text-xs text-muted-foreground">Preview:</p>
                <Button size="sm" style={{ backgroundColor: themeForm.primary_color, color: '#fff' }}>
                  Botão Primário
                </Button>
                <Button size="sm" variant="outline" style={{ borderColor: themeForm.accent_color, color: themeForm.accent_color }}>
                  Botão Outline
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5 flex-1">
              <div>
                <h2 className="text-xl font-bold">🔗 Integrações</h2>
                <p className="text-sm text-muted-foreground">Verifique o status das suas integrações (opcional)</p>
              </div>
              <div className="space-y-3">
                {[
                  { icon: '💳', name: 'Pagamentos (Appmax)', ok: integrationStatus?.appmax },
                  { icon: '📦', name: 'ERP (Bling)', ok: integrationStatus?.bling },
                  { icon: '📸', name: 'Feed do Instagram', ok: integrationStatus?.instagram },
                  { icon: '🚚', name: 'Frete', ok: integrationStatus?.shipping },
                ].map(item => (
                  <div key={item.name} className="flex items-center gap-3 p-3 rounded-lg border">
                    <span className="text-2xl">{item.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className={`text-xs ${item.ok ? 'text-green-600' : 'text-amber-500'}`}>
                        {item.ok ? '✅ Configurado' : '⚠️ Não configurado'}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigate('/admin/integracoes')}>
                      Configurar
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Este passo é apenas informativo. Você pode configurar integrações a qualquer momento.</p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6 flex-1 flex flex-col items-center justify-center text-center">
              <div className="text-6xl animate-bounce">🎉</div>
              <div>
                <h2 className="text-2xl font-bold">Tudo pronto!</h2>
                <p className="text-sm text-muted-foreground mt-1">Sua loja está configurada e pronta para receber produtos.</p>
              </div>
              <div className="text-left w-full max-w-sm space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Check className={`h-4 w-4 ${storeForm.store_name ? 'text-green-500' : 'text-muted-foreground'}`} />
                  <span>Nome da loja: <strong>{storeForm.store_name || 'Minha Loja'}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check className={`h-4 w-4 ${storeForm.logo_url ? 'text-green-500' : 'text-muted-foreground'}`} />
                  <span>{storeForm.logo_url ? 'Logo enviado' : 'Logo não enviado'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check className={`h-4 w-4 ${storeForm.favicon_url ? 'text-green-500' : 'text-muted-foreground'}`} />
                  <span>{storeForm.favicon_url ? 'Favicon enviado' : 'Favicon não enviado'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check className={`h-4 w-4 ${selectedSegment ? 'text-green-500' : 'text-muted-foreground'}`} />
                  <span>{selectedSegment ? `Segmento: ${SEGMENTS.find(s => s.id === selectedSegment)?.label}` : 'Segmento não selecionado'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  <span>Tema visual configurado</span>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <Button onClick={() => { completeMutation.mutate(); navigate('/admin/produtos'); }}>
                  Adicionar primeiro produto
                </Button>
                <Button variant="outline" onClick={() => { completeMutation.mutate(); window.open('/', '_blank'); }}>
                  <ExternalLink className="h-4 w-4 mr-1" />Ver minha loja
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        {step < 5 && (
          <div className="p-4 border-t flex justify-between">
            <Button variant="ghost" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}>
              <ArrowLeft className="h-4 w-4 mr-1" />Anterior
            </Button>
            <Button onClick={handleNext} disabled={saveStoreMutation.isPending || saveThemeMutation.isPending}>
              {saveStoreMutation.isPending || saveThemeMutation.isPending ? 'Salvando...' : step === 4 ? 'Finalizar' : 'Próximo'}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
