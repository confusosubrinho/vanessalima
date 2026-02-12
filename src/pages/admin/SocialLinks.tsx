import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSocialLinksAdmin, SocialLink } from '@/hooks/useSocialLinks';
import { SocialIcon, getPlatformKey, PLATFORM_ICONS } from '@/components/store/SocialIcons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Plus, GripVertical, Trash2, Pencil, ExternalLink } from 'lucide-react';
import { useDragReorder } from '@/hooks/useDragReorder';

const PLATFORMS = [
  'Instagram', 'Facebook', 'WhatsApp', 'TikTok', 'Pinterest', 'YouTube', 'Kwai', 'Outro'
];

function SocialLinkForm({ link, onSave, onClose }: {
  link?: SocialLink;
  onSave: (data: Partial<SocialLink>) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(link?.name || '');
  const [url, setUrl] = useState(link?.url || '');
  const [customName, setCustomName] = useState('');
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const isCustom = name === 'Outro';
  const finalName = isCustom ? customName : name;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validations
    if (!['image/png', 'image/svg+xml'].includes(file.type)) {
      toast({ title: 'Formato inválido', description: 'Use PNG ou SVG com fundo transparente.', variant: 'destructive' });
      return;
    }
    if (file.size > 150 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 150KB.', variant: 'destructive' });
      return;
    }

    // Validate dimensions for PNG
    if (file.type === 'image/png') {
      const img = new Image();
      img.onload = () => {
        if (img.width !== img.height) {
          toast({ title: 'Proporção inválida', description: 'O ícone deve ser 1:1 (quadrado).', variant: 'destructive' });
          return;
        }
        if (img.width < 64 || img.width > 512) {
          toast({ title: 'Tamanho inválido', description: 'O ícone deve ter entre 64x64 e 512x512.', variant: 'destructive' });
          return;
        }
        setIconFile(file);
      };
      img.src = URL.createObjectURL(file);
    } else {
      setIconFile(file);
    }
  };

  const handleSubmit = async () => {
    if (!finalName || !url) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      let icon_image_url = link?.icon_image_url || null;
      let icon_type = getPlatformKey(finalName) ? 'default' : (link?.icon_type || 'default');

      if (iconFile) {
        const ext = iconFile.type === 'image/svg+xml' ? 'svg' : 'png';
        const path = `social-icons/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('product-media')
          .upload(path, iconFile, { contentType: iconFile.type, upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('product-media').getPublicUrl(path);
        icon_image_url = urlData.publicUrl;
        icon_type = 'custom';
      }

      await onSave({ name: finalName, url, icon_type, icon_image_url });
      onClose();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Plataforma</Label>
        <Select value={name} onValueChange={setName}>
          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
          <SelectContent>
            {PLATFORMS.map(p => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isCustom && (
        <div className="space-y-2">
          <Label>Nome personalizado</Label>
          <Input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Ex: Meu Blog" />
        </div>
      )}

      <div className="space-y-2">
        <Label>URL / Link</Label>
        <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
      </div>

      {(isCustom || !getPlatformKey(name)) && (
        <div className="space-y-2">
          <Label>Ícone personalizado (PNG/SVG, 1:1, max 150KB)</Label>
          <Input type="file" accept=".png,.svg" onChange={handleFileChange} />
        </div>
      )}

      {/* Preview */}
      {finalName && (
        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
          <span className="text-sm text-muted-foreground">Preview:</span>
          <SocialIcon
            link={{ id: '', name: finalName, url, icon_type: iconFile ? 'custom' : 'default', icon_image_url: iconFile ? URL.createObjectURL(iconFile) : null, sort_order: 0, is_active: true, created_at: '', updated_at: '' }}
            className="w-6 h-6"
          />
          <span className="text-sm font-medium">{finalName}</span>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? 'Salvando...' : (link ? 'Atualizar' : 'Adicionar')}
        </Button>
      </div>
    </div>
  );
}

export default function SocialLinksPage() {
  const { data: links, isLoading } = useSocialLinksAdmin();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<SocialLink | undefined>();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['social-links-admin'] });
    queryClient.invalidateQueries({ queryKey: ['social-links'] });
  };

  const handleSave = async (data: Partial<SocialLink>) => {
    if (editingLink) {
      const { error } = await (supabase.from('social_links' as any) as any)
        .update(data)
        .eq('id', editingLink.id);
      if (error) throw error;
      toast({ title: 'Rede atualizada!' });
    } else {
      const maxOrder = links?.reduce((max, l) => Math.max(max, l.sort_order), 0) || 0;
      const { error } = await (supabase.from('social_links' as any) as any)
        .insert({ ...data, sort_order: maxOrder + 1 });
      if (error) throw error;
      toast({ title: 'Rede adicionada!' });
    }
    invalidate();
  };

  const handleToggle = async (id: string, is_active: boolean) => {
    await (supabase.from('social_links' as any) as any).update({ is_active }).eq('id', id);
    invalidate();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta rede social?')) return;
    await (supabase.from('social_links' as any) as any).delete().eq('id', id);
    invalidate();
    toast({ title: 'Rede removida!' });
  };

  const handleReorder = async (reordered: SocialLink[]) => {
    const updates = reordered.map((item, idx) =>
      (supabase.from('social_links' as any) as any).update({ sort_order: idx + 1 }).eq('id', item.id)
    );
    await Promise.all(updates);
    invalidate();
  };

  const { getDragProps } = useDragReorder({ items: links || [], onReorder: handleReorder });
  const orderedItems = links || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Redes Sociais</h1>
          <p className="text-muted-foreground text-sm">Gerencie os links de redes sociais exibidos no site.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingLink(undefined); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingLink(undefined)}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingLink ? 'Editar Rede' : 'Nova Rede Social'}</DialogTitle>
            </DialogHeader>
            <SocialLinkForm
              link={editingLink}
              onSave={handleSave}
              onClose={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Preview bar */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-2">Preview (como aparece no site)</p>
          <div className="flex gap-4">
            {orderedItems.filter(l => l.is_active).map(link => (
              <div key={link.id} className="text-foreground">
                <SocialIcon link={link} className="w-6 h-6" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : (
        <div className="space-y-2">
          {orderedItems.map((link, idx) => (
            <Card key={link.id} className="group">
              <CardContent className="p-3 flex items-center gap-3">
                <div
                  className="cursor-grab text-muted-foreground hover:text-foreground"
                  draggable
                  {...getDragProps(idx)}
                >
                  <GripVertical className="h-4 w-4" />
                </div>

                <div className="w-8 h-8 flex items-center justify-center bg-muted rounded-lg flex-shrink-0">
                  <SocialIcon link={link} className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{link.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{link.url}</p>
                </div>

                <Switch
                  checked={link.is_active}
                  onCheckedChange={(v) => handleToggle(link.id, v)}
                />

                <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-4 w-4" />
                </a>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => { setEditingLink(link); setDialogOpen(true); }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(link.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
