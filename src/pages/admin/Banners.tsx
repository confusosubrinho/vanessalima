import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Pencil, Trash2, GripVertical, Upload, Smartphone, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { useToast } from '@/hooks/use-toast';
import { compressImageToWebP } from '@/lib/imageCompressor';
import { useDragReorder } from '@/hooks/useDragReorder';

interface Banner {
  id: string;
  title: string | null;
  subtitle: string | null;
  image_url: string;
  mobile_image_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
  display_order: number;
  is_active: boolean;
  show_on_desktop: boolean;
  show_on_mobile: boolean;
  created_at: string;
  updated_at: string;
}

export default function Banners() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [uploading, setUploading] = useState<'desktop' | 'mobile' | null>(null);

  const [formData, setFormData] = useState({
    title: '', subtitle: '', image_url: '', mobile_image_url: '',
    cta_text: '', cta_url: '', is_active: true, show_on_desktop: true, show_on_mobile: true,
  });

  const { data: banners, isLoading } = useQuery({
    queryKey: ['admin-banners'],
    queryFn: async () => {
      const { data, error } = await supabase.from('banners').select('*').order('display_order', { ascending: true });
      if (error) throw error;
      return data as Banner[];
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (reordered: Banner[]) => {
      const updates = reordered.map((b, i) => supabase.from('banners').update({ display_order: i }).eq('id', b.id));
      await Promise.all(updates);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-banners'] }),
  });

  const { getDragProps } = useDragReorder({
    items: banners || [],
    onReorder: (reordered) => {
      queryClient.setQueryData(['admin-banners'], reordered);
      reorderMutation.mutate(reordered);
    },
  });

  const handleFileUpload = useCallback(async (file: File, type: 'desktop' | 'mobile') => {
    setUploading(type);
    try {
      const { file: compressedFile, fileName } = await compressImageToWebP(file);
      const { error: uploadError } = await supabase.storage.from('product-media').upload(fileName, compressedFile);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('product-media').getPublicUrl(fileName);
      if (type === 'desktop') setFormData(prev => ({ ...prev, image_url: publicUrl }));
      else setFormData(prev => ({ ...prev, mobile_image_url: publicUrl }));
      toast({ title: 'Imagem enviada!' });
    } catch (error: any) {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
    } finally { setUploading(null); }
  }, [toast]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const bannerData = {
        title: data.title || null, subtitle: data.subtitle || null,
        image_url: data.image_url, mobile_image_url: data.mobile_image_url || null,
        cta_text: data.cta_text || null, cta_url: data.cta_url || null,
        is_active: data.is_active,
        show_on_desktop: data.show_on_desktop,
        show_on_mobile: data.show_on_mobile,
        display_order: editingBanner?.display_order || (banners?.length || 0),
      };
      if (editingBanner) {
        const { error } = await supabase.from('banners').update(bannerData).eq('id', editingBanner.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('banners').insert(bannerData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-banners'] });
      setIsDialogOpen(false); resetForm();
      toast({ title: editingBanner ? 'Banner atualizado!' : 'Banner criado!' });
    },
    onError: (error: any) => toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('banners').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-banners'] });
      toast({ title: 'Banner excluído!' });
    },
  });

  const resetForm = () => {
    setFormData({ title: '', subtitle: '', image_url: '', mobile_image_url: '', cta_text: '', cta_url: '', is_active: true, show_on_desktop: true, show_on_mobile: true });
    setEditingBanner(null);
  };

  const handleEdit = (banner: Banner) => {
    setEditingBanner(banner);
    setFormData({
      title: banner.title || '', subtitle: banner.subtitle || '',
      image_url: banner.image_url, mobile_image_url: banner.mobile_image_url || '',
      cta_text: banner.cta_text || '', cta_url: banner.cta_url || '', is_active: banner.is_active,
      show_on_desktop: banner.show_on_desktop ?? true, show_on_mobile: banner.show_on_mobile ?? true,
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">Banners</h1>
          <p className="text-sm text-muted-foreground">Gerencie os banners do carrossel da home</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />Novo Banner</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingBanner ? 'Editar Banner' : 'Novo Banner'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-6">
              <Tabs defaultValue="desktop">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="desktop" className="flex items-center gap-2"><Monitor className="h-4 w-4" />Desktop</TabsTrigger>
                  <TabsTrigger value="mobile" className="flex items-center gap-2"><Smartphone className="h-4 w-4" />Mobile</TabsTrigger>
                </TabsList>
                <TabsContent value="desktop" className="space-y-4 mt-4">
                  <div>
                    <Label>Imagem Desktop (1920x600 recomendado) *</Label>
                    <div className="mt-2 space-y-3">
                      <div className="flex gap-2">
                        <Input value={formData.image_url} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} placeholder="https://... ou faça upload" required />
                        <label className="cursor-pointer">
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'desktop')} />
                          <Button type="button" variant="outline" asChild disabled={uploading === 'desktop'}>
                            <span><Upload className="h-4 w-4 mr-2" />{uploading === 'desktop' ? '...' : 'Upload'}</span>
                          </Button>
                        </label>
                      </div>
                      {formData.image_url && (
                        <AspectRatio ratio={16/5} className="bg-muted rounded-lg overflow-hidden">
                          <img src={formData.image_url} alt="Preview Desktop" className="w-full h-full object-cover" />
                        </AspectRatio>
                      )}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="mobile" className="space-y-4 mt-4">
                  <div>
                    <Label>Imagem Mobile (600x800 recomendado)</Label>
                    <p className="text-xs text-muted-foreground mb-2">Opcional. Se não informada, a imagem desktop será usada.</p>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input value={formData.mobile_image_url} onChange={(e) => setFormData({ ...formData, mobile_image_url: e.target.value })} placeholder="https://... ou faça upload" />
                        <label className="cursor-pointer">
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'mobile')} />
                          <Button type="button" variant="outline" asChild disabled={uploading === 'mobile'}>
                            <span><Upload className="h-4 w-4 mr-2" />{uploading === 'mobile' ? '...' : 'Upload'}</span>
                          </Button>
                        </label>
                      </div>
                      {formData.mobile_image_url ? (
                        <div className="max-w-[200px] mx-auto">
                          <AspectRatio ratio={3/4} className="bg-muted rounded-lg overflow-hidden">
                            <img src={formData.mobile_image_url} alt="Preview Mobile" className="w-full h-full object-cover" />
                          </AspectRatio>
                        </div>
                      ) : formData.image_url && (
                        <div className="text-center text-sm text-muted-foreground py-4">Usando imagem desktop no mobile</div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>Título</Label><Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} /></div>
                <div><Label>Subtítulo</Label><Input value={formData.subtitle} onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>Texto do Botão</Label><Input value={formData.cta_text} onChange={(e) => setFormData({ ...formData, cta_text: e.target.value })} placeholder="Ver ofertas" /></div>
                <div><Label>Link do Botão</Label><Input value={formData.cta_url} onChange={(e) => setFormData({ ...formData, cta_url: e.target.value })} placeholder="/outlet" /></div>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
                  <Label>Ativo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={formData.show_on_desktop} onCheckedChange={(checked) => setFormData({ ...formData, show_on_desktop: checked })} />
                  <Label className="flex items-center gap-1"><Monitor className="h-3.5 w-3.5" />Desktop</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={formData.show_on_mobile} onCheckedChange={(checked) => setFormData({ ...formData, show_on_mobile: checked })} />
                  <Label className="flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" />Mobile</Label>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Salvando...' : 'Salvar'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Carregando...</div>
      ) : banners?.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum banner cadastrado.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {banners?.map((banner, index) => (
            <Card key={banner.id} className={!banner.is_active ? 'opacity-60' : ''} {...getDragProps(index)}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab flex-shrink-0" />
                  <div className="flex gap-2 flex-shrink-0">
                    <img src={banner.image_url} alt={banner.title || 'Banner'} className="h-14 sm:h-20 w-24 sm:w-36 object-cover rounded" />
                    {banner.mobile_image_url && (
                      <img src={banner.mobile_image_url} alt="Mobile" className="h-14 sm:h-20 w-8 sm:w-12 object-cover rounded hidden sm:block" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{banner.title || 'Sem título'}</p>
                    <p className="text-xs text-muted-foreground truncate hidden sm:block">{banner.subtitle}</p>
                    {banner.cta_url && <p className="text-xs text-primary truncate">{banner.cta_url}</p>}
                    <div className="flex gap-2 mt-1">
                      {banner.show_on_desktop && <span className="inline-flex items-center gap-0.5 text-[10px] bg-muted px-1.5 py-0.5 rounded"><Monitor className="h-3 w-3" />Desktop</span>}
                      {banner.show_on_mobile && <span className="inline-flex items-center gap-0.5 text-[10px] bg-muted px-1.5 py-0.5 rounded"><Smartphone className="h-3 w-3" />Mobile</span>}
                      {!banner.show_on_desktop && !banner.show_on_mobile && <span className="text-[10px] text-destructive">Oculto</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(banner)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(banner.id)}><Trash2 className="h-4 w-4" /></Button>
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
