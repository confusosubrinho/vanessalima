import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { ImageIcon } from 'lucide-react';

interface MediaPickerDialogProps {
  open: boolean;
  onSelect: (url: string) => void;
  onCancel: () => void;
}

export function MediaPickerDialog({ open, onSelect, onCancel }: MediaPickerDialogProps) {
  const { data: images, isLoading } = useQuery({
    queryKey: ['banner-media-picker'],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('product-media')
        .list('', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;
      return (data || [])
        .filter((f) => {
          const mime = (f.metadata as { mimetype?: string } | undefined)?.mimetype ?? '';
          if (mime.startsWith('image/')) return true;
          const ext = (f.name.split('.').pop() || '').toLowerCase();
          return ['webp', 'jpg', 'jpeg', 'png', 'gif', 'avif'].includes(ext);
        })
        .map((file) => ({
          name: file.name,
          url: supabase.storage.from('product-media').getPublicUrl(file.name).data.publicUrl,
        }));
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Escolher imagem do banco</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Selecione uma imagem já enviada ao site (storage / galeria).
        </p>
        <ScrollArea className="flex-1 min-h-[280px] rounded-md border">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Carregando...
            </div>
          ) : !images?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <ImageIcon className="h-10 w-10" />
              <p>Nenhuma imagem no banco. Envie pelo botão &quot;Subir do dispositivo&quot;.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-2">
              {images.map((img) => (
                <button
                  key={img.url}
                  type="button"
                  className="rounded-lg border overflow-hidden bg-muted/30 hover:ring-2 hover:ring-primary transition-all text-left"
                  onClick={() => onSelect(img.url)}
                >
                  <AspectRatio ratio={16 / 10}>
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-full h-full object-cover"
                    />
                  </AspectRatio>
                  <p className="text-[10px] text-muted-foreground truncate px-1 py-0.5" title={img.name}>
                    {img.name}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
