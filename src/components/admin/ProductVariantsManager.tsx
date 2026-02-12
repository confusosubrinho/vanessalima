import { useState } from 'react';
import { Plus, Trash2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

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
  // Advanced fields
  weight?: string;
  width?: string;
  height?: string;
  depth?: string;
  base_price?: string;
  sale_price?: string;
}

interface ProductVariantsManagerProps {
  variants: VariantItem[];
  onChange: (variants: VariantItem[]) => void;
  productId?: string;
  parentSku?: string;
  parentWeight?: string;
  parentWidth?: string;
  parentHeight?: string;
  parentDepth?: string;
  parentBasePrice?: string;
  parentSalePrice?: string;
  productImages?: { id: string; url: string; alt_text: string | null; is_primary: boolean }[];
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

function generateSku(parentSku: string, size: string, color: string): string {
  const base = parentSku || 'SKU';
  const sizePart = size.replace(/\s+/g, '').toUpperCase();
  const colorPart = color ? color.substring(0, 3).toUpperCase() : '';
  return colorPart ? `${base}-${sizePart}-${colorPart}` : `${base}-${sizePart}`;
}

export function ProductVariantsManager({
  variants,
  onChange,
  productId,
  parentSku = '',
  parentWeight = '',
  parentWidth = '',
  parentHeight = '',
  parentDepth = '',
  parentBasePrice = '',
  parentSalePrice = '',
  productImages = [],
}: ProductVariantsManagerProps) {
  const { toast } = useToast();
  const [bulkSizes, setBulkSizes] = useState('');
  const [bulkColor, setBulkColor] = useState('');
  const [bulkColorHex, setBulkColorHex] = useState('');
  const [bulkStock, setBulkStock] = useState('10');
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const checkDuplicateSku = (sku: string, excludeIndex?: number): boolean => {
    return variants.some((v, i) => i !== excludeIndex && v.sku === sku && sku !== '');
  };

  const checkDuplicateVariant = (size: string, color: string | null, excludeIndex?: number): boolean => {
    return variants.some((v, i) => 
      i !== excludeIndex && v.size === size && (v.color || '') === (color || '')
    );
  };

  const addVariant = () => {
    const newVariant: VariantItem = {
      size: '',
      color: '',
      color_hex: '',
      stock_quantity: 0,
      price_modifier: 0,
      sku: '',
      is_active: true,
      weight: parentWeight,
      width: parentWidth,
      height: parentHeight,
      depth: parentDepth,
      base_price: parentBasePrice,
      sale_price: parentSalePrice,
    };
    onChange([...variants, newVariant]);
    setEditIndex(variants.length);
  };

  const removeVariant = (index: number) => {
    onChange(variants.filter((_, i) => i !== index));
  };

  const updateVariant = (index: number, field: keyof VariantItem, value: any) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };

    // Validate duplicate variant by size+color
    if (field === 'size' || field === 'color') {
      const size = field === 'size' ? value : updated[index].size;
      const color = field === 'color' ? value : updated[index].color;
      
      if (size && checkDuplicateVariant(size, color || '', index)) {
        toast({
          title: 'Variante duplicada!',
          description: `Já existe uma variante ${size}${color ? ' - ' + color : ''}`,
          variant: 'destructive',
        });
        return;
      }

      if (size) {
        updated[index].sku = generateSku(parentSku, size, color);
      }
    }

    // Prevent negative stock
    if (field === 'stock_quantity' && value < 0) {
      toast({ title: 'Estoque inválido', description: 'Estoque não pode ser negativo', variant: 'destructive' });
      return;
    }

