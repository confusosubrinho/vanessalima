import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDragReorder } from '@/hooks/useDragReorder';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { compressImageToWebP } from '@/lib/imageCompressor';
import { Plus, Pencil, Trash2, GripVertical, Upload } from 'lucide-react';

interface FeatureItem {
  id: string;
  title: string;
  subtitle: string | null;
  icon_url: string | null;
  display_order: number;
  is_active: boolean;
}

export function FeaturesBarManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FeatureItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({ title: '', subtitle: '', icon_url: '', is_active: true });

  const { data: items, isLoading } = useQuery({
    queryKey: ['admin-features-bar'],
    queryFn: async () => {
      const { data, error } = await supabase.from('features_bar').select('*').order('display_order');
      if (error) throw error;
      return (data as unknown as FeatureItem[]) || [];
    },
  });

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      // Accept SVG directly
      let uploadFile: File | Blob = file;
      let fileName = `features/${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (file.type === 'image/svg+xml') {
        fileName += '.svg';
        uploadFile = file;
      } else {
        const result = await compressImageToWebP(file);
        uploadFile = result.file;
        fileName = result.fileName;
      }

      const { error } = await supabase.storage.from('product-media').upload(fileName, uploadFile);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-media').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, icon_url: publicUrl }));
      toast({ title: 'Ícone enviado!' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setUploading(false); }
  }, [toast]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload: any = {
        title: data.title,
        subtitle: data.subtitle || null,
        icon_url: data.icon_url || null,
        is_active: data.is_active,
        display_order: editing?.display_order ?? (items?.length || 0),
      };
      if (editing) {
        const { error } = await supabase.from('features_bar').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('features_bar').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-features-bar'] });
      queryClient.invalidateQueries({ queryKey: ['features-bar'] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: editing ? 'Atualizado!' : 'Criado!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('features_bar').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-features-bar'] });
      queryClient.invalidateQueries({ queryKey: ['features-bar'] });
      toast({ title: 'Excluído!' });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (reordered: FeatureItem[]) => {
      await Promise.all(reordered.map((item, i) =>
        supabase.from('features_bar').update({ display_order: i }).eq('id', item.id)
      ));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-features-bar'] });
      queryClient.invalidateQueries({ queryKey: ['features-bar'] });
    },
  });

  const { getDragProps } = useDragReorder({
    items: items || [],
    onReorder: (reordered) => {
      queryClient.setQueryData(['admin-features-bar'], reordered);
      reorderMutation.mutate(reordered);
    },
  });

  const resetForm = () => {
    setFormData({ title: '', subtitle: '', icon_url: '', is_active: true });
    setEditing(null);
  };

  const handleEdit = (item: FeatureItem) => {
    setEditing(item);
    setFormData({
      title: item.title,
      subtitle: item.subtitle || '',
      icon_url: item.icon_url || '',
      is_active: item.is_active,
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Barra de Recursos</h3>
          <p className="text-sm text-muted-foreground">Ícones exibidos abaixo do carrossel principal (Parcelamento, Envios, etc.)</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(o) => { setIsDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />Novo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing ? 'Editar Item' : 'Novo Item'}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-4">
              <div><Label>Título *</Label><Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required className="mt-1" /></div>
              <div><Label>Subtítulo</Label><Input value={formData.subtitle} onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })} className="mt-1" /></div>
              <div>
                <Label>Ícone (imagem ou SVG)</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={formData.icon_url} onChange={(e) => setFormData({ ...formData, icon_url: e.target.value })} placeholder="URL ou upload" />
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*,.svg" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                    <Button type="button" variant="outline" asChild><span><Upload className="h-4 w-4 mr-1" />{uploading ? '...' : 'Upload'}</span></Button>
                  </label>
                </div>
                {formData.icon_url && <img src={formData.icon_url} alt="Preview" className="h-10 w-10 object-contain mt-2 rounded bg-muted p-1" />}
              </div>
              <div className="flex items-center gap-2"><Switch checked={formData.is_active} onCheckedChange={(c) => setFormData({ ...formData, is_active: c })} /><Label>Ativo</Label></div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Salvando...' : 'Salvar'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground py-4">Carregando...</p> : !items?.length ? (
        <p className="text-sm text-muted-foreground py-4">Nenhum item cadastrado.</p>
      ) : (
        <div className="grid gap-2">
          {items.map((item, index) => (
            <Card key={item.id} className={!item.is_active ? 'opacity-50' : ''} {...getDragProps(index)}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
                  {item.icon_url ? (
                    <img src={item.icon_url} alt="" className="h-8 w-8 object-contain flex-shrink-0 rounded bg-muted p-1" />
                  ) : (
                    <div className="h-8 w-8 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground flex-shrink-0">—</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
