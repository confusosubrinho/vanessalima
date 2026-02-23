import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { compressImageToWebP } from '@/lib/imageCompressor';
import { Upload, Save, GripVertical, Trash2, X, Plus, Megaphone } from 'lucide-react';
import { useCategories } from '@/hooks/useProducts';

const AVAILABLE_ICONS = [
  { value: 'Percent', label: '% Porcentagem' },
  { value: 'Star', label: '⭐ Estrela' },
  { value: 'Sparkles', label: '✨ Brilho' },
  { value: 'Heart', label: '❤️ Coração' },
  { value: 'Gift', label: '🎁 Presente' },
  { value: 'Tag', label: '🏷️ Tag' },
  { value: 'Flame', label: '🔥 Fogo' },
  { value: 'Zap', label: '⚡ Raio' },
  { value: 'Crown', label: '👑 Coroa' },
  { value: 'ShoppingBag', label: '🛍️ Sacola' },
];

interface HeaderSettings {
  header_logo_url: string | null;
  header_subhead_text: string;
  header_highlight_text: string;
  header_highlight_url: string;
  header_highlight_icon: string;
  header_menu_order: string[];
}

export function HeaderCustomizer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: categories } = useCategories();
  const [uploading, setUploading] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-header-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_settings')
        .select('header_logo_url, header_subhead_text, header_highlight_text, header_highlight_url, header_highlight_icon, header_menu_order, logo_url')
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const [form, setForm] = useState<HeaderSettings | null>(null);

  // Initialize form from settings
  const currentForm: HeaderSettings = form || {
    header_logo_url: settings?.header_logo_url || '',
    header_subhead_text: settings?.header_subhead_text || 'Frete grátis para compras acima de R$ 399*',
    header_highlight_text: settings?.header_highlight_text || '',
    header_highlight_url: settings?.header_highlight_url || '',
    header_highlight_icon: settings?.header_highlight_icon || 'Percent',
    header_menu_order: (settings?.header_menu_order as string[]) || [],
  };

  const updateForm = (updates: Partial<HeaderSettings>) => {
    setForm(prev => ({ ...(prev || currentForm), ...updates }));
  };

  const handleLogoUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const { file: compressed, fileName } = await compressImageToWebP(file);
      const { error: uploadError } = await supabase.storage.from('product-media').upload(fileName, compressed);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('product-media').getPublicUrl(fileName);
      updateForm({ header_logo_url: publicUrl });
      toast({ title: 'Logo enviado!' });
    } catch (error: any) {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [toast]);

  const saveMutation = useMutation({
    mutationFn: async (data: HeaderSettings) => {
      const { error } = await supabase.from('store_settings').update({
        header_logo_url: data.header_logo_url || null,
        header_subhead_text: data.header_subhead_text,
        header_highlight_text: data.header_highlight_text,
        header_highlight_url: data.header_highlight_url,
        header_highlight_icon: data.header_highlight_icon,
        header_menu_order: data.header_menu_order,
      } as any).eq('id', settings?.id || (await supabase.from('store_settings').select('id').single()).data?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-header-settings'] });
      queryClient.invalidateQueries({ queryKey: ['store-settings-public'] });
      queryClient.invalidateQueries({ queryKey: ['store-settings'] });
      toast({ title: 'Header salvo com sucesso!' });
      setForm(null);
    },
    onError: (error: any) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  // Category ordering
  const menuCategories = categories || [];
  const orderedCategories = (() => {
    const order = currentForm.header_menu_order;
    if (!order || order.length === 0) return menuCategories;
    const ordered = order
      .map(id => menuCategories.find(c => c.id === id))
      .filter(Boolean) as typeof menuCategories;
    const remaining = menuCategories.filter(c => !order.includes(c.id));
    return [...ordered, ...remaining];
  })();

  const moveCategory = (fromIndex: number, toIndex: number) => {
    const ids = orderedCategories.map(c => c.id);
    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, moved);
    updateForm({ header_menu_order: ids });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Carregando...</p>;

  return (
    <div className="space-y-6">
      {/* Logo alternativo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Logo do Header</CardTitle>
          <CardDescription>Envie um logo alternativo para o header. Se vazio, usa o logo principal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="w-32 h-16 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
              {currentForm.header_logo_url ? (
                <img src={currentForm.header_logo_url} alt="Logo header" className="h-full object-contain" />
              ) : settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo original" className="h-full object-contain opacity-50" />
              ) : (
                <span className="text-xs text-muted-foreground">Sem logo</span>
              )}
            </div>
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
                <Button type="button" variant="outline" size="sm" asChild>
                  <span><Upload className="h-4 w-4 mr-1" />{uploading ? 'Enviando...' : 'Upload'}</span>
                </Button>
              </label>
              {currentForm.header_logo_url && (
                <Button type="button" variant="ghost" size="sm" onClick={() => updateForm({ header_logo_url: '' })}>
                  <X className="h-4 w-4 mr-1" />Remover
                </Button>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs">Ou cole a URL:</Label>
            <Input
              value={currentForm.header_logo_url || ''}
              onChange={e => updateForm({ header_logo_url: e.target.value })}
              placeholder="https://..."
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Texto da barra superior */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Barra Superior (Subhead)</CardTitle>
          <CardDescription>Texto exibido na faixa colorida no topo do header</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={currentForm.header_subhead_text}
            onChange={e => updateForm({ header_subhead_text: e.target.value })}
            placeholder="Frete grátis para compras acima de R$ 399*"
          />
        </CardContent>
      </Card>

      {/* Menu em destaque */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Menu em Destaque</CardTitle>
          <CardDescription>Botão destacado no menu de navegação</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Texto</Label>
              <Input
                value={currentForm.header_highlight_text}
                onChange={e => updateForm({ header_highlight_text: e.target.value })}
                placeholder="Ex: Promoções"
              />
            </div>
            <div>
              <Label>Link</Label>
              <Input
                value={currentForm.header_highlight_url}
                onChange={e => updateForm({ header_highlight_url: e.target.value })}
                placeholder="/categoria/slug"
              />
            </div>
          </div>
          <div>
            <Label>Ícone</Label>
            <Select value={currentForm.header_highlight_icon} onValueChange={v => updateForm({ header_highlight_icon: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_ICONS.map(icon => (
                  <SelectItem key={icon.value} value={icon.value}>{icon.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Ordem dos menus/categorias */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ordem das Categorias no Menu</CardTitle>
          <CardDescription>Arraste para reordenar as categorias exibidas no menu de navegação</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {orderedCategories.map((cat, index) => (
              <div key={cat.id} className="flex items-center gap-2 p-2 border rounded-lg bg-background">
                <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-mono text-muted-foreground w-5">{index + 1}</span>
                {cat.image_url && (
                  <img src={cat.image_url} alt={cat.name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                )}
                <span className="flex-1 text-sm font-medium truncate">{cat.name}</span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === 0}
                    onClick={() => moveCategory(index, index - 1)}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === orderedCategories.length - 1}
                    onClick={() => moveCategory(index, index + 1)}
                  >
                    ↓
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            💡 As primeiras 7 categorias aparecem diretamente no menu. As demais ficam em "Todas Categorias".
          </p>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate(currentForm)} disabled={saveMutation.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? 'Salvando...' : 'Salvar Configurações do Header'}
        </Button>
      </div>

      {/* Announcement Bar */}
      <AnnouncementBarConfig />
    </div>
  );
}

// ─── Announcement Bar Config ───

interface AnnMsg { text: string; link?: string | null; }
interface AnnConfig {
  id: string; is_active: boolean; messages: AnnMsg[]; bg_color: string; text_color: string;
  font_size: string; autoplay: boolean; autoplay_speed: number; closeable: boolean;
}

function AnnouncementBarConfig() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: config, isLoading } = useQuery({
    queryKey: ['admin-announcement-bar'],
    queryFn: async () => {
      const { data, error } = await supabase.from('announcement_bar' as any).select('*').limit(1).maybeSingle();
      if (error) throw error;
      return data as unknown as AnnConfig | null;
    },
  });

  const [form, setForm] = useState<AnnConfig | null>(null);
  const current = form || config;

  const update = (upd: Partial<AnnConfig>) => setForm(prev => ({ ...(prev || config!) as AnnConfig, ...upd }));

  const saveMutation = useMutation({
    mutationFn: async (d: AnnConfig) => {
      const { error } = await supabase.from('announcement_bar' as any).update({
        is_active: d.is_active, messages: d.messages as any, bg_color: d.bg_color, text_color: d.text_color,
        font_size: d.font_size, autoplay: d.autoplay, autoplay_speed: d.autoplay_speed, closeable: d.closeable,
      }).eq('id', d.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-announcement-bar'] });
      qc.invalidateQueries({ queryKey: ['announcement-bar'] });
      toast({ title: 'Barra de anúncios salva!' });
      setForm(null);
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  if (isLoading || !current) return null;

  const messages = current.messages || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Megaphone className="h-4 w-4" />Barra de Anúncios</CardTitle>
        <CardDescription>Faixa fixa no topo da loja com mensagens rotativas</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch checked={current.is_active} onCheckedChange={v => update({ is_active: v })} />
          <Label>{current.is_active ? 'Ativa' : 'Inativa'}</Label>
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Mensagens</Label>
          <div className="space-y-2">
            {messages.map((msg, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 space-y-1">
                  <Input value={msg.text} onChange={e => { const m = [...messages]; m[i] = { ...m[i], text: e.target.value }; update({ messages: m }); }} placeholder="Texto da mensagem" />
                  <Input value={msg.link || ''} onChange={e => { const m = [...messages]; m[i] = { ...m[i], link: e.target.value || null }; update({ messages: m }); }} placeholder="Link (opcional)" className="text-xs" />
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { const m = messages.filter((_, j) => j !== i); update({ messages: m }); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => update({ messages: [...messages, { text: '', link: null }] })}>
              <Plus className="h-4 w-4 mr-1" />Adicionar mensagem
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Cor de Fundo</Label>
            <div className="flex gap-2 mt-1">
              <input type="color" value={current.bg_color} onChange={e => update({ bg_color: e.target.value })} className="h-9 w-9 rounded border cursor-pointer" />
              <Input value={current.bg_color} onChange={e => update({ bg_color: e.target.value })} className="flex-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Cor do Texto</Label>
            <div className="flex gap-2 mt-1">
              <input type="color" value={current.text_color} onChange={e => update({ text_color: e.target.value })} className="h-9 w-9 rounded border cursor-pointer" />
              <Input value={current.text_color} onChange={e => update({ text_color: e.target.value })} className="flex-1" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={current.autoplay} onCheckedChange={v => update({ autoplay: v })} />
            <Label className="text-xs">Autoplay</Label>
          </div>
          {current.autoplay && (
            <div>
              <Label className="text-xs">Velocidade (s)</Label>
              <Input type="number" min={2} max={15} value={current.autoplay_speed} onChange={e => update({ autoplay_speed: Number(e.target.value) })} className="mt-1" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch checked={current.closeable} onCheckedChange={v => update({ closeable: v })} />
            <Label className="text-xs">Pode fechar</Label>
          </div>
        </div>

        {/* Preview */}
        {current.is_active && messages[0]?.text && (
          <div className="rounded-lg overflow-hidden">
            <div className="text-center py-1.5 px-4 text-sm font-medium" style={{ backgroundColor: current.bg_color, color: current.text_color }}>
              {messages[0].text}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={() => saveMutation.mutate(current as AnnConfig)} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />{saveMutation.isPending ? 'Salvando...' : 'Salvar Barra de Anúncios'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
