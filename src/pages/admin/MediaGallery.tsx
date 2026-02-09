import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Upload, Search, Pencil, Trash2, Image as ImageIcon, Video, Link as LinkIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { compressImageToWebP } from '@/lib/imageCompressor';

interface ProductImage {
  id: string;
  url: string;
  alt_text: string | null;
  product_id: string;
  media_type: string | null;
  display_order: number | null;
  is_primary: boolean | null;
  product_name?: string;
}

interface BannerImage {
  id: string;
  url: string;
  title: string | null;
  source: 'banner' | 'highlight';
}

export default function MediaGallery() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [editingImage, setEditingImage] = useState<ProductImage | null>(null);
  const [altText, setAltText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  // All product_images with product names
  const { data: productImages, isLoading: loadingProducts } = useQuery({
    queryKey: ['media-gallery-product-images'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_images')
        .select('id, url, alt_text, product_id, media_type, display_order, is_primary')
        .order('created_at', { ascending: false });
      if (error) throw error;
      
      // Get product names
      const productIds = [...new Set((data || []).map(d => d.product_id))];
      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .in('id', productIds);
      
      const productMap = new Map((products || []).map(p => [p.id, p.name]));
      
      return (data || []).map(img => ({
        ...img,
        product_name: productMap.get(img.product_id) || 'Produto removido',
      })) as ProductImage[];
    },
  });

  // Banner images
  const { data: bannerImages } = useQuery({
    queryKey: ['media-gallery-banners'],
    queryFn: async () => {
      const results: BannerImage[] = [];
      
      const { data: banners } = await supabase
        .from('banners')
        .select('id, image_url, mobile_image_url, title');
      (banners || []).forEach(b => {
        results.push({ id: b.id, url: b.image_url, title: b.title || 'Banner principal', source: 'banner' });
        if (b.mobile_image_url) {
          results.push({ id: b.id + '-mobile', url: b.mobile_image_url, title: (b.title || 'Banner') + ' (Mobile)', source: 'banner' });
        }
      });

      const { data: highlights } = await supabase
        .from('highlight_banners')
        .select('id, image_url, title');
      (highlights || []).forEach(h => {
        results.push({ id: h.id, url: h.image_url, title: h.title || 'Banner destaque', source: 'highlight' });
      });

      return results;
    },
  });

  // Storage files
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
      }));
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

  const openEditSeo = (img: ProductImage) => {
    setEditingImage(img);
    setAltText(img.alt_text || '');
  };

  // Combine all for "all" tab
  const allImages = [
    ...(productImages || []).map(pi => ({
      key: `pi-${pi.id}`,
      url: pi.url,
      label: pi.product_name || '',
      alt: pi.alt_text,
      type: (pi.media_type || 'image') as string,
      source: 'product' as const,
      productImage: pi,
    })),
    ...(bannerImages || []).map(bi => ({
      key: `bn-${bi.id}`,
      url: bi.url,
      label: bi.title || '',
      alt: null as string | null,
      type: 'image' as string,
      source: bi.source,
      productImage: null as ProductImage | null,
    })),
  ];

  const filteredAll = allImages.filter(img =>
    !search || img.label.toLowerCase().includes(search.toLowerCase()) || img.url.toLowerCase().includes(search.toLowerCase())
  );

  const filteredStorage = (storageFiles || []).filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredProducts = (productImages || []).filter(pi =>
    !search || (pi.product_name || '').toLowerCase().includes(search.toLowerCase()) || pi.url.toLowerCase().includes(search.toLowerCase())
  );

  const filteredBanners = (bannerImages || []).filter(bi =>
    !search || (bi.title || '').toLowerCase().includes(search.toLowerCase())
  );

  const isLoading = loadingProducts || loadingStorage;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Galeria de Mídia</h1>
          <p className="text-muted-foreground">Todas as imagens do site — produtos, banners e uploads</p>
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
              {uploading ? 'Comprimindo...' : 'Upload'}
            </span>
          </Button>
        </label>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome do produto, arquivo ou banner..."
          className="pl-10"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">Todas ({allImages.length})</TabsTrigger>
          <TabsTrigger value="products">Produtos ({productImages?.length || 0})</TabsTrigger>
          <TabsTrigger value="banners">Banners ({bannerImages?.length || 0})</TabsTrigger>
          <TabsTrigger value="storage">Storage ({storageFiles?.length || 0})</TabsTrigger>
        </TabsList>

        {/* ALL TAB */}
        <TabsContent value="all">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredAll.map((img) => (
                <div key={img.key} className="group relative rounded-lg border overflow-hidden bg-muted/30">
                  <AspectRatio ratio={1}>
                    <img src={img.url} alt={img.alt || img.label} className="w-full h-full object-cover" />
                  </AspectRatio>
                  <div className="absolute top-2 left-2">
                    <Badge variant="secondary" className="text-xs">
                      {img.source === 'product' ? 'Produto' : img.source === 'banner' ? 'Banner' : 'Destaque'}
                    </Badge>
                  </div>
                  {img.alt && (
                    <div className="absolute top-2 right-2 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded">
                      SEO ✓
                    </div>
                  )}
                  {img.productImage && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => openEditSeo(img.productImage!)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-xs text-muted-foreground truncate" title={img.label}>{img.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* PRODUCTS TAB */}
        <TabsContent value="products">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredProducts.map((pi) => (
              <div key={pi.id} className="group relative rounded-lg border overflow-hidden bg-muted/30">
                <AspectRatio ratio={1}>
                  <img src={pi.url} alt={pi.alt_text || pi.product_name} className="w-full h-full object-cover" />
                </AspectRatio>
                {pi.is_primary && (
                  <div className="absolute top-2 left-2">
                    <Badge className="text-xs">Principal</Badge>
                  </div>
                )}
                {pi.alt_text ? (
                  <div className="absolute top-2 right-2 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded">SEO ✓</div>
                ) : (
                  <div className="absolute top-2 right-2 bg-destructive text-white text-xs px-1.5 py-0.5 rounded">Sem ALT</div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => openEditSeo(pi)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <div className="p-2">
                  <p className="text-xs text-muted-foreground truncate">{pi.product_name}</p>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* BANNERS TAB */}
        <TabsContent value="banners">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredBanners.map((bi) => (
              <div key={bi.id} className="relative rounded-lg border overflow-hidden bg-muted/30">
                <AspectRatio ratio={bi.source === 'highlight' ? 1 : 16/9}>
                  <img src={bi.url} alt={bi.title || ''} className="w-full h-full object-cover" />
                </AspectRatio>
                <div className="absolute top-2 left-2">
                  <Badge variant="secondary" className="text-xs">
                    {bi.source === 'banner' ? 'Principal' : 'Destaque'}
                  </Badge>
                </div>
                <div className="p-2">
                  <p className="text-xs text-muted-foreground truncate">{bi.title}</p>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* STORAGE TAB */}
        <TabsContent value="storage">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredStorage.map((file) => (
              <div key={file.name} className="group relative rounded-lg border overflow-hidden bg-muted/30">
                <AspectRatio ratio={1}>
                  {file.type === 'video' ? (
                    <video src={file.url} className="w-full h-full object-cover" />
                  ) : (
                    <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                  )}
                </AspectRatio>
                <div className="absolute top-2 left-2">
                  <Badge variant="outline" className="text-xs bg-background/80">
                    {file.type === 'video' ? <Video className="h-3 w-3 mr-1" /> : <ImageIcon className="h-3 w-3 mr-1" />}
                    {file.type === 'video' ? 'Video' : 'IMG'}
                  </Badge>
                </div>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => handleDelete(file.name)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="p-2">
                  <p className="text-xs text-muted-foreground truncate" title={file.name}>{file.name}</p>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

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
              <div className="text-sm text-center text-muted-foreground">
                Produto: <strong>{editingImage.product_name}</strong>
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
                  O alt text é essencial para SEO. Descreva o conteúdo da imagem de forma clara e concisa.
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
