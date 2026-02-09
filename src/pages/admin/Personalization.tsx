import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { compressImageToWebP } from '@/lib/imageCompressor';
import { Plus, Pencil, Trash2, GripVertical, Upload, Monitor, Smartphone, Video, Image as ImageIcon } from 'lucide-react';

// Browser-side video compression using canvas + MediaRecorder
async function compressVideo(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);

    video.onloadedmetadata = () => {
      // Scale down resolution to reduce size
      const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      const stream = canvas.captureStream(24); // 24fps
      const chunks: Blob[] = [];

      // Try webm first, fallback to mp4
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 1_500_000, // 1.5Mbps for good compression
      });

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        URL.revokeObjectURL(video.src);
        const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
        if (blob.size > 30 * 1024 * 1024) {
          reject(new Error('Still too large'));
        } else {
          resolve(blob);
        }
      };
      recorder.onerror = () => reject(new Error('Recording failed'));

      video.onplay = () => {
        recorder.start();
        const drawFrame = () => {
          if (video.ended || video.paused) {
            recorder.stop();
            return;
          }
          ctx.drawImage(video, 0, 0, width, height);
          requestAnimationFrame(drawFrame);
        };
        drawFrame();
      };

      video.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
      video.onerror = () => reject(new Error('Video load failed'));
      video.play().catch(reject);
    };

    video.onerror = () => reject(new Error('Video load failed'));
  });
}

// ─── Banners Section (reuse logic from Banners page) ───


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
}

function BannersSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [uploading, setUploading] = useState<'desktop' | 'mobile' | null>(null);
  const [formData, setFormData] = useState({
    title: '', subtitle: '', image_url: '', mobile_image_url: '', cta_text: '', cta_url: '', is_active: true,
  });

  const { data: banners, isLoading } = useQuery({
    queryKey: ['admin-banners'],
    queryFn: async () => {
      const { data, error } = await supabase.from('banners').select('*').order('display_order', { ascending: true });
      if (error) throw error;
      return data as Banner[];
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
        is_active: data.is_active, display_order: editingBanner?.display_order || (banners?.length || 0),
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
    onError: (error: any) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
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
    setFormData({ title: '', subtitle: '', image_url: '', mobile_image_url: '', cta_text: '', cta_url: '', is_active: true });
    setEditingBanner(null);
  };

  const handleEdit = (banner: Banner) => {
    setEditingBanner(banner);
    setFormData({
      title: banner.title || '', subtitle: banner.subtitle || '',
      image_url: banner.image_url, mobile_image_url: banner.mobile_image_url || '',
      cta_text: banner.cta_text || '', cta_url: banner.cta_url || '', is_active: banner.is_active,
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Banners da Página Inicial</h3>
          <p className="text-sm text-muted-foreground">Carrossel principal do topo da loja</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />Novo Banner</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>{editingBanner ? 'Editar Banner' : 'Novo Banner'}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-4">
              <Tabs defaultValue="desktop">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="desktop"><Monitor className="h-4 w-4 mr-1" />Desktop</TabsTrigger>
                  <TabsTrigger value="mobile"><Smartphone className="h-4 w-4 mr-1" />Mobile</TabsTrigger>
                </TabsList>
                <TabsContent value="desktop" className="space-y-3 mt-3">
                  <Label>Imagem Desktop (1920x600) *</Label>
                  <div className="flex gap-2">
                    <Input value={formData.image_url} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} placeholder="URL ou upload" required />
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'desktop')} />
                      <Button type="button" variant="outline" asChild><span><Upload className="h-4 w-4 mr-1" />{uploading === 'desktop' ? '...' : 'Upload'}</span></Button>
                    </label>
                  </div>
                  {formData.image_url && <AspectRatio ratio={16/5} className="bg-muted rounded-lg overflow-hidden"><img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" /></AspectRatio>}
                </TabsContent>
                <TabsContent value="mobile" className="space-y-3 mt-3">
                  <Label>Imagem Mobile (750x900)</Label>
                  <div className="flex gap-2">
                    <Input value={formData.mobile_image_url} onChange={(e) => setFormData({ ...formData, mobile_image_url: e.target.value })} placeholder="URL ou upload" />
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'mobile')} />
                      <Button type="button" variant="outline" asChild><span><Upload className="h-4 w-4 mr-1" />{uploading === 'mobile' ? '...' : 'Upload'}</span></Button>
                    </label>
                  </div>
                  {formData.mobile_image_url && <div className="max-w-[200px] mx-auto"><AspectRatio ratio={9/16} className="bg-muted rounded-lg overflow-hidden"><img src={formData.mobile_image_url} alt="Preview Mobile" className="w-full h-full object-cover" /></AspectRatio></div>}
                </TabsContent>
              </Tabs>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Título</Label><Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} /></div>
                <div><Label>Subtítulo</Label><Input value={formData.subtitle} onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Texto do Botão</Label><Input value={formData.cta_text} onChange={(e) => setFormData({ ...formData, cta_text: e.target.value })} placeholder="Ver ofertas" /></div>
                <div><Label>Link do Botão</Label><Input value={formData.cta_url} onChange={(e) => setFormData({ ...formData, cta_url: e.target.value })} placeholder="/outlet" /></div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} /><Label>Ativo</Label></div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Salvando...' : 'Salvar'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground py-4">Carregando...</p> : banners?.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">Nenhum banner cadastrado.</p>
      ) : (
        <div className="grid gap-3">
          {banners?.map((banner) => (
            <Card key={banner.id} className={!banner.is_active ? 'opacity-60' : ''}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex gap-2 flex-shrink-0">
                    <img src={banner.image_url} alt={banner.title || 'Banner'} className="h-16 w-28 object-cover rounded" />
                    {banner.mobile_image_url && <img src={banner.mobile_image_url} alt="Mobile" className="h-16 w-10 object-cover rounded" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{banner.title || 'Sem título'}</p>
                    {banner.cta_url && <p className="text-xs text-primary truncate">{banner.cta_url}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(banner)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(banner.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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

// ─── Instagram Videos Section ───

interface InstagramVideo {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  username: string | null;
  product_id: string | null;
  display_order: number | null;
  is_active: boolean | null;
}

interface ProductOption {
  id: string;
  name: string;
}

function InstagramVideosSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<InstagramVideo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [formData, setFormData] = useState({
    video_url: '', thumbnail_url: '', username: '', product_id: '', is_active: true,
  });

  const { data: videos, isLoading } = useQuery({
    queryKey: ['admin-instagram-videos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('instagram_videos' as any).select('*').order('display_order', { ascending: true });
      if (error) throw error;
      return (data as unknown as InstagramVideo[]) || [];
    },
  });

  const { data: products } = useQuery({
    queryKey: ['admin-products-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, name').eq('is_active', true).order('name');
      if (error) throw error;
      return data as ProductOption[];
    },
  });

  const handleVideoUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const maxSize = 30 * 1024 * 1024; // 30MB limit
      let fileToUpload: File | Blob = file;
      let finalName = file.name;

      if (file.size > maxSize) {
        // Compress video using canvas + MediaRecorder for browser-side compression
        toast({ title: 'Comprimindo vídeo...', description: 'Aguarde, otimizando o vídeo para upload.' });
        try {
          fileToUpload = await compressVideo(file);
          finalName = 'compressed.webm';
        } catch {
          toast({ title: 'Vídeo muito grande', description: 'Não foi possível comprimir automaticamente. Reduza o vídeo para no máximo 30MB.', variant: 'destructive' });
          setUploading(false);
          return;
        }
      }

      const ext = finalName.split('.').pop() || 'mp4';
      const fileName = `videos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('product-media').upload(fileName, fileToUpload, { contentType: fileToUpload instanceof File ? fileToUpload.type : 'video/webm' });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('product-media').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, video_url: publicUrl }));
      toast({ title: 'Vídeo enviado!' });
    } catch (error: any) {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
    } finally { setUploading(false); }
  }, [toast]);

  const handleThumbUpload = useCallback(async (file: File) => {
    setUploadingThumb(true);
    try {
      const { file: compressedFile, fileName } = await compressImageToWebP(file);
      const { error: uploadError } = await supabase.storage.from('product-media').upload(fileName, compressedFile);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('product-media').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, thumbnail_url: publicUrl }));
      toast({ title: 'Thumbnail enviada!' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally { setUploadingThumb(false); }
  }, [toast]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const videoData: any = {
        video_url: data.video_url,
        thumbnail_url: data.thumbnail_url || null,
        username: data.username || null,
        product_id: data.product_id || null,
        is_active: data.is_active,
        display_order: editingVideo?.display_order || (videos?.length || 0),
      };
      if (editingVideo) {
        const { error } = await supabase.from('instagram_videos' as any).update(videoData).eq('id', editingVideo.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('instagram_videos' as any).insert(videoData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-instagram-videos'] });
      queryClient.invalidateQueries({ queryKey: ['instagram-videos'] });
      setIsDialogOpen(false); resetForm();
      toast({ title: editingVideo ? 'Vídeo atualizado!' : 'Vídeo adicionado!' });
    },
    onError: (error: any) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('instagram_videos' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-instagram-videos'] });
      queryClient.invalidateQueries({ queryKey: ['instagram-videos'] });
      toast({ title: 'Vídeo excluído!' });
    },
  });

  const resetForm = () => {
    setFormData({ video_url: '', thumbnail_url: '', username: '', product_id: '', is_active: true });
    setEditingVideo(null);
  };

  const handleEdit = (video: InstagramVideo) => {
    setEditingVideo(video);
    setFormData({
      video_url: video.video_url, thumbnail_url: video.thumbnail_url || '',
      username: video.username || '', product_id: video.product_id || '', is_active: video.is_active !== false,
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Vídeos Inspire-se</h3>
          <p className="text-sm text-muted-foreground">Vídeos exibidos na seção "Inspire-se" da home. Máx. 10MB por vídeo.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />Novo Vídeo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editingVideo ? 'Editar Vídeo' : 'Novo Vídeo'}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-4">
              <div>
                <Label>Vídeo *</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={formData.video_url} onChange={(e) => setFormData({ ...formData, video_url: e.target.value })} placeholder="URL do vídeo ou upload" required />
                  <label className="cursor-pointer">
                    <input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0])} />
                    <Button type="button" variant="outline" asChild disabled={uploading}><span><Upload className="h-4 w-4 mr-1" />{uploading ? '...' : 'Upload'}</span></Button>
                  </label>
                </div>
                {formData.video_url && (
                  <video src={formData.video_url} className="mt-2 w-full max-h-48 rounded object-cover" controls muted />
                )}
              </div>
              <div>
                <Label>Thumbnail (opcional)</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={formData.thumbnail_url} onChange={(e) => setFormData({ ...formData, thumbnail_url: e.target.value })} placeholder="URL ou upload" />
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleThumbUpload(e.target.files[0])} />
                    <Button type="button" variant="outline" asChild disabled={uploadingThumb}><span><Upload className="h-4 w-4 mr-1" />{uploadingThumb ? '...' : 'Upload'}</span></Button>
                  </label>
                </div>
              </div>
              <div><Label>Username Instagram</Label><Input value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="@usuario" className="mt-1" /></div>
              <div>
                <Label>Produto Vinculado</Label>
                <Select value={formData.product_id} onValueChange={(v) => setFormData({ ...formData, product_id: v === 'none' ? '' : v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar produto..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2"><Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} /><Label>Ativo</Label></div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Salvando...' : 'Salvar'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground py-4">Carregando...</p> : videos?.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">Nenhum vídeo cadastrado.</p>
      ) : (
        <div className="grid gap-3">
          {videos?.map((video) => (
            <Card key={video.id} className={video.is_active === false ? 'opacity-60' : ''}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-shrink-0 w-16 h-20 bg-muted rounded overflow-hidden">
                    {video.thumbnail_url ? (
                      <img src={video.thumbnail_url} alt="Thumb" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Video className="h-5 w-5 text-muted-foreground" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{video.username ? `@${video.username}` : 'Sem username'}</p>
                    <p className="text-xs text-muted-foreground truncate">{video.video_url}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(video)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(video.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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

// ─── Main Page ───

export default function Personalization() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Personalização</h1>
        <p className="text-muted-foreground">Gerencie banners e vídeos da página inicial</p>
      </div>

      <Tabs defaultValue="banners" className="space-y-4">
        <TabsList>
          <TabsTrigger value="banners" className="flex items-center gap-2"><ImageIcon className="h-4 w-4" />Banners</TabsTrigger>
          <TabsTrigger value="videos" className="flex items-center gap-2"><Video className="h-4 w-4" />Inspire-se</TabsTrigger>
        </TabsList>
        <TabsContent value="banners"><BannersSection /></TabsContent>
        <TabsContent value="videos"><InstagramVideosSection /></TabsContent>
      </Tabs>
    </div>
  );
}