    onChange(updated);
  };

  const handleColorSelect = (index: number, colorName: string) => {
    const color = COMMON_COLORS.find(c => c.name === colorName);
    if (color) {
      const updated = [...variants];
      updated[index] = {
        ...updated[index],
        color: color.name,
        color_hex: color.hex,
        sku: generateSku(parentSku, updated[index].size, color.name),
      };
      onChange(updated);
    }
  };

  const handleBulkAdd = () => {
    if (!bulkSizes.trim()) return;
    const sizes = bulkSizes.split(',').map(s => s.trim()).filter(Boolean);
    const newVariants: VariantItem[] = sizes.map(size => {
      const sku = generateSku(parentSku, size, bulkColor);
      return {
        size,
        color: bulkColor,
        color_hex: bulkColorHex,
        stock_quantity: parseInt(bulkStock) || 0,
        price_modifier: 0,
        sku,
        is_active: true,
        weight: parentWeight,
        width: parentWidth,
        height: parentHeight,
        depth: parentDepth,
        base_price: parentBasePrice,
        sale_price: parentSalePrice,
      };
    });

    // Check for duplicates
    const allSkus = [...variants.map(v => v.sku), ...newVariants.map(v => v.sku)];
    const duplicates = allSkus.filter((s, i) => s && allSkus.indexOf(s) !== i);
    if (duplicates.length > 0) {
      toast({ title: 'SKUs duplicados detectados', description: `SKUs: ${duplicates.join(', ')}`, variant: 'destructive' });
      return;
    }

    onChange([...variants, ...newVariants]);
    setBulkSizes('');
  };

  const editingVariant = editIndex !== null ? variants[editIndex] : null;

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
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_70px_80px_auto_36px] gap-2 text-xs font-medium text-muted-foreground px-1">
            <span>Tamanho</span>
            <span>Cor</span>
            <span>Estoque</span>
            <span>SKU</span>
            <span>Imagem</span>
            <span></span>
          </div>
          {variants.map((variant, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_70px_80px_auto_36px] gap-2 items-center p-2 border rounded-lg">
              <div className="text-sm font-medium">{variant.size || '—'}</div>
              <div className="flex items-center gap-1.5 text-sm">
                {variant.color_hex && (
                  <span className="w-4 h-4 rounded-full border flex-shrink-0" style={{ backgroundColor: variant.color_hex }} />
                )}
                <span className="truncate">{variant.color || '—'}</span>
              </div>
              <span className="text-sm text-center">{variant.stock_quantity}</span>
              <span className={`text-xs truncate ${checkDuplicateSku(variant.sku, index) ? 'text-destructive font-bold' : ''}`}>
                {variant.sku || '—'}
              </span>
              <div className="flex items-center gap-1">
                {variant.image_url ? (
                  <img src={variant.image_url} alt="" className="w-8 h-8 rounded object-cover border" />
                ) : variant.color_hex ? (
                  <span className="w-8 h-8 rounded border flex items-center justify-center" style={{ backgroundColor: variant.color_hex }} />
                ) : (
                  <span className="w-8 h-8 rounded border bg-muted" />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setEditIndex(index)}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
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

      {/* Advanced Edit Dialog */}
      <Dialog open={editIndex !== null} onOpenChange={(open) => { if (!open) setEditIndex(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Variante {editingVariant ? `— ${editingVariant.size} ${editingVariant.color}` : ''}</DialogTitle>
          </DialogHeader>
          {editingVariant && editIndex !== null && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Tamanho *</Label>
                  <Select value={editingVariant.size} onValueChange={(val) => updateVariant(editIndex, 'size', val)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Tam." />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_SIZES.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Cor</Label>
                  <Select value={editingVariant.color || ''} onValueChange={(val) => handleColorSelect(editIndex, val)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Cor" />
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">SKU (auto)</Label>
                  <Input
                    className="h-9 text-sm"
                    value={editingVariant.sku}
                    onChange={(e) => updateVariant(editIndex, 'sku', e.target.value)}
                  />
                  {checkDuplicateSku(editingVariant.sku, editIndex) && (
                    <p className="text-xs text-destructive mt-1">SKU duplicado!</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Estoque *</Label>
                  <Input
                    type="number"
                    className="h-9 text-sm"
                    value={editingVariant.stock_quantity}
                    onChange={(e) => updateVariant(editIndex, 'stock_quantity', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Preço Original (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-9 text-sm"
                    value={editingVariant.base_price ?? ''}
                    onChange={(e) => updateVariant(editIndex, 'base_price', e.target.value)}
                    placeholder={parentBasePrice || '0.00'}
                  />
                </div>
                <div>
                  <Label className="text-xs">Preço Promocional (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-9 text-sm"
                    value={editingVariant.sale_price ?? ''}
                    onChange={(e) => updateVariant(editIndex, 'sale_price', e.target.value)}
                    placeholder={parentSalePrice || 'Sem promoção'}
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Peso (kg)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-9 text-sm"
                    value={editingVariant.weight ?? ''}
                    onChange={(e) => updateVariant(editIndex, 'weight', e.target.value)}
                    placeholder={parentWeight || '0'}
                  />
                </div>
                <div>
                  <Label className="text-xs">Largura (cm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    className="h-9 text-sm"
                    value={editingVariant.width ?? ''}
                    onChange={(e) => updateVariant(editIndex, 'width', e.target.value)}
                    placeholder={parentWidth || '0'}
                  />
                </div>
                <div>
                  <Label className="text-xs">Altura (cm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    className="h-9 text-sm"
                    value={editingVariant.height ?? ''}
                    onChange={(e) => updateVariant(editIndex, 'height', e.target.value)}
                    placeholder={parentHeight || '0'}
                  />
                </div>
                <div>
                  <Label className="text-xs">Profund. (cm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    className="h-9 text-sm"
                    value={editingVariant.depth ?? ''}
                    onChange={(e) => updateVariant(editIndex, 'depth', e.target.value)}
                    placeholder={parentDepth || '0'}
                  />
                </div>
              </div>

              {/* Image from product images */}
              <div>
                <Label className="text-xs">Imagem da Variante (selecione uma imagem do produto)</Label>
                {productImages.length > 0 ? (
                  <div className="grid grid-cols-5 gap-2 mt-2">
                    {productImages.map((img) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => updateVariant(editIndex, 'image_url', img.url)}
                        className={`aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                          editingVariant.image_url === img.url ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <img src={img.url} alt={img.alt_text || ''} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Envie imagens na aba Mídia primeiro</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={editingVariant.is_active}
                  onCheckedChange={(checked) => updateVariant(editIndex, 'is_active', checked)}
                />
                <Label className="text-sm">Variante ativa</Label>
              </div>

              <div className="flex justify-end">
                <Button type="button" onClick={() => setEditIndex(null)}>Fechar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
