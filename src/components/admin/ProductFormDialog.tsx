import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ProductMediaUpload } from './ProductMediaUpload';
import { ProductSEOFields } from './ProductSEOFields';
import { ProductVariantsManager, VariantItem } from './ProductVariantsManager';
import { Category } from '@/types/database';

interface MediaItem {
  id: string;
  url: string;
  alt_text: string | null;
  display_order: number;
  is_primary: boolean;
  media_type: string;
}

interface ProductFormData {
  name: string;
  slug: string;
  description: string;
  base_price: string;
  sale_price: string;
  category_id: string;
  sku: string;
  is_active: boolean;
  is_featured: boolean;
  is_new: boolean;
  // Shipping & dimensions
  weight: string;
  width: string;
  height: string;
  depth: string;
  // Google Merchant
  gtin: string;
  mpn: string;
  brand: string;
  condition: string;
  google_product_category: string;
  age_group: string;
  gender: string;
  material: string;
  pattern: string;
  // SEO
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
}

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProduct?: any | null;
}

function generateProductSku(name: string): string {
  const words = name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 3);
  const base = words.map(w => w.substring(0, 3)).join('');
  const num = String(Math.floor(Math.random() * 900) + 100);
  return `VLS-${base}-${num}`;
}

const initialFormData: ProductFormData = {
  name: '',
  slug: '',
  description: '',
  base_price: '',
  sale_price: '',
  category_id: '',
  sku: '',
  is_active: true,
  is_featured: false,
  is_new: false,
  weight: '',
  width: '',
  height: '',
  depth: '',
  gtin: '',
  mpn: '',
  brand: 'Vanessa Lima Shoes',
  condition: 'new',
  google_product_category: 'Vestuário e acessórios > Sapatos',
  age_group: 'adult',
  gender: 'female',
  material: '',
  pattern: '',
  seo_title: '',
  seo_description: '',
  seo_keywords: '',
};

