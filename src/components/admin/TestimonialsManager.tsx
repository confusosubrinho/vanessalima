import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, GripVertical, Star } from 'lucide-react';
import { useDragReorder } from '@/hooks/useDragReorder';

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

interface Testimonial {
  id: string;
  customer_name: string;
  rating: number;
  testimonial: string;
  display_order: number;
  is_active: boolean;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="focus:outline-none"
        >
          <Star
            className="h-6 w-6 transition-colors"
            fill={star <= value ? '#f5a623' : 'transparent'}
            stroke={star <= value ? '#f5a623' : '#ccc'}
          />
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
  const [formData, setFormData] = useState({ customer_name: '', rating: 5, testimonial: '' });

  // Config
  const { data: config } = useQuery({
    queryKey: ['admin-testimonials-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('homepage_testimonials_config' as any)
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data as unknown as TestimonialConfig;
    },
  });

  const updateConfig = useMutation({
    mutationFn: async (updates: Partial<TestimonialConfig>) => {
      if (!config?.id) return;
      const { error } = await supabase
        .from('homepage_testimonials_config' as any)
        .update(updates as any)
        .eq('id', config.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-testimonials-config'] });
      queryClient.invalidateQueries({ queryKey: ['testimonials-config'] });
      toast({ title: 'Configurações salvas!' });
    },
  });

  // Testimonials
  const { data: testimonials, isLoading } = useQuery({
    queryKey: ['admin-testimonials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('homepage_testimonials' as any)
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data as unknown as Testimonial[]) || [];
    },
  });




  const { getDragProps } = useDragReorder({ items: testimonials || [], onReorder: (reordered) => {
    const updates = reordered.map((item, i) => ({ id: item.id, display_order: i }));
    Promise.all(updates.map(u => supabase.from('homepage_testimonials' as any).update({ display_order: u.display_order } as any).eq('id', u.id)))
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['admin-testimonials'] });
        queryClient.invalidateQueries({ queryKey: ['testimonials'] });
      });
  }});

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        customer_name: data.customer_name,
        rating: data.rating,
        testimonial: data.testimonial,
        display_order: editingItem?.display_order ?? (testimonials?.length || 0),
      };
      if (editingItem) {
        const { error } = await supabase.from('homepage_testimonials' as any).update(payload as any).eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('homepage_testimonials' as any).insert(payload as any);
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
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('homepage_testimonials' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-testimonials'] });
      queryClient.invalidateQueries({ queryKey: ['testimonials'] });
      toast({ title: 'Avaliação excluída!' });
    },
  });

  const resetForm = () => {
    setFormData({ customer_name: '', rating: 5, testimonial: '' });
    setEditingItem(null);
  };

  const handleEdit = (item: Testimonial) => {
    setEditingItem(item);
    setFormData({ customer_name: item.customer_name, rating: item.rating, testimonial: item.testimonial });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Toggle + Title */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Avaliações de Clientes</CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">Exibir na home</Label>
              <Switch
                checked={config?.is_active ?? true}
                onCheckedChange={(checked) => updateConfig.mutate({ is_active: checked })}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Appearance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Título da seção</Label>
              <Input
                value={config?.title || ''}
                onChange={(e) => updateConfig.mutate({ title: e.target.value })}
              />
            </div>
            <div>
              <Label>Subtítulo</Label>
              <Input
                value={config?.subtitle || ''}
                onChange={(e) => updateConfig.mutate({ subtitle: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">Cor de fundo</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config?.bg_color || '#f5f0eb'}
                  onChange={(e) => updateConfig.mutate({ bg_color: e.target.value })}
                  className="w-8 h-8 rounded border cursor-pointer"
                />
                <Input
                  value={config?.bg_color || '#f5f0eb'}
                  onChange={(e) => updateConfig.mutate({ bg_color: e.target.value })}
                  className="text-xs h-8"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Cor dos cards</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config?.card_color || '#ffffff'}
                  onChange={(e) => updateConfig.mutate({ card_color: e.target.value })}
                  className="w-8 h-8 rounded border cursor-pointer"
                />
                <Input
                  value={config?.card_color || '#ffffff'}
                  onChange={(e) => updateConfig.mutate({ card_color: e.target.value })}
                  className="text-xs h-8"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Cor das estrelas</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config?.star_color || '#f5a623'}
                  onChange={(e) => updateConfig.mutate({ star_color: e.target.value })}
                  className="w-8 h-8 rounded border cursor-pointer"
                />
                <Input
                  value={config?.star_color || '#f5a623'}
                  onChange={(e) => updateConfig.mutate({ star_color: e.target.value })}
                  className="text-xs h-8"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Cor do texto</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config?.text_color || '#333333'}
                  onChange={(e) => updateConfig.mutate({ text_color: e.target.value })}
                  className="w-8 h-8 rounded border cursor-pointer"
                />
                <Input
                  value={config?.text_color || '#333333'}
                  onChange={(e) => updateConfig.mutate({ text_color: e.target.value })}
                  className="text-xs h-8"
                />
              </div>
            </div>
          </div>

          {/* Carousel settings */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Cards por vez (desktop)</Label>
              <Input
                type="number"
                min={1}
                max={6}
                value={config?.cards_per_view || 4}
                onChange={(e) => updateConfig.mutate({ cards_per_view: parseInt(e.target.value) || 4 })}
                className="h-8"
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={config?.autoplay ?? true}
                  onCheckedChange={(checked) => updateConfig.mutate({ autoplay: checked })}
                />
                <Label className="text-xs">Autoplay</Label>
              </div>
            </div>
            <div>
              <Label className="text-xs">Velocidade (segundos)</Label>
              <Input
                type="number"
                min={2}
                max={15}
                value={config?.autoplay_speed || 5}
                onChange={(e) => updateConfig.mutate({ autoplay_speed: parseInt(e.target.value) || 5 })}
                className="h-8"
                disabled={!config?.autoplay}
              />
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
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingItem ? 'Editar Avaliação' : 'Nova Avaliação'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-4">
                <div>
                  <Label>Nome do cliente</Label>
                  <Input
                    value={formData.customer_name}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    placeholder="Ex: Maria S."
                    required
                  />
                </div>
                <div>
                  <Label>Nota</Label>
                  <StarRating value={formData.rating} onChange={(v) => setFormData({ ...formData, rating: v })} />
                </div>
                <div>
                  <Label>Depoimento</Label>
                  <Textarea
                    value={formData.testimonial}
                    onChange={(e) => setFormData({ ...formData, testimonial: e.target.value })}
                    placeholder="Texto do depoimento..."
                    rows={4}
                    required
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
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
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold flex-shrink-0">
                      {item.customer_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{item.customer_name}</p>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className="h-3 w-3" fill={i < item.rating ? '#f5a623' : 'transparent'} stroke={i < item.rating ? '#f5a623' : '#ccc'} />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px] hidden sm:block">{item.testimonial}</p>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
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
