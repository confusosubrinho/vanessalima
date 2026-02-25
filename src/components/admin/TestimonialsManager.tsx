import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, GripVertical, Star, Upload, X, ShoppingBag } from 'lucide-react';
import { useDragReorder } from '@/hooks/useDragReorder';
import { compressToAvatar } from '@/lib/imageCompressor';
import type { Database } from '@/integrations/supabase/types';

interface TestimonialConfig {
  id: string;
  is_active: boolean;
  title: string;
  subtitle: string;
  bg_color: string;
  card_color: string;
  star_color: string;
  text_color: string;
  cards_per_view: number;
  autoplay: boolean;
  autoplay_speed: number;
}

interface ProductImage {
  url: string;
  is_primary: boolean | null;
}

interface TestimonialProduct {
  id: string;
  name: string;
  images: ProductImage[];
}

interface Testimonial {
  id: string;
  customer_name: string;
  rating: number;
  testimonial: string;
  display_order: number;
  is_active: boolean;
  photo_url: string | null;
  product_id: string | null;
  product: TestimonialProduct | null;
}

interface FormData {
  customer_name: string;
  rating: number;
  testimonial: string;
  photo_url: string | null;
  product_id: string | null;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button" onClick={() => onChange(star)} className="focus:outline-none">
          <Star className="h-6 w-6 transition-colors" fill={star <= value ? '#f5a623' : 'transparent'} stroke={star <= value ? '#f5a623' : '#ccc'} />
        </button>
      ))}
    </div>
  );
}