export function ProductFormDialog({ open, onOpenChange, editingProduct }: ProductFormDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [variants, setVariants] = useState<VariantItem[]>([]);
  const [characteristics, setCharacteristics] = useState<{ name: string; value: string }[]>([]);

  const { data: categories } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('*').order('name');
      return data as Category[];
    },
  });

  // Get category name for SEO
  const selectedCategory = categories?.find(c => c.id === formData.category_id);

  useEffect(() => {
    if (editingProduct) {
      setFormData({
        name: editingProduct.name || '',
        slug: editingProduct.slug || '',
        description: editingProduct.description || '',
        base_price: String(editingProduct.base_price || ''),
        sale_price: editingProduct.sale_price ? String(editingProduct.sale_price) : '',
        category_id: editingProduct.category_id || '',
        sku: editingProduct.sku || '',
        is_active: editingProduct.is_active ?? true,
        is_featured: editingProduct.is_featured ?? false,
        is_new: editingProduct.is_new ?? false,
        weight: editingProduct.weight ? String(editingProduct.weight) : '',
        width: editingProduct.width ? String(editingProduct.width) : '',
        height: editingProduct.height ? String(editingProduct.height) : '',
        depth: editingProduct.depth ? String(editingProduct.depth) : '',
        gtin: editingProduct.gtin || '',
        mpn: editingProduct.mpn || '',
        brand: editingProduct.brand || '',
        condition: editingProduct.condition || 'new',
        google_product_category: editingProduct.google_product_category || 'Vestuário e acessórios > Sapatos',
        age_group: editingProduct.age_group || 'adult',
        gender: editingProduct.gender || 'female',
        material: editingProduct.material || '',
        pattern: editingProduct.pattern || '',
        seo_title: editingProduct.seo_title || '',
        seo_description: editingProduct.seo_description || '',
        seo_keywords: editingProduct.seo_keywords || '',
      });
      // Load existing media
      if (editingProduct.images) {
        setMedia(editingProduct.images.map((img: any) => ({
          id: img.id,
          url: img.url,
          alt_text: img.alt_text,
          display_order: img.display_order || 0,
          is_primary: img.is_primary || false,
          media_type: img.media_type || 'image',
        })));
      }
      // Load existing variants
      if (editingProduct.variants) {
        setVariants(editingProduct.variants.map((v: any) => ({
          id: v.id,
          size: v.size || '',
          color: v.color || '',
          color_hex: v.color_hex || '',
          stock_quantity: v.stock_quantity || 0,
          price_modifier: v.price_modifier || 0,
          sku: v.sku || '',
          is_active: v.is_active ?? true,
        })));
      }
      // Load existing characteristics
      if (editingProduct.id) {
        supabase
          .from('product_characteristics' as any)
          .select('*')
          .eq('product_id', editingProduct.id)
          .order('display_order')
          .then(({ data: chars }) => {
            if (chars) {
              setCharacteristics((chars as any[]).map((c: any) => ({ name: c.name, value: c.value })));
            }
          });
      }
    } else {
      setFormData(initialFormData);
      setMedia([]);
      setVariants([]);
      setCharacteristics([]);
    }
  }, [editingProduct, open]);

  const saveMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const productData = {
        name: data.name,
        slug: data.slug || data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        description: data.description || null,
        base_price: parseFloat(data.base_price),
        sale_price: data.sale_price ? parseFloat(data.sale_price) : null,
        category_id: data.category_id || null,
        sku: data.sku || null,
        is_active: data.is_active,
        is_featured: data.is_featured,
        is_new: data.is_new,
        weight: data.weight ? parseFloat(data.weight) : null,
        width: data.width ? parseFloat(data.width) : null,
        height: data.height ? parseFloat(data.height) : null,
        depth: data.depth ? parseFloat(data.depth) : null,
        gtin: data.gtin || null,
        mpn: data.mpn || null,
        brand: data.brand || null,
        condition: data.condition || 'new',
        google_product_category: data.google_product_category || null,
        age_group: data.age_group || null,
        gender: data.gender || null,
        material: data.material || null,
        pattern: data.pattern || null,
        seo_title: data.seo_title || null,
        seo_description: data.seo_description || null,
        seo_keywords: data.seo_keywords || null,
      };

      let productId = editingProduct?.id;

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);
        if (error) throw error;
      } else {
        const { data: newProduct, error } = await supabase
          .from('products')
          .insert(productData)
          .select('id')
          .single();
        if (error) throw error;
        productId = newProduct.id;
      }

      // Handle media - delete old and insert new
      if (productId) {
        // Delete existing images
        await supabase.from('product_images').delete().eq('product_id', productId);
        
        // Insert new media
        if (media.length > 0) {
          const mediaInserts = media.map((m, index) => ({
            product_id: productId,
            url: m.url,
            alt_text: m.alt_text,
            display_order: index,
            is_primary: m.is_primary,
            media_type: m.media_type,
          }));
          
          const { error: mediaError } = await supabase
            .from('product_images')
            .insert(mediaInserts);
          
          if (mediaError) throw mediaError;
        }

        // Handle variants - delete old and insert new
        await supabase.from('product_variants').delete().eq('product_id', productId);
        if (variants.length > 0) {
          const variantInserts = variants.map(v => ({
            product_id: productId,
            size: v.size,
            color: v.color || null,
            color_hex: v.color_hex || null,
            stock_quantity: v.stock_quantity,
            price_modifier: v.price_modifier || 0,
            sku: v.sku || null,
            is_active: v.is_active,
          }));
          const { error: varError } = await supabase
            .from('product_variants')
            .insert(variantInserts);
          if (varError) throw varError;
        }

        // Handle characteristics
        if (productId) {
          await supabase.from('product_characteristics' as any).delete().eq('product_id', productId);
          if (characteristics.length > 0) {
            const charInserts = characteristics
              .filter(c => c.name && c.value)
              .map((c, i) => ({
                product_id: productId,
                name: c.name,
                value: c.value,
                display_order: i,
              }));
            if (charInserts.length > 0) {
              await supabase.from('product_characteristics' as any).insert(charInserts);
            }
          }
        }
      }

      return productId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      onOpenChange(false);
      toast({ title: editingProduct ? 'Produto atualizado!' : 'Produto criado!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>{editingProduct ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="basic" className="w-full">
            <div className="px-6">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="basic">Básico</TabsTrigger>
                <TabsTrigger value="media">Mídia</TabsTrigger>
                <TabsTrigger value="variants">Variantes</TabsTrigger>
                <TabsTrigger value="characteristics">Características</TabsTrigger>
                <TabsTrigger value="shipping">Frete & GMC</TabsTrigger>
                <TabsTrigger value="seo">SEO</TabsTrigger>
              </TabsList>
            </div>
            
            <ScrollArea className="h-[60vh] px-6">
              <TabsContent value="basic" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nome *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                        const updates: Partial<ProductFormData> = { name, slug };
                        if (!editingProduct && !formData.sku) {
                          updates.sku = name.length > 3 ? generateProductSku(name) : '';
                        }
                        setFormData(prev => ({ ...prev, ...updates }));
                      }}
                      required
                    />
                  </div>
                  <div>
                    <Label>Slug</Label>
                    <Input
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                      placeholder="gerado-automaticamente"
                    />
                  </div>
                </div>
                
                <div>
                  <Label>Descrição</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Preço Base *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.base_price}
                      onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Preço Promocional</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.sale_price}
                      onChange={(e) => setFormData({ ...formData, sale_price: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>SKU</Label>
                    <Input
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Categoria</Label>
                    <Select
                      value={formData.category_id}
                      onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories?.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Marca</Label>
                    <Input
                      value={formData.brand}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                      placeholder="Ex: Nike, Adidas"
                    />
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                    <Label>Ativo</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.is_featured}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_featured: checked })}
                    />
                    <Label>Destaque</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.is_new}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_new: checked })}
                    />
                    <Label>Lançamento</Label>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="media" className="mt-4">
                <ProductMediaUpload
                  productId={editingProduct?.id}
                  media={media}
                  onChange={setMedia}
                />
              </TabsContent>
              
              <TabsContent value="variants" className="mt-4">
                <ProductVariantsManager
                  variants={variants}
                  onChange={setVariants}
                  productId={editingProduct?.id}
                  parentSku={formData.sku}
                  parentWeight={formData.weight}
                  parentWidth={formData.width}
                  parentHeight={formData.height}
                  parentDepth={formData.depth}
                  parentBasePrice={formData.base_price}
                  parentSalePrice={formData.sale_price}
                  productImages={media.filter(m => m.media_type === 'image').map(m => ({
                    id: m.id,
                    url: m.url,
                    alt_text: m.alt_text,
                    is_primary: m.is_primary,
                  }))}
                />
              </TabsContent>
              
              <TabsContent value="shipping" className="mt-4 space-y-6">
                {/* Dimensions for shipping */}
                <div>
                  <h3 className="font-medium mb-3">Dimensões & Peso (para cálculo de frete)</h3>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <Label>Peso (kg)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.weight}
                        onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                        placeholder="0.5"
                      />
                    </div>
                    <div>
                      <Label>Largura (cm)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={formData.width}
                        onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                        placeholder="20"
                      />
                    </div>
                    <div>
                      <Label>Altura (cm)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={formData.height}
                        onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                        placeholder="10"
                      />
                    </div>
                    <div>
                      <Label>Profundidade (cm)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={formData.depth}
                        onChange={(e) => setFormData({ ...formData, depth: e.target.value })}
                        placeholder="30"
                      />
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                {/* Google Merchant Center fields */}
                <div>
                  <h3 className="font-medium mb-3">Google Merchant Center</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>GTIN / EAN / Código de Barras</Label>
                      <Input
                        value={formData.gtin}
                        onChange={(e) => setFormData({ ...formData, gtin: e.target.value })}
                        placeholder="7891234567890"
                      />
                    </div>
                    <div>
                      <Label>MPN (Número do Fabricante)</Label>
                      <Input
                        value={formData.mpn}
                        onChange={(e) => setFormData({ ...formData, mpn: e.target.value })}
                        placeholder="ABC123"
                      />
                    </div>
                    <div>
                      <Label>Condição</Label>
                      <Select
                        value={formData.condition}
                        onValueChange={(value) => setFormData({ ...formData, condition: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">Novo</SelectItem>
                          <SelectItem value="refurbished">Recondicionado</SelectItem>
                          <SelectItem value="used">Usado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Categoria Google</Label>
                      <Input
                        value={formData.google_product_category}
                        onChange={(e) => setFormData({ ...formData, google_product_category: e.target.value })}
                        placeholder="Vestuário e acessórios > Sapatos"
                      />
                    </div>
                    <div>
                      <Label>Faixa Etária</Label>
                      <Select
                        value={formData.age_group}
                        onValueChange={(value) => setFormData({ ...formData, age_group: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="adult">Adulto</SelectItem>
                          <SelectItem value="kids">Infantil</SelectItem>
                          <SelectItem value="toddler">Bebê</SelectItem>
                          <SelectItem value="infant">Recém-nascido</SelectItem>
                          <SelectItem value="newborn">Neonato</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Gênero</Label>
                      <Select
                        value={formData.gender}
                        onValueChange={(value) => setFormData({ ...formData, gender: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="female">Feminino</SelectItem>
                          <SelectItem value="male">Masculino</SelectItem>
                          <SelectItem value="unisex">Unissex</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Material</Label>
                      <Input
                        value={formData.material}
                        onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                        placeholder="Couro, Camurça"
                      />
                    </div>
                    <div>
                      <Label>Padrão / Estampa</Label>
                      <Input
                        value={formData.pattern}
                        onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
                        placeholder="Liso, Listrado, Animal Print"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="seo" className="mt-4">
                <ProductSEOFields
                  productData={{
                    name: formData.name,
                    description: formData.description,
                    base_price: formData.base_price,
                    sale_price: formData.sale_price,
                    brand: formData.brand,
                    category_name: selectedCategory?.name || '',
                    material: formData.material,
                  }}
                  seoData={{
                    seo_title: formData.seo_title,
                    seo_description: formData.seo_description,
                    seo_keywords: formData.seo_keywords,
                  }}
                  onChange={(seo) => setFormData({ ...formData, ...seo })}
                />
              </TabsContent>

              <TabsContent value="characteristics" className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Características do Produto</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCharacteristics([...characteristics, { name: '', value: '' }])}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar
                  </Button>
                </div>
                {characteristics.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhuma característica adicionada. Clique em "Adicionar" para incluir informações como Material, Solado, Forro, etc.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {characteristics.map((char, index) => (
                      <div key={index} className="flex gap-3 items-start">
                        <div className="flex-1">
                          <Input
                            placeholder="Ex: Material"
                            value={char.name}
                            onChange={(e) => {
                              const updated = [...characteristics];
                              updated[index].name = e.target.value;
                              setCharacteristics(updated);
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <Input
                            placeholder="Ex: Couro Legítimo"
                            value={char.value}
                            onChange={(e) => {
                              const updated = [...characteristics];
                              updated[index].value = e.target.value;
                              setCharacteristics(updated);
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive flex-shrink-0"
                          onClick={() => setCharacteristics(characteristics.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
          
          <div className="flex justify-end gap-2 p-6 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
