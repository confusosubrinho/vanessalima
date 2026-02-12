import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { compressImageToWebP } from '@/lib/imageCompressor';
import { Upload, Save, GripVertical, Trash2, X } from 'lucide-react';
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
    header_highlight_text: settings?.header_highlight_text || 'Bijuterias',
    header_highlight_url: settings?.header_highlight_url || '/bijuterias',
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
          <CardDescription>Botão destacado no menu de navegação (ex: Bijuterias)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Texto</Label>
              <Input
                value={currentForm.header_highlight_text}
                onChange={e => updateForm({ header_highlight_text: e.target.value })}
                placeholder="Bijuterias"
              />
            </div>
            <div>
              <Label>Link</Label>
              <Input
                value={currentForm.header_highlight_url}
                onChange={e => updateForm({ header_highlight_url: e.target.value })}
                placeholder="/bijuterias"
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
    </div>
  );
}
