import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Upload, Search, Pencil, Trash2, Image as ImageIcon, Video, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { compressImageToWebP } from '@/lib/imageCompressor';

interface MediaFile {
  name: string;
  url: string;
  type: 'image' | 'video';
  createdAt: string;
}

interface ProductImage {
  id: string;
  url: string;
  alt_text: string | null;
  product_id: string;
  media_type: string | null;
}

export default function MediaGallery() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [editingImage, setEditingImage] = useState<ProductImage | null>(null);
  const [altText, setAltText] = useState('');
  const [uploading, setUploading] = useState(false);

  // All files from storage bucket
  const { data: storageFiles, isLoading: loadingStorage } = useQuery({
    queryKey: ['media-gallery-storage'],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('product-media')
        .list('', { limit: 500, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;
      return (data || []).map(file => ({
        name: file.name,
        url: supabase.storage.from('product-media').getPublicUrl(file.name).data.publicUrl,
        type: (file.metadata?.mimetype?.startsWith('video/') ? 'video' : 'image') as 'image' | 'video',
        createdAt: file.created_at || '',
      }));
    },
  });

  // All product_images for SEO editing
  const { data: productImages } = useQuery({
    queryKey: ['media-gallery-product-images'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_images')
        .select('id, url, alt_text, product_id, media_type')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ProductImage[];
    },
  });

  const updateAltMutation = useMutation({
    mutationFn: async ({ id, alt_text }: { id: string; alt_text: string }) => {
      const { error } = await supabase
        .from('product_images')
        .update({ alt_text })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-gallery-product-images'] });
      toast({ title: 'Alt text atualizado!' });
      setEditingImage(null);
    },
    onError: (e: Error) => {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    },
  });

  const handleUpload = async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const { file: compressed, fileName } = await compressImageToWebP(file);
        const { error } = await supabase.storage
          .from('product-media')
          .upload(fileName, compressed);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['media-gallery-storage'] });
      toast({ title: `${files.length} arquivo(s) enviado(s) em WebP!` });
    } catch (err: any) {
      toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileName: string) => {
    const { error } = await supabase.storage.from('product-media').remove([fileName]);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      queryClient.invalidateQueries({ queryKey: ['media-gallery-storage'] });
      toast({ title: 'Arquivo excluído!' });
    }
  };

  const openEditSeo = (url: string) => {
    const match = productImages?.find(pi => pi.url === url);
    if (match) {
      setEditingImage(match);
      setAltText(match.alt_text || '');
    } else {
      toast({ title: 'Imagem não vinculada a produto', description: 'Só é possível editar SEO de imagens associadas a produtos.' });
    }
  };

  const filtered = storageFiles?.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const getAltForUrl = (url: string) => {
    return productImages?.find(pi => pi.url === url)?.alt_text || null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Galeria de Mídia</h1>
          <p className="text-muted-foreground">Todas as imagens do site com SEO</p>
        </div>
        <label className="cursor-pointer">
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button asChild disabled={uploading}>
            <span>
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? 'Comprimindo e enviando...' : 'Upload'}
            </span>
          </Button>
        </label>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome do arquivo..."
          className="pl-10"
        />
      </div>

      <div className="text-sm text-muted-foreground">
        {filtered.length} arquivo(s) encontrado(s)
      </div>

      {loadingStorage ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map((file) => {
            const alt = getAltForUrl(file.url);
            return (
              <div key={file.name} className="group relative rounded-lg border overflow-hidden bg-muted/30">
                <AspectRatio ratio={1}>
                  {file.type === 'video' ? (
                    <video src={file.url} className="w-full h-full object-cover" />
                  ) : (
                    <img src={file.url} alt={alt || file.name} className="w-full h-full object-cover" />
                  )}
                </AspectRatio>

                {/* Type badge */}
                <div className="absolute top-2 left-2">
                  {file.type === 'video' ? (
                    <span className="bg-black/60 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Video className="h-3 w-3" /> Video
                    </span>
                  ) : (
                    <span className="bg-black/60 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                      <ImageIcon className="h-3 w-3" /> IMG
                    </span>
                  )}
                </div>

                {/* Alt text indicator */}
                {alt && (
                  <div className="absolute top-2 right-2 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded">
                    SEO ✓
                  </div>
                )}

                {/* Actions overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8"
                    onClick={() => openEditSeo(file.url)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-8 w-8"
                    onClick={() => handleDelete(file.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* File name */}
                <div className="p-2">
                  <p className="text-xs text-muted-foreground truncate" title={file.name}>
                    {file.name}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SEO Edit Dialog */}
      <Dialog open={!!editingImage} onOpenChange={(o) => !o && setEditingImage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar SEO da Imagem</DialogTitle>
          </DialogHeader>
          {editingImage && (
            <div className="space-y-4">
              <div className="max-w-[200px] mx-auto">
                <AspectRatio ratio={1} className="rounded-lg overflow-hidden bg-muted">
                  <img src={editingImage.url} alt="" className="w-full h-full object-cover" />
                </AspectRatio>
              </div>
              <div className="space-y-2">
                <Label>Texto alternativo (alt text)</Label>
                <Textarea
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder="Descreva a imagem para SEO e acessibilidade..."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  O alt text é essencial para SEO e acessibilidade. Descreva o conteúdo da imagem de forma clara e concisa.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingImage(null)}>Cancelar</Button>
                <Button
                  onClick={() => updateAltMutation.mutate({ id: editingImage.id, alt_text: altText })}
                  disabled={updateAltMutation.isPending}
                >
                  {updateAltMutation.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
