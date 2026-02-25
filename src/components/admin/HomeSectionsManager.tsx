import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminHomeSections, HomeSection } from '@/hooks/useHomeSections';
import { useDragReorder } from '@/hooks/useDragReorder';
import { Plus, Pencil, Trash2, GripVertical, LayoutGrid, Rows3, Tag, Star, Sparkles, ShoppingBag, Hand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

const SOURCE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  category: { label: 'Categoria', icon: <Tag className="h-3 w-3" /> },
  featured: { label: 'Destaques', icon: <Star className="h-3 w-3" /> },
  new: { label: 'Novidades', icon: <Sparkles className="h-3 w-3" /> },
  sale: { label: 'Promoções', icon: <ShoppingBag className="h-3 w-3" /> },
  manual: { label: 'Manual', icon: <Hand className="h-3 w-3" /> },
};

const TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  carousel: { label: 'Carrossel', icon: <Rows3 className="h-3 w-3" /> },
  grid: { label: 'Grid', icon: <LayoutGrid className="h-3 w-3" /> },
};

const SORT_OPTIONS = [
  { value: 'newest', label: 'Mais recentes' },
  { value: 'oldest', label: 'Mais antigos' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
  { value: 'discount_desc', label: 'Maior desconto' },
  { value: 'alpha_asc', label: 'A → Z' },
  { value: 'alpha_desc', label: 'Z → A' },
];

const AUTO_SOURCE_TYPES = ['featured', 'new', 'sale'];

interface FormData {
  title: string;
  subtitle: string;
  section_type: string;
  source_type: string;
  category_id: string;
  product_ids: string[];
  max_items: number;
  is_active: boolean;
  show_view_all: boolean;
  view_all_link: string;
  dark_bg: boolean;
  card_bg: boolean;
  sort_order: string;
}

const defaultForm: FormData = {
  title: '', subtitle: '', section_type: 'carousel', source_type: 'category',
  category_id: '', product_ids: [], max_items: 10, is_active: true,
  show_view_all: true, view_all_link: '', dark_bg: false, card_bg: false,
  sort_order: 'newest',
};

export function HomeSectionsManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: sections, isLoading } = useAdminHomeSections();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HomeSection | null>(null);
  const [formData, setFormData] = useState<FormData>({ ...defaultForm });
  const [productSearch, setProductSearch] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['admin-categories-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('id, name').eq('is_active', true).order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allProducts } = useQuery({
    queryKey: ['admin-products-for-sections'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, name, base_price, sale_price, is_active').eq('is_active', true).order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const filteredProducts = allProducts?.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  ) || [];

  const reorderMutation = useMutation({
    mutationFn: async (reordered: HomeSection[]) => {
      const updates = reordered.map((s, i) =>
        supabase.from('home_sections').update({ display_order: i }).eq('id', s.id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-home-sections'] }),
  });

  const { getDragProps } = useDragReorder({
    items: sections || [],
    onReorder: (reordered) => {
      queryClient.setQueryData(['admin-home-sections'], reordered);
      reorderMutation.mutate(reordered);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const isAutoSource = AUTO_SOURCE_TYPES.includes(data.source_type);
      const sectionData: any = {
        title: data.title,
        subtitle: data.subtitle || null,
        section_type: data.section_type,
        source_type: data.source_type,
        category_id: data.source_type === 'category' && data.category_id ? data.category_id : null,
        product_ids: data.source_type === 'manual' ? data.product_ids : [],
        max_items: data.max_items,
        is_active: data.is_active,
        show_view_all: true,
        view_all_link: isAutoSource ? null : (data.view_all_link || null),
        dark_bg: data.dark_bg,
        card_bg: data.card_bg,
        sort_order: data.sort_order || 'newest',
        display_order: editing?.display_order ?? (sections?.length || 0),
      };
      if (editing) {
        const { error } = await supabase.from('home_sections').update(sectionData).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('home_sections').insert(sectionData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-home-sections'] });
      queryClient.invalidateQueries({ queryKey: ['home-sections'] });
      setIsDialogOpen(false);
      toast({ title: editing ? 'Seção atualizada!' : 'Seção criada!' });
    },
    onError: (error: any) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('home_sections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-home-sections'] });
      queryClient.invalidateQueries({ queryKey: ['home-sections'] });
      toast({ title: 'Seção excluída!' });
    },
  });

  const openDialog = (section?: HomeSection) => {
    if (section) {
      setEditing(section);
      setFormData({
        title: section.title,
        subtitle: section.subtitle || '',
        section_type: section.section_type,
        source_type: section.source_type,
        category_id: section.category_id || '',
        product_ids: section.product_ids || [],
        max_items: section.max_items,
        is_active: section.is_active,
        show_view_all: section.show_view_all,
        view_all_link: section.view_all_link || '',
        dark_bg: section.dark_bg,
        card_bg: section.card_bg,
        sort_order: section.sort_order || 'newest',
      });
    } else {
      setEditing(null);
      setFormData({ ...defaultForm });
    }
    setProductSearch('');
    setIsDialogOpen(true);
  };

  const toggleProduct = (productId: string) => {
    setFormData(prev => ({
      ...prev,
      product_ids: prev.product_ids.includes(productId)
        ? prev.product_ids.filter(id => id !== productId)
        : [...prev.product_ids, productId],
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Seções de Produtos</h3>
          <p className="text-sm text-muted-foreground">Configure os grids e carrosséis da página inicial</p>
        </div>
        <Button onClick={() => openDialog()} size="sm">
          <Plus className="h-4 w-4 mr-2" />Nova Seção
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">Carregando...</p>
      ) : sections?.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>Nenhuma seção configurada.</p>
            <p className="text-xs mt-1">A home usará o layout padrão. Adicione seções para personalizar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {sections?.map((section, index) => (
            <Card key={section.id} className={!section.is_active ? 'opacity-50' : ''} {...getDragProps(index)}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{section.title}</p>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        {TYPE_LABELS[section.section_type]?.icon}
                        {TYPE_LABELS[section.section_type]?.label}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        {SOURCE_LABELS[section.source_type]?.icon}
                        {SOURCE_LABELS[section.source_type]?.label}
                      </Badge>
                    </div>
                    {section.subtitle && <p className="text-xs text-muted-foreground truncate">{section.subtitle}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDialog(section)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(section.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) setIsDialogOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Seção' : 'Nova Seção'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Ex: Mais Vendidos" required />
            </div>
            <div className="space-y-2">
              <Label>Subtítulo</Label>
              <Input value={formData.subtitle} onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })} placeholder="Ex: Os modelos mais amados" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de exibição</Label>
                <Select value={formData.section_type} onValueChange={(v) => setFormData({ ...formData, section_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="carousel">Carrossel</SelectItem>
                    <SelectItem value="grid">Grid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Máximo de itens</Label>
                <Input type="number" value={formData.max_items} onChange={(e) => setFormData({ ...formData, max_items: parseInt(e.target.value) || 10 })} min={1} max={50} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Fonte dos produtos</Label>
              <Select value={formData.source_type} onValueChange={(v) => setFormData({ ...formData, source_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="category">Por Categoria</SelectItem>
                  <SelectItem value="featured">Destaques (is_featured)</SelectItem>
                  <SelectItem value="new">Novidades (is_new)</SelectItem>
                  <SelectItem value="sale">Promoções (com sale_price)</SelectItem>
                  <SelectItem value="manual">Seleção Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.source_type === 'category' && (
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={formData.category_id || '_none'} onValueChange={(v) => setFormData({ ...formData, category_id: v === '_none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Todas</SelectItem>
                    {categories?.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.source_type === 'manual' && (
              <div className="space-y-2">
                <Label>Produtos ({formData.product_ids.length} selecionados)</Label>
                <Input placeholder="Buscar produto..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                <ScrollArea className="h-48 border rounded-md p-2">
                  {filteredProducts.map(p => (
                    <label key={p.id} className="flex items-center gap-2 py-1.5 px-1 hover:bg-muted rounded cursor-pointer">
                      <Checkbox
                        checked={formData.product_ids.includes(p.id)}
                        onCheckedChange={() => toggleProduct(p.id)}
                      />
                      <span className="text-sm truncate flex-1">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        R$ {Number(p.sale_price || p.base_price).toFixed(2)}
                      </span>
                    </label>
                  ))}
                </ScrollArea>
              </div>
            )}

            <div className="space-y-2">
              <Label>Ordenação</Label>
              <Select value={formData.sort_order} onValueChange={(v) => setFormData({ ...formData, sort_order: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!AUTO_SOURCE_TYPES.includes(formData.source_type) && (
              <div className="space-y-2">
                <Label>Link "Ver tudo"</Label>
                <Input value={formData.view_all_link} onChange={(e) => setFormData({ ...formData, view_all_link: e.target.value })} placeholder="/categoria/sapatos" />
              </div>
            )}

            {AUTO_SOURCE_TYPES.includes(formData.source_type) && (
              <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                O botão "Ver tudo" será exibido automaticamente com link para a página de {
                  formData.source_type === 'featured' ? 'destaques' :
                  formData.source_type === 'new' ? 'novidades' : 'promoções'
                }.
              </p>
            )}

            <div className="flex items-center gap-2">
              <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData({ ...formData, is_active: v })} />
              <Label className="text-sm">Ativo</Label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={formData.dark_bg} onCheckedChange={(v) => setFormData({ ...formData, dark_bg: v })} />
                <Label className="text-sm">Fundo escuro</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={formData.card_bg} onCheckedChange={(v) => setFormData({ ...formData, card_bg: v })} />
                <Label className="text-sm">Cards brancos</Label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