export function TestimonialsManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Testimonial | null>(null);
  const [formData, setFormData] = useState<FormData>({ customer_name: '', rating: 5, testimonial: '', photo_url: null, product_id: null });
  const [photoUploading, setPhotoUploading] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // Config
  const { data: config } = useQuery({
    queryKey: ['admin-testimonials-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('homepage_testimonials_config').select('*').limit(1).single();
      if (error) throw error;
      return data as unknown as TestimonialConfig;
    },
  });

  const updateConfig = useMutation({
    mutationFn: async (updates: Partial<TestimonialConfig>) => {
      if (!config?.id) return;
      const { error } = await supabase.from('homepage_testimonials_config').update(updates as Database['public']['Tables']['homepage_testimonials_config']['Update']).eq('id', config.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-testimonials-config'] });
      queryClient.invalidateQueries({ queryKey: ['testimonials-config'] });
      toast({ title: 'Configurações salvas!' });
    },
  });

  // Testimonials with product join
  const { data: testimonials, isLoading } = useQuery({
    queryKey: ['admin-testimonials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('homepage_testimonials')
        .select('*, product:products(id, name, images:product_images(url, is_primary))')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data as unknown as Testimonial[]) || [];
    },
  });

  // Products for selector
  const { data: products } = useQuery({
    queryKey: ['admin-products-for-testimonials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, base_price, sale_price, images:product_images(url, is_primary)')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data as unknown as Array<{ id: string; name: string; base_price: number; sale_price: number | null; images: ProductImage[] }>) || [];
    },
  });

  const { getDragProps } = useDragReorder({
    items: testimonials || [],
    onReorder: (reordered) => {
      const updates = reordered.map((item, i) => ({ id: item.id, display_order: i }));
      Promise.all(updates.map(u => supabase.from('homepage_testimonials').update({ display_order: u.display_order } as Database['public']['Tables']['homepage_testimonials']['Update']).eq('id', u.id)))
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['admin-testimonials'] });
          queryClient.invalidateQueries({ queryKey: ['testimonials'] });
        });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        customer_name: data.customer_name,
        rating: data.rating,
        testimonial: data.testimonial,
        photo_url: data.photo_url ?? null,
        product_id: data.product_id ?? null,
        display_order: editingItem?.display_order ?? (testimonials?.length || 0),
      };
      if (editingItem) {
        const { error } = await supabase.from('homepage_testimonials').update(payload as Database['public']['Tables']['homepage_testimonials']['Update']).eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('homepage_testimonials').insert(payload as Database['public']['Tables']['homepage_testimonials']['Insert']);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-testimonials'] });
      queryClient.invalidateQueries({ queryKey: ['testimonials'] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: editingItem ? 'Avaliação atualizada!' : 'Avaliação adicionada!' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('homepage_testimonials').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-testimonials'] });
      queryClient.invalidateQueries({ queryKey: ['testimonials'] });
      toast({ title: 'Avaliação excluída!' });
    },
  });

  const resetForm = () => {
    setFormData({ customer_name: '', rating: 5, testimonial: '', photo_url: null, product_id: null });
    setEditingItem(null);
    setProductSearch('');
  };

  const handleEdit = (item: Testimonial) => {
    setEditingItem(item);
    setFormData({
      customer_name: item.customer_name,
      rating: item.rating,
      testimonial: item.testimonial,
      photo_url: item.photo_url ?? null,
      product_id: item.product_id ?? null,
    });
    setIsDialogOpen(true);
  };

  const handlePhotoUpload = useCallback(async (file: File) => {
    setPhotoUploading(true);
    try {
      const { file: compressed, fileName } = await compressToAvatar(file);
      const { error } = await supabase.storage.from('product-media').upload(fileName, compressed);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-media').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, photo_url: publicUrl }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast({ title: 'Erro ao enviar foto', description: message, variant: 'destructive' });
    } finally {
      setPhotoUploading(false);
    }
  }, [toast]);

  const getProductImage = (images: ProductImage[] | null | undefined): string | null => {
    if (!images?.length) return null;
    const primary = images.find(i => i.is_primary);
    return primary?.url || images[0]?.url || null;
  };

  const filteredProducts = products?.filter(p =>
    productSearch.length > 0 &&
    p.name.toLowerCase().includes(productSearch.toLowerCase()) &&
    p.id !== formData.product_id
  ).slice(0, 15) || [];

  const selectedProduct = formData.product_id ? products?.find(p => p.id === formData.product_id) : null;

  return (
    <div className="space-y-6">
      {/* Toggle + Config */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Avaliações de Clientes</CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">Exibir na home</Label>
              <Switch checked={config?.is_active ?? true} onCheckedChange={(checked) => updateConfig.mutate({ is_active: checked })} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Título da seção</Label>
              <Input value={config?.title || ''} onChange={(e) => updateConfig.mutate({ title: e.target.value })} />
            </div>
            <div>
              <Label>Subtítulo</Label>
              <Input value={config?.subtitle || ''} onChange={(e) => updateConfig.mutate({ subtitle: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Cor de fundo', key: 'bg_color' as const, fallback: '#f5f0eb' },
              { label: 'Cor dos cards', key: 'card_color' as const, fallback: '#ffffff' },
              { label: 'Cor das estrelas', key: 'star_color' as const, fallback: '#f5a623' },
              { label: 'Cor do texto', key: 'text_color' as const, fallback: '#333333' },
            ].map(({ label, key, fallback }) => (
              <div key={key}>
                <Label className="text-xs">{label}</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={config?.[key] || fallback} onChange={(e) => updateConfig.mutate({ [key]: e.target.value })} className="w-8 h-8 rounded border cursor-pointer" />
                  <Input value={config?.[key] || fallback} onChange={(e) => updateConfig.mutate({ [key]: e.target.value })} className="text-xs h-8" />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Cards por vez (desktop)</Label>
              <Input type="number" min={1} max={6} value={config?.cards_per_view || 4} onChange={(e) => updateConfig.mutate({ cards_per_view: parseInt(e.target.value) || 4 })} className="h-8" />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-2">
                <Switch checked={config?.autoplay ?? true} onCheckedChange={(checked) => updateConfig.mutate({ autoplay: checked })} />
                <Label className="text-xs">Autoplay</Label>
              </div>
            </div>
            <div>
              <Label className="text-xs">Velocidade (segundos)</Label>
              <Input type="number" min={2} max={15} value={config?.autoplay_speed || 5} onChange={(e) => updateConfig.mutate({ autoplay_speed: parseInt(e.target.value) || 5 })} className="h-8" disabled={!config?.autoplay} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Testimonials list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Avaliações cadastradas</h3>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" />Adicionar avaliação</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingItem ? 'Editar Avaliação' : 'Nova Avaliação'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-4">
                <div>
                  <Label>Nome do cliente</Label>
                  <Input value={formData.customer_name} onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })} placeholder="Ex: Maria S." required />
                </div>
                <div>
                  <Label>Nota</Label>
                  <StarRating value={formData.rating} onChange={(v) => setFormData({ ...formData, rating: v })} />
                </div>
                <div>
                  <Label>Depoimento</Label>
                  <Textarea value={formData.testimonial} onChange={(e) => setFormData({ ...formData, testimonial: e.target.value })} placeholder="Texto do depoimento..." rows={4} required />
                </div>

                {/* Photo upload */}
                <div>
                  <Label>Foto do cliente (opcional)</Label>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-lg font-semibold flex-shrink-0 overflow-hidden">
                      {formData.photo_url ? (
                        <img src={formData.photo_url} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-muted-foreground">{formData.customer_name?.charAt(0)?.toUpperCase() || '?'}</span>
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }} disabled={photoUploading} />
                        <Button type="button" variant="outline" size="sm" asChild>
                          <span><Upload className="h-3.5 w-3.5 mr-1" />{photoUploading ? 'Processando...' : 'Upload'}</span>
                        </Button>
                      </label>
                      <p className="text-[11px] text-muted-foreground">Cortada automaticamente para 100×100px</p>
                      {formData.photo_url && (
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => setFormData(prev => ({ ...prev, photo_url: null }))}>
                          <X className="h-3 w-3 mr-1" />Remover foto
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Product selector */}
                <div>
                  <Label>Produto que ela comprou e amou (opcional)</Label>
                  {selectedProduct && (
                    <div className="flex items-center gap-2 mt-2 p-2 rounded-md border bg-muted/30">
                      {getProductImage(selectedProduct.images) && (
                        <img src={getProductImage(selectedProduct.images)!} alt="" className="w-10 h-10 object-cover rounded" />
                      )}
                      <span className="text-sm flex-1 truncate">{selectedProduct.name}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setFormData(prev => ({ ...prev, product_id: null }))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  <Input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar produto..."
                    className="mt-2"
                  />
                  {filteredProducts.length > 0 && (
                    <ScrollArea className="max-h-40 mt-1 border rounded-md">
                      <div className="p-1">
                        {filteredProducts.map(p => {
                          const img = getProductImage(p.images);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              className="flex items-center gap-2 w-full p-2 rounded hover:bg-muted text-left text-sm"
                              onClick={() => { setFormData(prev => ({ ...prev, product_id: p.id })); setProductSearch(''); }}
                            >
                              {img ? <img src={img} alt="" className="w-8 h-8 object-cover rounded" /> : <div className="w-8 h-8 bg-muted rounded" />}
                              <span className="flex-1 truncate">{p.name}</span>
                              <span className="text-xs text-muted-foreground">R$ {Number(p.sale_price || p.base_price).toFixed(2)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
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
          <p className="text-sm text-muted-foreground py-4">Carregando...</p>
        ) : !testimonials?.length ? (
          <p className="text-sm text-muted-foreground py-4">Nenhuma avaliação cadastrada.</p>
        ) : (
          <div className="grid gap-2">
            {testimonials.map((item, index) => (
              <Card key={item.id} {...getDragProps(index)}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold flex-shrink-0 overflow-hidden">
                      {item.photo_url ? (
                        <img src={item.photo_url} alt={item.customer_name} className="w-full h-full object-cover" />
                      ) : (
                        item.customer_name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{item.customer_name}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className="h-3 w-3" fill={i < item.rating ? '#f5a623' : 'transparent'} stroke={i < item.rating ? '#f5a623' : '#ccc'} />
                          ))}
                        </div>
                        {item.product && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                            <ShoppingBag className="h-3 w-3" />{item.product.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px] hidden sm:block">{item.testimonial}</p>
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
    </div>
  );
}
