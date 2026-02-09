import { useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';

export interface VariantItem {
  id?: string;
  size: string;
  color: string;
  color_hex: string;
  stock_quantity: number;
  price_modifier: number;
  sku: string;
  is_active: boolean;
  image_url?: string;
}

interface ProductVariantsManagerProps {
  variants: VariantItem[];
  onChange: (variants: VariantItem[]) => void;
  productId?: string;
}

const COMMON_SIZES = ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', 'PP', 'P', 'M', 'G', 'GG', 'XG', 'Único'];
const COMMON_COLORS = [
  { name: 'Preto', hex: '#000000' },
  { name: 'Branco', hex: '#FFFFFF' },
  { name: 'Vermelho', hex: '#EF4444' },
  { name: 'Azul', hex: '#3B82F6' },
  { name: 'Rosa', hex: '#EC4899' },
  { name: 'Nude', hex: '#D4A574' },
  { name: 'Caramelo', hex: '#C68642' },
  { name: 'Marrom', hex: '#8B4513' },
  { name: 'Dourado', hex: '#FFD700' },
  { name: 'Prata', hex: '#C0C0C0' },
  { name: 'Verde', hex: '#22C55E' },
  { name: 'Bege', hex: '#F5F5DC' },
];

const emptyVariant: VariantItem = {
  size: '',
  color: '',
  color_hex: '',
  stock_quantity: 0,
  price_modifier: 0,
  sku: '',
  is_active: true,
};

export function ProductVariantsManager({ variants, onChange, productId }: ProductVariantsManagerProps) {
  const [bulkSizes, setBulkSizes] = useState('');
  const [bulkColor, setBulkColor] = useState('');
  const [bulkColorHex, setBulkColorHex] = useState('');
  const [bulkStock, setBulkStock] = useState('10');

  const addVariant = () => {
    onChange([...variants, { ...emptyVariant }]);
  };

  const removeVariant = (index: number) => {
    onChange(variants.filter((_, i) => i !== index));
  };

  const updateVariant = (index: number, field: keyof VariantItem, value: any) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const handleColorSelect = (index: number, colorName: string) => {
    const color = COMMON_COLORS.find(c => c.name === colorName);
    if (color) {
      const updated = [...variants];
      updated[index] = { ...updated[index], color: color.name, color_hex: color.hex };
      onChange(updated);
    }
  };

  const handleBulkAdd = () => {
    if (!bulkSizes.trim()) return;
    const sizes = bulkSizes.split(',').map(s => s.trim()).filter(Boolean);
    const newVariants: VariantItem[] = sizes.map(size => ({
      ...emptyVariant,
      size,
      color: bulkColor,
      color_hex: bulkColorHex,
      stock_quantity: parseInt(bulkStock) || 0,
    }));
    onChange([...variants, ...newVariants]);
    setBulkSizes('');
  };

  const handleImageUpload = async (index: number, file: File) => {
    if (!productId) return;
    const fileExt = file.name.split('.').pop();
    const fileName = `${productId}/variant-${Date.now()}.${fileExt}`;
    const { error } = await supabase.storage
      .from('product-media')
      .upload(fileName, file);

    if (error) return;
    const { data: urlData } = supabase.storage
      .from('product-media')
      .getPublicUrl(fileName);

    updateVariant(index, 'image_url', urlData.publicUrl);
  };

  return (
    <div className="space-y-6">
      {/* Bulk Add */}
      <div className="p-4 border rounded-lg bg-muted/30">
        <h4 className="font-medium mb-3">Adicionar variantes em lote</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Tamanhos (separados por vírgula)</Label>
            <Input
              value={bulkSizes}
              onChange={(e) => setBulkSizes(e.target.value)}
              placeholder="34, 35, 36, 37, 38"
            />
          </div>
          <div>
            <Label className="text-xs">Cor</Label>
            <Select value={bulkColor} onValueChange={(val) => {
              setBulkColor(val);
              const c = COMMON_COLORS.find(c => c.name === val);
              if (c) setBulkColorHex(c.hex);
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Opcional" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_COLORS.map(c => (
                  <SelectItem key={c.name} value={c.name}>
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: c.hex }} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Estoque por variante</Label>
            <Input
              type="number"
              value={bulkStock}
              onChange={(e) => setBulkStock(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={handleBulkAdd} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>
        </div>
      </div>

      {/* Variants List */}
      {variants.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_1fr_80px_80px_80px_auto_36px] gap-2 text-xs font-medium text-muted-foreground px-1">
            <span>Tamanho</span>
            <span>Cor</span>
            <span>Estoque</span>
            <span>Preço +/-</span>
            <span>SKU</span>
            <span>Imagem</span>
            <span></span>
          </div>
          {variants.map((variant, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_80px_80px_80px_auto_36px] gap-2 items-center p-2 border rounded-lg">
              <Select value={variant.size} onValueChange={(val) => updateVariant(index, 'size', val)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Tam." />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_SIZES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1">
                <Select value={variant.color || ''} onValueChange={(val) => handleColorSelect(index, val)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Cor">
                      {variant.color && (
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: variant.color_hex || '#000' }} />
                          <span className="truncate">{variant.color}</span>
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_COLORS.map(c => (
                      <SelectItem key={c.name} value={c.name}>
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: c.hex }} />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Input
                type="number"
                className="h-8 text-xs"
                value={variant.stock_quantity}
                onChange={(e) => updateVariant(index, 'stock_quantity', parseInt(e.target.value) || 0)}
              />

              <Input
                type="number"
                step="0.01"
                className="h-8 text-xs"
                value={variant.price_modifier}
                onChange={(e) => updateVariant(index, 'price_modifier', parseFloat(e.target.value) || 0)}
              />

              <Input
                className="h-8 text-xs"
                value={variant.sku}
                onChange={(e) => updateVariant(index, 'sku', e.target.value)}
                placeholder="SKU"
              />

              <div className="flex items-center gap-1">
                {variant.image_url ? (
                  <img src={variant.image_url} alt="" className="w-8 h-8 rounded object-cover border" />
                ) : (
                  <label className="w-8 h-8 border rounded flex items-center justify-center cursor-pointer hover:bg-muted">
                    <Upload className="h-3 w-3 text-muted-foreground" />
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(index, file);
                      }}
                    />
                  </label>
                )}
                {variant.color_hex && (
                  <input
                    type="color"
                    value={variant.color_hex}
                    onChange={(e) => updateVariant(index, 'color_hex', e.target.value)}
                    className="w-8 h-8 p-0 border-0 cursor-pointer"
                  />
                )}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => removeVariant(index)}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" onClick={addVariant} className="w-full">
        <Plus className="h-4 w-4 mr-2" /> Adicionar variante individual
      </Button>
    </div>
  );
}
