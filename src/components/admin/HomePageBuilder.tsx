import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminHomePageSections, HomePageSection, NATIVE_SECTION_KEYS } from '@/hooks/useHomePageSections';
import { useDragReorder } from '@/hooks/useDragReorder';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  GripVertical, Settings, Trash2, Plus, Lock,
  Image as ImageIcon, LayoutGrid, ShoppingBag, Star,
  Mail, CheckSquare, Ruler, Camera, PanelTop,
  Rows3
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

// ─── Section type icons & labels ───

const SECTION_META: Record<string, { icon: React.ReactNode; description: string; category: string }> = {
  banner_carousel:  { icon: <PanelTop className="h-4 w-4" />,      description: 'Slides com imagens e chamadas para ação',    category: 'Conteúdo Visual' },
  features_bar:     { icon: <CheckSquare className="h-4 w-4" />,   description: 'Frete, qualidade, pagamento',                 category: 'Confiança' },
  category_grid:    { icon: <LayoutGrid className="h-4 w-4" />,    description: 'Grade com fotos das categorias',              category: 'Navegação' },
  product_sections: { icon: <ShoppingBag className="h-4 w-4" />,   description: 'Carrosséis e grids de produtos',              category: 'Produtos' },
  highlight_banners:{ icon: <ImageIcon className="h-4 w-4" />,     description: 'Dois banners lado a lado com links',          category: 'Conteúdo Visual' },
  shop_by_size:     { icon: <Ruler className="h-4 w-4" />,         description: 'Filtro rápido por tamanho',                   category: 'Navegação' },
  instagram_feed:   { icon: <Camera className="h-4 w-4" />,        description: 'Últimas fotos do Instagram',                  category: 'Social & Engajamento' },
  testimonials:     { icon: <Star className="h-4 w-4" />,          description: 'Carrossel com depoimentos',                   category: 'Social & Engajamento' },
  newsletter:       { icon: <Mail className="h-4 w-4" />,          description: 'Caixa de captura de e-mail',                  category: 'Social & Engajamento' },
  product_carousel: { icon: <Rows3 className="h-4 w-4" />,         description: 'Produtos em rolagem horizontal',              category: 'Produtos' },
  product_grid:     { icon: <LayoutGrid className="h-4 w-4" />,    description: 'Produtos em grade',                           category: 'Produtos' },
};

const isNative = (section: HomePageSection) => NATIVE_SECTION_KEYS.includes(section.section_key);

// ─── Config Sheet for each section type ───

