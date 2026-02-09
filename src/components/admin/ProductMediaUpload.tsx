import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Upload, X, Image as ImageIcon, Video, Check, GripVertical, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { compressImageToWebP } from '@/lib/imageCompressor';

interface MediaItem {
  id: string;
  url: string;
  alt_text: string | null;
  display_order: number;
  is_primary: boolean;
  media_type: string;
}

interface ProductMediaUploadProps {
  productId?: string;
  media: MediaItem[];
  onChange: (media: MediaItem[]) => void;
}

export function ProductMediaUpload({ productId, media, onChange }: ProductMediaUploadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Fetch all media from storage bucket
  const { data: libraryMedia, isLoading: loadingLibrary } = useQuery({
    queryKey: ['product-media-library'],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('product-media')
        .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
      
      if (error) throw error;
      
      return data?.map(file => ({
        name: file.name,
        url: supabase.storage.from('product-media').getPublicUrl(file.name).data.publicUrl,
        type: file.metadata?.mimetype?.startsWith('video/') ? 'video' : 'image',
        createdAt: file.created_at,
      })) || [];
    },
  });

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    setUploading(true);
    const newMedia: MediaItem[] = [];
    
    try {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith('video/');
        const { file: processedFile, fileName } = await compressImageToWebP(file);
        
        const { error: uploadError } = await supabase.storage
          .from('product-media')
          .upload(fileName, processedFile);
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('product-media')
          .getPublicUrl(fileName);
        
        newMedia.push({
          id: `temp-${Date.now()}-${Math.random()}`,
          url: publicUrl,
          alt_text: null,
          display_order: media.length + newMedia.length,
          is_primary: media.length === 0 && newMedia.length === 0,
          media_type: isVideo ? 'video' : 'image',
        });
      }
      
      onChange([...media, ...newMedia]);
      queryClient.invalidateQueries({ queryKey: ['product-media-library'] });
      toast({ title: `${newMedia.length} arquivo(s) enviado(s)` });
    } catch (error: any) {
      toast({ title: 'Erro ao enviar arquivo', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [media, onChange, queryClient, toast]);

  const handleSelectFromLibrary = (url: string, type: string) => {
    const exists = media.some(m => m.url === url);
    if (exists) {
      toast({ title: 'Esta mídia já foi adicionada', variant: 'destructive' });
      return;
    }
    
    const newItem: MediaItem = {
      id: `temp-${Date.now()}`,
      url,
      alt_text: null,
      display_order: media.length,
      is_primary: media.length === 0,
      media_type: type,
    };
    
    onChange([...media, newItem]);
    setIsLibraryOpen(false);
  };

  const handleRemove = (index: number) => {
    const newMedia = media.filter((_, i) => i !== index);
    // If we removed the primary, make the first one primary
    if (media[index].is_primary && newMedia.length > 0) {
      newMedia[0].is_primary = true;
    }
    // Reorder
    newMedia.forEach((m, i) => m.display_order = i);
    onChange(newMedia);
  };

  const handleSetPrimary = (index: number) => {
    const newMedia = media.map((m, i) => ({
      ...m,
      is_primary: i === index,
    }));
    onChange(newMedia);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const newMedia = [...media];
    const draggedItem = newMedia[draggedIndex];
    newMedia.splice(draggedIndex, 1);
    newMedia.splice(index, 0, draggedItem);
    newMedia.forEach((m, i) => m.display_order = i);
    onChange(newMedia);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Mídia do Produto</label>
        <div className="flex gap-2">
          <Dialog open={isLibraryOpen} onOpenChange={setIsLibraryOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <ImageIcon className="h-4 w-4 mr-2" />
                Biblioteca
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>Biblioteca de Mídia</DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="all">
                <TabsList>
                  <TabsTrigger value="all">Todos</TabsTrigger>
                  <TabsTrigger value="images">Imagens</TabsTrigger>
                  <TabsTrigger value="videos">Vídeos</TabsTrigger>
                </TabsList>
                <TabsContent value="all">
                  <ScrollArea className="h-[400px]">
                    {loadingLibrary ? (
                      <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                    ) : libraryMedia?.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">Nenhuma mídia encontrada</div>
                    ) : (
                      <div className="grid grid-cols-4 gap-3 p-1">
                        {libraryMedia?.map((item) => (
                          <button
                            key={item.name}
                            type="button"
                            onClick={() => handleSelectFromLibrary(item.url, item.type)}
                            className="relative group rounded-lg overflow-hidden border hover:border-primary transition-colors"
                          >
                            <AspectRatio ratio={1}>
                              {item.type === 'video' ? (
                                <video src={item.url} className="w-full h-full object-cover" />
                              ) : (
                                <img src={item.url} alt="" className="w-full h-full object-cover" />
                              )}
                            </AspectRatio>
                            {item.type === 'video' && (
                              <div className="absolute top-2 right-2 bg-black/50 rounded p-1">
                                <Video className="h-3 w-3 text-white" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Check className="h-6 w-6 text-primary" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="images">
                  <ScrollArea className="h-[400px]">
                    <div className="grid grid-cols-4 gap-3 p-1">
                      {libraryMedia?.filter(m => m.type === 'image').map((item) => (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => handleSelectFromLibrary(item.url, 'image')}
                          className="relative group rounded-lg overflow-hidden border hover:border-primary transition-colors"
                        >
                          <AspectRatio ratio={1}>
                            <img src={item.url} alt="" className="w-full h-full object-cover" />
                          </AspectRatio>
                          <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Check className="h-6 w-6 text-primary" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="videos">
                  <ScrollArea className="h-[400px]">
                    <div className="grid grid-cols-4 gap-3 p-1">
                      {libraryMedia?.filter(m => m.type === 'video').map((item) => (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => handleSelectFromLibrary(item.url, 'video')}
                          className="relative group rounded-lg overflow-hidden border hover:border-primary transition-colors"
                        >
                          <AspectRatio ratio={1}>
                            <video src={item.url} className="w-full h-full object-cover" />
                          </AspectRatio>
                          <div className="absolute top-2 right-2 bg-black/50 rounded p-1">
                            <Video className="h-3 w-3 text-white" />
                          </div>
                          <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Check className="h-6 w-6 text-primary" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
          
          <label className="cursor-pointer">
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
              disabled={uploading}
            />
            <Button type="button" variant="default" size="sm" asChild disabled={uploading}>
              <span>
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? 'Enviando...' : 'Upload'}
              </span>
            </Button>
          </label>
        </div>
      </div>

      {media.length === 0 ? (
        <label className="cursor-pointer">
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
            disabled={uploading}
          />
          <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Arraste imagens ou vídeos aqui ou clique para selecionar
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Formatos: JPG, PNG, WebP, GIF, MP4, WebM
            </p>
          </div>
        </label>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {media.map((item, index) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                "relative group rounded-lg overflow-hidden border",
                draggedIndex === index && "opacity-50",
                item.is_primary && "ring-2 ring-primary"
              )}
            >
              <AspectRatio ratio={1}>
                {item.media_type === 'video' ? (
                  <video src={item.url} className="w-full h-full object-cover" />
                ) : (
                  <img src={item.url} alt={item.alt_text || ''} className="w-full h-full object-cover" />
                )}
              </AspectRatio>
              
              {/* Drag handle */}
              <div className="absolute top-2 left-2 bg-black/50 rounded p-1 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical className="h-3 w-3 text-white" />
              </div>
              
              {/* Type indicator */}
              {item.media_type === 'video' && (
                <div className="absolute top-2 right-8 bg-black/50 rounded p-1">
                  <Video className="h-3 w-3 text-white" />
                </div>
              )}
              
              {/* Actions */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="bg-destructive rounded p-1"
                >
                  <Trash2 className="h-3 w-3 text-white" />
                </button>
              </div>
              
              {/* Primary badge */}
              {item.is_primary && (
                <div className="absolute bottom-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded">
                  Principal
                </div>
              )}
              
              {/* Set as primary button */}
              {!item.is_primary && (
                <button
                  type="button"
                  onClick={() => handleSetPrimary(index)}
                  className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Tornar principal
                </button>
              )}
            </div>
          ))}
          
          {/* Add more button */}
          <label className="cursor-pointer">
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
              disabled={uploading}
            />
            <div className="border-2 border-dashed rounded-lg flex items-center justify-center aspect-square hover:border-primary transition-colors">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
          </label>
        </div>
      )}
    </div>
  );
}
