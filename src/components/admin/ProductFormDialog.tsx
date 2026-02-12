import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Search, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
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
  cost: string;
  category_id: string;
  sku: string;
  is_active: boolean;
  is_featured: boolean;
  is_new: boolean;
  weight: string;
  width: string;
  height: string;
  depth: string;
  gtin: string;
  mpn: string;
  brand: string;
  condition: string;
  google_product_category: string;
  age_group: string;
  gender: string;
  material: string;
  pattern: string;
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
  cost: '',
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

const STEPS = [
  { key: 'basic', label: 'Básico' },
  { key: 'media', label: 'Mídia' },
  { key: 'variants', label: 'Variantes' },
  { key: 'characteristics', label: 'Caract.' },
  { key: 'buy-together', label: 'Compre Junto' },
  { key: 'shipping', label: 'Frete & GMC' },
  { key: 'seo', label: 'SEO' },
];

export function ProductFormDialog({ open, onOpenChange, editingProduct }: ProductFormDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [variants, setVariants] = useState<VariantItem[]>([]);
  const [characteristics, setCharacteristics] = useState<{ name: string; value: string }[]>([]);
  const [buyTogetherItems, setBuyTogetherItems] = useState<{ product_id: string; discount_percent: number }[]>([]);
  const [buyTogetherSearch, setBuyTogetherSearch] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [activeTab, setActiveTab] = useState('basic');

  const { data: allProducts } = useQuery({
    queryKey: ['admin-all-products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, base_price, sale_price, slug').eq('is_active', true).order('name');
      return data || [];
    },
  });

  const { data: storeSettings } = useQuery({
    queryKey: ['store-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('store_settings').select('pix_discount, installment_interest_rate, installments_without_interest, max_installments, cash_discount').single();
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('*').order('name');
      return data as Category[];
    },
  });

  const selectedCategory = categories?.find(c => c.id === formData.category_id);

  // Reset step when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentStep(0);
      setActiveTab('basic');
    }
  }, [open]);

  useEffect(() => {
    if (editingProduct) {
      setFormData({
        name: editingProduct.name || '',
        slug: editingProduct.slug || '',
        description: editingProduct.description || '',
        base_price: String(editingProduct.base_price || ''),
        sale_price: editingProduct.sale_price ? String(editingProduct.sale_price) : '',
        cost: editingProduct.cost ? String(editingProduct.cost) : '',
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
        supabase
          .from('buy_together_products')
          .select('*')
          .eq('product_id', editingProduct.id)
          .then(({ data: btItems }) => {
            if (btItems) {
              setBuyTogetherItems((btItems as any[]).map((bt: any) => ({
                product_id: bt.related_product_id,
                discount_percent: bt.discount_percent || 5,
              })));
            }
          });
      }
    } else {
      setFormData(initialFormData);
      setMedia([]);
      setVariants([]);
      setCharacteristics([]);
      setBuyTogetherItems([]);
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
        cost: data.cost ? parseFloat(data.cost) : null,
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

      if (productId) {
        await supabase.from('product_images').delete().eq('product_id', productId);
        if (media.length > 0) {
          const mediaInserts = media.map((m, index) => ({
            product_id: productId,
            url: m.url,
            alt_text: m.alt_text,
            display_order: index,
            is_primary: m.is_primary,
            media_type: m.media_type,
          }));
          const { error: mediaError } = await supabase.from('product_images').insert(mediaInserts);
          if (mediaError) throw mediaError;
        }

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
          const { error: varError } = await supabase.from('product_variants').insert(variantInserts);
          if (varError) throw varError;
        }

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

          await supabase.from('buy_together_products').delete().eq('product_id', productId);
          if (buyTogetherItems.length > 0) {
            const btInserts = buyTogetherItems.map((bt, i) => ({
              product_id: productId,
              related_product_id: bt.product_id,
              discount_percent: bt.discount_percent,
              display_order: i,
              is_active: true,
            }));
            await supabase.from('buy_together_products').insert(btInserts);
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

  const goNext = () => {
    if (currentStep < STEPS.length - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      setActiveTab(STEPS[next].key);
    }
  };

  const goPrev = () => {
    if (currentStep > 0) {
      const prev = currentStep - 1;
      setCurrentStep(prev);
      setActiveTab(STEPS[prev].key);
    }
  };

  // --- Shared tab content ---
  const renderBasicContent = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          <Label>Preço Promo</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.sale_price}
            onChange={(e) => setFormData({ ...formData, sale_price: e.target.value })}
          />
        </div>
        <div>
          <Label>Custo</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.cost}
            onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
            placeholder="0.00"
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

      {formData.cost && parseFloat(formData.cost) > 0 && (
        <div className="rounded-lg border p-3 sm:p-4 bg-muted/50 space-y-2">
          <Label className="text-sm font-semibold">📊 Margem de Lucro</Label>
          {(() => {
            const cost = parseFloat(formData.cost);
            const sellPrice = formData.sale_price ? parseFloat(formData.sale_price) : (formData.base_price ? parseFloat(formData.base_price) : 0);
            if (!sellPrice || sellPrice <= 0) return <p className="text-sm text-muted-foreground">Preencha o preço para ver a margem.</p>;
            const checkoutFee = 0.015;
            const pixDiscount = storeSettings?.pix_discount || storeSettings?.cash_discount || 5;
            const pixPrice = sellPrice * (1 - pixDiscount / 100);
            const pixFees = pixPrice * checkoutFee;
            const pixProfit = pixPrice - cost - pixFees;
            const pixMargin = ((pixProfit / pixPrice) * 100);
            const gatewayRate = 0.0499;
            const cardFees = sellPrice * gatewayRate + sellPrice * checkoutFee;
            const cardProfit = sellPrice - cost - cardFees;
            const cardMargin = ((cardProfit / sellPrice) * 100);
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">PIX ({pixDiscount}% desc. + 1,5%)</p>
                  <p className="text-sm">Venda: <strong>R$ {pixPrice.toFixed(2)}</strong></p>
                  <p className={`text-sm font-bold ${pixProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    Lucro: R$ {pixProfit.toFixed(2)} ({pixMargin.toFixed(1)}%)
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Cartão 6x (4.99% + 1,5%)</p>
                  <p className="text-sm">Venda: <strong>R$ {sellPrice.toFixed(2)}</strong></p>
                  <p className={`text-sm font-bold ${cardProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    Lucro: R$ {cardProfit.toFixed(2)} ({cardMargin.toFixed(1)}%)
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
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
    </div>
  );

  const renderMediaContent = () => (
    <ProductMediaUpload
      productId={editingProduct?.id}
      media={media}
      onChange={setMedia}
    />
  );

  const renderVariantsContent = () => (
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
  );

  const renderShippingContent = () => (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium mb-3">Dimensões & Peso</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label>Peso (kg)</Label>
            <Input type="number" step="0.01" value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value })} placeholder="0.5" />
          </div>
          <div>
            <Label>Largura (cm)</Label>
            <Input type="number" step="0.1" value={formData.width} onChange={(e) => setFormData({ ...formData, width: e.target.value })} placeholder="20" />
          </div>
          <div>
            <Label>Altura (cm)</Label>
            <Input type="number" step="0.1" value={formData.height} onChange={(e) => setFormData({ ...formData, height: e.target.value })} placeholder="10" />
          </div>
          <div>
            <Label>Profund. (cm)</Label>
            <Input type="number" step="0.1" value={formData.depth} onChange={(e) => setFormData({ ...formData, depth: e.target.value })} placeholder="30" />
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="font-medium mb-3">Google Merchant Center</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>GTIN / EAN</Label>
            <Input value={formData.gtin} onChange={(e) => setFormData({ ...formData, gtin: e.target.value })} placeholder="7891234567890" />
          </div>
          <div>
            <Label>MPN</Label>
            <Input value={formData.mpn} onChange={(e) => setFormData({ ...formData, mpn: e.target.value })} placeholder="ABC123" />
          </div>
          <div>
            <Label>Condição</Label>
            <Select value={formData.condition} onValueChange={(value) => setFormData({ ...formData, condition: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Novo</SelectItem>
                <SelectItem value="refurbished">Recondicionado</SelectItem>
                <SelectItem value="used">Usado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Categoria Google</Label>
            <Input value={formData.google_product_category} onChange={(e) => setFormData({ ...formData, google_product_category: e.target.value })} placeholder="Vestuário e acessórios > Sapatos" />
          </div>
          <div>
            <Label>Faixa Etária</Label>
            <Select value={formData.age_group} onValueChange={(value) => setFormData({ ...formData, age_group: value })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
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
            <Select value={formData.gender} onValueChange={(value) => setFormData({ ...formData, gender: value })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="female">Feminino</SelectItem>
                <SelectItem value="male">Masculino</SelectItem>
                <SelectItem value="unisex">Unissex</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Material</Label>
            <Input value={formData.material} onChange={(e) => setFormData({ ...formData, material: e.target.value })} placeholder="Couro, Camurça" />
          </div>
          <div>
            <Label>Padrão / Estampa</Label>
            <Input value={formData.pattern} onChange={(e) => setFormData({ ...formData, pattern: e.target.value })} placeholder="Liso, Listrado" />
          </div>
        </div>
      </div>
    </div>
  );

  const renderSEOContent = () => (
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
  );

  const renderCharacteristicsContent = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Características</h3>
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
          Nenhuma característica. Clique em "Adicionar" para incluir Material, Solado, etc.
        </p>
      ) : (
        <div className="space-y-3">
          {characteristics.map((char, index) => (
            <div key={index} className="flex gap-2 items-start">
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
                  placeholder="Ex: Couro"
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
    </div>
  );

  const renderBuyTogetherContent = () => (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium mb-2">Compre Junto</h3>
        <p className="text-sm text-muted-foreground mb-4">Selecione produtos para oferecer com desconto.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar produto..."
          value={buyTogetherSearch}
          onChange={(e) => setBuyTogetherSearch(e.target.value)}
          className="pl-10"
        />
      </div>
      {buyTogetherSearch.length > 1 && (
        <div className="border rounded-lg max-h-40 overflow-y-auto">
          {allProducts
            ?.filter(p =>
              p.name.toLowerCase().includes(buyTogetherSearch.toLowerCase()) &&
              p.id !== editingProduct?.id &&
              !buyTogetherItems.some(bt => bt.product_id === p.id)
            )
            .slice(0, 5)
            .map(p => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex justify-between items-center"
                onClick={() => {
                  setBuyTogetherItems([...buyTogetherItems, { product_id: p.id, discount_percent: 5 }]);
                  setBuyTogetherSearch('');
                }}
              >
                <span className="truncate mr-2">{p.name}</span>
                <Plus className="h-4 w-4 text-primary flex-shrink-0" />
              </button>
            ))}
        </div>
      )}
      {buyTogetherItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhum produto adicionado ao "Compre Junto".
        </p>
      ) : (
        <div className="space-y-3">
          {buyTogetherItems.map((bt, index) => {
            const prod = allProducts?.find(p => p.id === bt.product_id);
            return (
              <div key={bt.product_id} className="flex gap-2 items-center border rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{prod?.name || 'Não encontrado'}</p>
                </div>
                <div className="w-20">
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={bt.discount_percent}
                    onChange={(e) => {
                      const updated = [...buyTogetherItems];
                      updated[index].discount_percent = Number(e.target.value);
                      setBuyTogetherItems(updated);
                    }}
                    className="text-center"
                  />
                  <p className="text-xs text-muted-foreground text-center mt-1">% desc.</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive flex-shrink-0"
                  onClick={() => setBuyTogetherItems(buyTogetherItems.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderStepContent = (stepKey: string) => {
    switch (stepKey) {
      case 'basic': return renderBasicContent();
      case 'media': return renderMediaContent();
      case 'variants': return renderVariantsContent();
      case 'characteristics': return renderCharacteristicsContent();
      case 'buy-together': return renderBuyTogetherContent();
      case 'shipping': return renderShippingContent();
      case 'seo': return renderSEOContent();
      default: return null;
    }
  };

  // --- Mobile stepper indicator ---
  const renderStepIndicator = () => (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={goPrev}
        disabled={currentStep === 0}
        className="h-8 w-8"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex flex-col items-center gap-1">
        <div className="flex gap-1">
          {STEPS.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => { setCurrentStep(idx); setActiveTab(STEPS[idx].key); }}
              className={`h-2 rounded-full transition-all ${
                idx === currentStep
                  ? 'w-6 bg-primary'
                  : 'w-2 bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {currentStep + 1}/{STEPS.length} — {STEPS[currentStep].label}
        </span>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={goNext}
        disabled={currentStep === STEPS.length - 1}
        className="h-8 w-8"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  // --- Mobile footer with prev/next/save ---
  const renderMobileFooter = () => (
    <div className="flex items-center gap-2 p-3 border-t bg-background">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={goPrev}
        disabled={currentStep === 0}
        className="flex-1"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Anterior
      </Button>

      {currentStep < STEPS.length - 1 ? (
        <Button
          type="button"
          size="sm"
          onClick={goNext}
          className="flex-1"
        >
          Próximo
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      ) : (
        <Button
          type="submit"
          size="sm"
          disabled={saveMutation.isPending}
          className="flex-1"
        >
          <Check className="h-4 w-4 mr-1" />
          {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`p-0 ${isMobile ? 'max-w-[100vw] w-full h-[100dvh] max-h-[100dvh] rounded-none border-0 m-0' : 'max-w-4xl max-h-[95vh]'}`}>
        <DialogHeader className="p-4 sm:p-6 pb-0">
          <DialogTitle>{editingProduct ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {isMobile ? (
            <>
              {renderStepIndicator()}
              <ScrollArea className="flex-1">
                <div className="p-4 pb-6">
                  {renderStepContent(STEPS[currentStep].key)}
                </div>
              </ScrollArea>
              {renderMobileFooter()}
            </>
          ) : (
            <>
              <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setCurrentStep(STEPS.findIndex(s => s.key === v)); }} className="w-full">
                <div className="px-6">
                  <TabsList className="grid w-full grid-cols-7">
                    {STEPS.map(s => (
                      <TabsTrigger key={s.key} value={s.key}>{s.label}</TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                <ScrollArea className="h-[60vh] px-6">
                  {STEPS.map(s => (
                    <TabsContent key={s.key} value={s.key} className="mt-4">
                      {renderStepContent(s.key)}
                    </TabsContent>
                  ))}
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
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