function SectionConfigSheet({
  section,
  open,
  onClose,
}: {
  section: HomePageSection | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!section) return null;

  const redirectMessage = (area: string) => (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Esta seção é configurada em sua área específica no painel.
      </p>
      <p className="text-xs text-muted-foreground">
        Acesse a aba <strong>{area}</strong> nesta mesma página para gerenciar o conteúdo.
      </p>
    </div>
  );

  const configContent: Record<string, React.ReactNode> = {
    banner_carousel:  redirectMessage('Banners'),
    features_bar:     redirectMessage('Recursos'),
    category_grid:    redirectMessage('Categorias'),
    product_sections: redirectMessage('Seções (aba atual, rolando para baixo)'),
    highlight_banners:redirectMessage('Destaques'),
    shop_by_size:     <p className="text-sm text-muted-foreground">Esta seção é configurada automaticamente com base nos tamanhos cadastrados nos produtos.</p>,
    instagram_feed:   redirectMessage('Inspire-se'),
    testimonials:     redirectMessage('Avaliações'),
    newsletter:       <p className="text-sm text-muted-foreground">Esta seção é configurada automaticamente.</p>,
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {SECTION_META[section.section_type]?.icon}
            {section.label}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          {configContent[section.section_type] || (
            <p className="text-sm text-muted-foreground">Sem configurações adicionais disponíveis.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Template Gallery Dialog ───

interface TemplateItem {
  section_type: string;
  label: string;
  description: string;
  category: string;
  icon: React.ReactNode;
}

const ALL_TEMPLATES: TemplateItem[] = [
  { section_type: 'banner_carousel',   label: 'Carrossel de Banners',    ...SECTION_META.banner_carousel },
  { section_type: 'highlight_banners', label: 'Banners de Destaque',     ...SECTION_META.highlight_banners },
  { section_type: 'category_grid',     label: 'Grid de Categorias',      ...SECTION_META.category_grid },
  { section_type: 'shop_by_size',      label: 'Compre por Tamanho',      ...SECTION_META.shop_by_size },
  { section_type: 'product_carousel',  label: 'Carrossel de Produtos',   ...SECTION_META.product_carousel },
  { section_type: 'product_grid',      label: 'Grid de Produtos',        ...SECTION_META.product_grid },
  { section_type: 'instagram_feed',    label: 'Feed do Instagram',       ...SECTION_META.instagram_feed },
  { section_type: 'testimonials',      label: 'Avaliações de Clientes',  ...SECTION_META.testimonials },
  { section_type: 'newsletter',        label: 'Newsletter',              ...SECTION_META.newsletter },
  { section_type: 'features_bar',      label: 'Barra de Diferenciais',   ...SECTION_META.features_bar },
  { section_type: 'product_sections',  label: 'Seções de Produtos',      ...SECTION_META.product_sections },
];

function TemplateGallery({
  open,
  onClose,
  existingTypes,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  existingTypes: string[];
  onSelect: (template: TemplateItem) => void;
}) {
  const categories = [...new Set(ALL_TEMPLATES.map(t => t.category))];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar Seção</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 mt-2">
          {categories.map(cat => (
            <div key={cat}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">{cat}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ALL_TEMPLATES.filter(t => t.category === cat).map(template => {
                  const alreadyExists = existingTypes.includes(template.section_type);
                  return (
                    <Card
                      key={template.section_type}
                      className={`cursor-pointer transition-colors hover:border-primary/50 ${alreadyExists ? 'opacity-50' : ''}`}
                      onClick={() => {
                        if (alreadyExists) return;
                        onSelect(template);
                      }}
                    >
                      <CardContent className="p-4 flex items-start gap-3">
                        <div className="mt-0.5 text-muted-foreground">{template.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{template.label}</p>
                            {alreadyExists && <Badge variant="outline" className="text-[10px]">Já na home</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───

export function HomePageBuilder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: sections, isLoading } = useAdminHomePageSections();
  const [configSection, setConfigSection] = useState<HomePageSection | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  // Reorder
  const reorderMutation = useMutation({
    mutationFn: async (reordered: HomePageSection[]) => {
      const updates = reordered.map((s, i) =>
        supabase.from('home_page_sections').update({ display_order: i } as Database['public']['Tables']['home_page_sections']['Update']).eq('id', s.id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-home-page-sections'] });
      queryClient.invalidateQueries({ queryKey: ['home-page-sections'] });
    },
  });

  const { getDragProps } = useDragReorder({
    items: sections || [],
    onReorder: (reordered) => {
      queryClient.setQueryData(['admin-home-page-sections'], reordered);
      reorderMutation.mutate(reordered);
    },
  });

  // Toggle active
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('home_page_sections')
        .update({ is_active } as Database['public']['Tables']['home_page_sections']['Update'])
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, is_active }) => {
      // Optimistic update
      queryClient.setQueryData(['admin-home-page-sections'], (old: HomePageSection[] | undefined) =>
        old?.map(s => s.id === id ? { ...s, is_active } : s)
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-page-sections'] });
      toast({ title: 'Seção atualizada!' });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-home-page-sections'] });
      toast({ title: 'Erro ao atualizar', variant: 'destructive' });
    },
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('home_page_sections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-home-page-sections'] });
      queryClient.invalidateQueries({ queryKey: ['home-page-sections'] });
      toast({ title: 'Seção removida!' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  // Add section from gallery
  const addSectionMutation = useMutation({
    mutationFn: async (template: TemplateItem) => {
      const key = `${template.section_type}_${Date.now()}`;
      const { error } = await supabase.from('home_page_sections').insert({
        section_key: key,
        section_type: template.section_type,
        label: template.label,
        display_order: (sections?.length || 0),
        is_active: true,
        config: {},
      } as Database['public']['Tables']['home_page_sections']['Insert']);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-home-page-sections'] });
      queryClient.invalidateQueries({ queryKey: ['home-page-sections'] });
      setShowGallery(false);
      toast({ title: 'Seção adicionada!' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  // Re-add a native section that was deleted
  const reAddNativeMutation = useMutation({
    mutationFn: async (template: TemplateItem) => {
      const nativeKeys: Record<string, string> = {
        banner_carousel: 'banner_carousel',
        features_bar: 'features_bar',
        category_grid: 'category_grid',
        product_sections: 'product_sections',
        highlight_banners: 'highlight_banners',
        shop_by_size: 'shop_by_size',
        instagram_feed: 'instagram_feed',
        testimonials: 'customer_testimonials',
        newsletter: 'newsletter',
      };
      const key = nativeKeys[template.section_type] || template.section_type;
      const { error } = await supabase.from('home_page_sections').insert({
        section_key: key,
        section_type: template.section_type,
        label: template.label,
        display_order: (sections?.length || 0),
        is_active: true,
        config: {},
      } as Database['public']['Tables']['home_page_sections']['Insert']);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-home-page-sections'] });
      queryClient.invalidateQueries({ queryKey: ['home-page-sections'] });
      setShowGallery(false);
      toast({ title: 'Seção restaurada!' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const activeCount = sections?.filter(s => s.is_active).length || 0;
  const inactiveCount = (sections?.length || 0) - activeCount;

  const existingTypes = sections?.map(s => s.section_type) || [];

  const handleSelectTemplate = (template: TemplateItem) => {
    // Check if it's a native type that already exists
    const existsAsNative = sections?.some(s => s.section_type === template.section_type && isNative(s));
    if (existsAsNative) {
      toast({ title: 'Esta seção já está na home', description: 'Clique no ⚙️ ao lado dela para configurá-la.' });
      return;
    }

    // Check if it's a native type that was removed (can re-add)
    const isNativeType = NATIVE_SECTION_KEYS.some(k => {
      const mappedType = k === 'customer_testimonials' ? 'testimonials' : k;
      return mappedType === template.section_type;
    });
    const existsAlready = sections?.some(s => s.section_type === template.section_type);

    if (isNativeType && !existsAlready) {
      reAddNativeMutation.mutate(template);
      return;
    }

    // For product types, allow multiple instances
    if (['product_carousel', 'product_grid'].includes(template.section_type)) {
      addSectionMutation.mutate(template);
      return;
    }

    // For other native types that already exist
    if (existsAlready) {
      toast({ title: 'Esta seção já está na home', description: 'Clique no ⚙️ ao lado dela para configurá-la.' });
      return;
    }

    addSectionMutation.mutate(template);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Construtor da Home</h3>
          <p className="text-sm text-muted-foreground">
            {activeCount} seções ativas • {inactiveCount} inativas
          </p>
        </div>
        <Button onClick={() => setShowGallery(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />Adicionar Seção
        </Button>
      </div>

      <Separator />

      {/* Sections list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">Carregando...</p>
      ) : !sections?.length ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>Nenhuma seção configurada.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {sections.map((section, index) => {
            const meta = SECTION_META[section.section_type];
            const native = isNative(section);

            return (
              <Card
                key={section.id}
                className={`transition-opacity ${!section.is_active ? 'opacity-50' : ''}`}
                {...getDragProps(index)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />

                    {/* Order number */}
                    <span className="text-xs font-mono text-muted-foreground w-5 text-center flex-shrink-0">
                      {index + 1}
                    </span>

                    {/* Icon */}
                    <div className="text-muted-foreground flex-shrink-0">
                      {meta?.icon || <LayoutGrid className="h-4 w-4" />}
                    </div>

                    {/* Label + badges */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm truncate">{section.label}</p>
                        {native && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Lock className="h-2.5 w-2.5" />nativo
                          </Badge>
                        )}
                        {!native && (
                          <Badge variant="secondary" className="text-[10px]">
                            {section.section_type === 'product_carousel' ? 'carrossel' :
                             section.section_type === 'product_grid' ? 'grid' :
                             section.section_type}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Toggle */}
                    <Switch
                      checked={section.is_active}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: section.id, is_active: checked })}
                      className="flex-shrink-0"
                    />

                    {/* Config button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={() => setConfigSection(section)}
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </Button>

                    {/* Delete (only non-native) */}
                    {!native && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive flex-shrink-0"
                        onClick={() => {
                          if (confirm('Excluir esta seção?')) {
                            deleteMutation.mutate(section.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        💡 Arraste para reordenar. Use o toggle para ativar/desativar seções. Seções nativas não podem ser excluídas.
      </p>

      {/* Config Sheet */}
      <SectionConfigSheet
        section={configSection}
        open={!!configSection}
        onClose={() => setConfigSection(null)}
      />

      {/* Template Gallery */}
      <TemplateGallery
        open={showGallery}
        onClose={() => setShowGallery(false)}
        existingTypes={existingTypes}
        onSelect={handleSelectTemplate}
      />
    </div>
  );
}
