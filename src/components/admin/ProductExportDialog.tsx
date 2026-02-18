import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

// ─── types ───────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  base_price: number;
  sale_price: number | null;
  sku: string | null;
  category_id: string | null;
  is_active: boolean;
  is_featured: boolean;
  is_new: boolean;
  cost?: number | null;
  weight: number | null;
  width: number | null;
  height: number | null;
  depth: number | null;
  gtin: string | null;
  mpn: string | null;
  brand: string | null;
  condition: string | null;
  google_product_category: string | null;
  age_group: string | null;
  gender: string | null;
  material: string | null;
  pattern: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  created_at: string;
  updated_at: string;
  bling_product_id: number | null;
  bling_sync_status: string | null;
  bling_last_synced_at: string | null;
  bling_last_error: string | null;
  video_url?: string | null;
  category?: { id: string; name: string } | null;
  images?: { id: string; url: string; alt_text: string | null; display_order: number; is_primary: boolean; media_type: string }[];
  variants?: { id: string; size: string; color: string | null; color_hex: string | null; sku: string | null; stock_quantity: number; price_modifier: number | null; is_active: boolean; bling_variant_id: number | null; base_price?: number | null; sale_price?: number | null }[];
}

interface ProductExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  selectedCount: number;
  mode: 'all' | 'selected';
}

// ─── column groups ───────────────────────────────────────────────────────────
const COLUMN_GROUPS = {
  basico: {
    label: 'Básico',
    columns: ['id', 'sku', 'nome', 'slug', 'status', 'destaque', 'novidade', 'categoria', 'marca', 'created_at', 'updated_at'],
  },
  precos: {
    label: 'Preços',
    columns: ['preco_base', 'preco_promocional', 'custo', 'em_promocao'],
  },
  estoque: {
    label: 'Estoque',
    columns: ['estoque_total', 'estoque_baixo'],
  },
  logistica: {
    label: 'Logística',
    columns: ['peso', 'largura', 'altura', 'comprimento', 'volume', 'gtin', 'mpn', 'condicao'],
  },
  seo: {
    label: 'SEO',
    columns: ['seo_title', 'seo_description', 'seo_keywords'],
  },
  bling: {
    label: 'Bling / Integração',
    columns: ['bling_product_id', 'bling_sync_status', 'bling_last_synced_at', 'bling_last_error'],
  },
  atributos: {
    label: 'Atributos',
    columns: ['material', 'padrao', 'genero', 'faixa_etaria', 'google_category', 'video_url'],
  },
  variantes: {
    label: 'Variantes (detalhado)',
    columns: ['variante_id', 'variante_sku', 'variante_tamanho', 'variante_cor', 'variante_cor_hex', 'variante_preco_base', 'variante_preco_promo', 'variante_estoque', 'variante_ativa', 'variante_bling_id'],
  },
  imagens: {
    label: 'Imagens',
    columns: ['imagem_principal', 'galeria_urls', 'imagem_alt_texts'],
  },
} as const;

type GroupKey = keyof typeof COLUMN_GROUPS;

const PRESETS: Record<string, { label: string; groups: GroupKey[] }> = {
  basico: { label: 'Básico', groups: ['basico', 'precos', 'estoque'] },
  completo: { label: 'Completo', groups: ['basico', 'precos', 'estoque', 'logistica', 'seo', 'bling', 'atributos', 'variantes', 'imagens'] },
  bling_estoque: { label: 'Bling / Estoque', groups: ['basico', 'estoque', 'bling', 'variantes'] },
  logistica: { label: 'Logística', groups: ['basico', 'logistica', 'estoque'] },
  seo: { label: 'SEO', groups: ['basico', 'seo'] },
};

// ─── component ───────────────────────────────────────────────────────────────
export function ProductExportDialog({ open, onOpenChange, products, selectedCount, mode }: ProductExportDialogProps) {
  const { toast } = useToast();
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const [exportMode, setExportMode] = useState<'produto' | 'variante'>('variante');
  const [selectedGroups, setSelectedGroups] = useState<Set<GroupKey>>(new Set(['basico', 'precos', 'estoque']));
  const [exporting, setExporting] = useState(false);

  const count = mode === 'selected' ? selectedCount : products.length;

  const toggleGroup = (g: GroupKey) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });
  };

  const applyPreset = (key: string) => {
    setSelectedGroups(new Set(PRESETS[key].groups));
  };

  const activeColumns = useMemo(() => {
    const cols: string[] = [];
    for (const g of selectedGroups) {
      cols.push(...COLUMN_GROUPS[g].columns);
    }
    return cols;
  }, [selectedGroups]);

  // ─── build row data ──────────────────────────────────────────────────────
  const buildProductRow = (p: Product, variant?: Product['variants'][0]) => {
    const row: Record<string, any> = {};
    const cols = new Set(activeColumns);

    // Básico
    if (cols.has('id')) row['ID'] = p.id;
    if (cols.has('sku')) row['SKU'] = p.sku || '';
    if (cols.has('nome')) row['Nome'] = p.name;
    if (cols.has('slug')) row['Slug'] = p.slug;
    if (cols.has('status')) row['Ativo'] = p.is_active ? 'Sim' : 'Não';
    if (cols.has('destaque')) row['Destaque'] = p.is_featured ? 'Sim' : 'Não';
    if (cols.has('novidade')) row['Novidade'] = p.is_new ? 'Sim' : 'Não';
    if (cols.has('categoria')) row['Categoria'] = p.category?.name || '';
    if (cols.has('marca')) row['Marca'] = p.brand || '';
    if (cols.has('created_at')) row['Criado em'] = p.created_at;
    if (cols.has('updated_at')) row['Atualizado em'] = p.updated_at;

    // Preços
    if (cols.has('preco_base')) row['Preço Base'] = p.base_price;
    if (cols.has('preco_promocional')) row['Preço Promocional'] = p.sale_price ?? '';
    if (cols.has('custo')) row['Custo'] = (p as any).cost ?? '';
    if (cols.has('em_promocao')) row['Em Promoção'] = (p.sale_price && p.sale_price < p.base_price) ? 'Sim' : 'Não';

    // Estoque
    const totalStock = p.variants?.filter(v => v.is_active).reduce((s, v) => s + v.stock_quantity, 0) ?? 0;
    if (cols.has('estoque_total')) row['Estoque Total'] = totalStock;
    if (cols.has('estoque_baixo')) row['Estoque Baixo'] = p.variants?.some(v => v.is_active && v.stock_quantity > 0 && v.stock_quantity < 5) ? 'Sim' : 'Não';

    // Logística
    if (cols.has('peso')) row['Peso (kg)'] = p.weight ?? '';
    if (cols.has('largura')) row['Largura (cm)'] = p.width ?? '';
    if (cols.has('altura')) row['Altura (cm)'] = p.height ?? '';
    if (cols.has('comprimento')) row['Comprimento (cm)'] = p.depth ?? '';
    if (cols.has('volume')) {
      const vol = (p.width && p.height && p.depth) ? (p.width * p.height * p.depth) : '';
      row['Volume (cm³)'] = vol;
    }
    if (cols.has('gtin')) row['GTIN/EAN'] = p.gtin || '';
    if (cols.has('mpn')) row['MPN'] = p.mpn || '';
    if (cols.has('condicao')) row['Condição'] = p.condition || '';

    // SEO
    if (cols.has('seo_title')) row['SEO Título'] = p.seo_title || '';
    if (cols.has('seo_description')) row['SEO Descrição'] = p.seo_description || '';
    if (cols.has('seo_keywords')) row['SEO Keywords'] = p.seo_keywords || '';

    // Bling
    if (cols.has('bling_product_id')) row['Bling ID'] = p.bling_product_id ?? '';
    if (cols.has('bling_sync_status')) row['Bling Status'] = p.bling_sync_status || '';
    if (cols.has('bling_last_synced_at')) row['Bling Último Sync'] = p.bling_last_synced_at || '';
    if (cols.has('bling_last_error')) row['Bling Último Erro'] = p.bling_last_error || '';

    // Atributos
    if (cols.has('material')) row['Material'] = p.material || '';
    if (cols.has('padrao')) row['Padrão'] = p.pattern || '';
    if (cols.has('genero')) row['Gênero'] = p.gender || '';
    if (cols.has('faixa_etaria')) row['Faixa Etária'] = p.age_group || '';
    if (cols.has('google_category')) row['Google Category'] = p.google_product_category || '';
    if (cols.has('video_url')) row['Vídeo URL'] = p.video_url || '';

    // Variantes (flatten)
    if (variant) {
      if (cols.has('variante_id')) row['Variante ID'] = variant.id;
      if (cols.has('variante_sku')) row['Variante SKU'] = variant.sku || '';
      if (cols.has('variante_tamanho')) row['Tamanho'] = variant.size;
      if (cols.has('variante_cor')) row['Cor'] = variant.color || '';
      if (cols.has('variante_cor_hex')) row['Cor Hex'] = variant.color_hex || '';
      if (cols.has('variante_preco_base')) row['Var. Preço Base'] = variant.base_price ?? '';
      if (cols.has('variante_preco_promo')) row['Var. Preço Promo'] = variant.sale_price ?? '';
      if (cols.has('variante_estoque')) row['Var. Estoque'] = variant.stock_quantity;
      if (cols.has('variante_ativa')) row['Var. Ativa'] = variant.is_active ? 'Sim' : 'Não';
      if (cols.has('variante_bling_id')) row['Var. Bling ID'] = variant.bling_variant_id ?? '';
    }

    // Imagens
    if (cols.has('imagem_principal')) {
      const primary = p.images?.find(i => i.is_primary) || p.images?.[0];
      row['Imagem Principal'] = primary?.url || '';
    }
    if (cols.has('galeria_urls')) {
      row['Galeria URLs'] = p.images?.sort((a, b) => a.display_order - b.display_order).map(i => i.url).join(' | ') || '';
    }
    if (cols.has('imagem_alt_texts')) {
      row['Alt Texts'] = p.images?.sort((a, b) => a.display_order - b.display_order).map(i => i.alt_text || '').join(' | ') || '';
    }

    return row;
  };

  // ─── export ──────────────────────────────────────────────────────────────
  const doExport = async () => {
    setExporting(true);
    try {
      const hasVariantCols = selectedGroups.has('variantes');

      // Build flat rows
      const mainRows: Record<string, any>[] = [];
      for (const p of products) {
        if (exportMode === 'variante' && hasVariantCols && p.variants && p.variants.length > 0) {
          for (const v of p.variants) {
            mainRows.push(buildProductRow(p, v));
          }
        } else {
          mainRows.push(buildProductRow(p));
        }
      }

      if (mainRows.length === 0) {
        toast({ title: 'Nenhum dado para exportar', variant: 'destructive' });
        setExporting(false);
        return;
      }

      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'xlsx') {
        const wb = XLSX.utils.book_new();

        // Main sheet
        const ws = XLSX.utils.json_to_sheet(mainRows);
        XLSX.utils.book_append_sheet(wb, ws, 'Produtos');

        // Separate variants sheet if in "produto" mode but variants group selected
        if (exportMode === 'produto' && hasVariantCols) {
          const variantRows: Record<string, any>[] = [];
          for (const p of products) {
            if (!p.variants) continue;
            for (const v of p.variants) {
              variantRows.push({
                'Produto ID': p.id,
                'Produto Nome': p.name,
                'Produto SKU': p.sku || '',
                'Variante ID': v.id,
                'SKU': v.sku || '',
                'Tamanho': v.size,
                'Cor': v.color || '',
                'Cor Hex': v.color_hex || '',
                'Estoque': v.stock_quantity,
                'Ativa': v.is_active ? 'Sim' : 'Não',
                'Bling Variant ID': v.bling_variant_id ?? '',
              });
            }
          }
          if (variantRows.length > 0) {
            const wsV = XLSX.utils.json_to_sheet(variantRows);
            XLSX.utils.book_append_sheet(wb, wsV, 'Variantes');
          }
        }

        // Images sheet
        if (selectedGroups.has('imagens')) {
          const imgRows: Record<string, any>[] = [];
          for (const p of products) {
            if (!p.images) continue;
            for (const img of p.images.sort((a, b) => a.display_order - b.display_order)) {
              imgRows.push({
                'Produto ID': p.id,
                'Produto Nome': p.name,
                'Imagem ID': img.id,
                'URL': img.url,
                'Alt Text': img.alt_text || '',
                'Ordem': img.display_order,
                'Principal': img.is_primary ? 'Sim' : 'Não',
                'Tipo': img.media_type || 'image',
              });
            }
          }
          if (imgRows.length > 0) {
            const wsI = XLSX.utils.json_to_sheet(imgRows);
            XLSX.utils.book_append_sheet(wb, wsI, 'Imagens');
          }
        }

        // Bling sheet
        if (selectedGroups.has('bling')) {
          const blingRows: Record<string, any>[] = [];
          for (const p of products) {
            if (!p.bling_product_id) continue;
            blingRows.push({
              'Produto ID': p.id,
              'Nome': p.name,
              'Bling ID': p.bling_product_id,
              'Status': p.bling_sync_status || '',
              'Último Sync': p.bling_last_synced_at || '',
              'Último Erro': p.bling_last_error || '',
            });
          }
          if (blingRows.length > 0) {
            const wsB = XLSX.utils.json_to_sheet(blingRows);
            XLSX.utils.book_append_sheet(wb, wsB, 'Bling');
          }
        }

        XLSX.writeFile(wb, `produtos-${dateStr}.xlsx`);
      } else {
        // CSV with ; separator
        if (mainRows.length === 0) return;
        const headers = Object.keys(mainRows[0]);
        const csvLines = [
          headers.join(';'),
          ...mainRows.map(row =>
            headers.map(h => {
              const val = row[h];
              if (val === null || val === undefined) return '';
              const str = String(val);
              if (str.includes(';') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
              }
              return str;
            }).join(';')
          ),
        ].join('\n');

        const blob = new Blob(['\ufeff' + csvLines], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `produtos-${dateStr}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }

      toast({ title: 'Exportação concluída!', description: `${mainRows.length} linhas exportadas.` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro na exportação', description: err.message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Exportar Produtos
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-5 py-2">
            {/* Count info */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{count} produto{count !== 1 ? 's' : ''}</Badge>
              <span>{mode === 'selected' ? 'selecionado(s)' : 'filtrado(s)'}</span>
            </div>

            {/* Format */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Formato</Label>
              <RadioGroup value={format} onValueChange={(v) => setFormat(v as 'csv' | 'xlsx')} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="csv" id="fmt-csv" />
                  <Label htmlFor="fmt-csv" className="flex items-center gap-1.5 cursor-pointer">
                    <FileText className="h-4 w-4" /> CSV (;)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="xlsx" id="fmt-xlsx" />
                  <Label htmlFor="fmt-xlsx" className="flex items-center gap-1.5 cursor-pointer">
                    <FileSpreadsheet className="h-4 w-4" /> Excel (XLSX)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Export mode */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Modo de exportação</Label>
              <RadioGroup value={exportMode} onValueChange={(v) => setExportMode(v as 'produto' | 'variante')} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="variante" id="mode-var" />
                  <Label htmlFor="mode-var" className="cursor-pointer text-sm">Por variante (1 linha/SKU)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="produto" id="mode-prod" />
                  <Label htmlFor="mode-prod" className="cursor-pointer text-sm">Por produto</Label>
                </div>
              </RadioGroup>
              {format === 'xlsx' && exportMode === 'produto' && (
                <p className="text-xs text-muted-foreground">No XLSX, variantes e imagens serão exportadas em abas separadas.</p>
              )}
            </div>

            <Separator />

            {/* Presets */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Predefinições</Label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(PRESETS).map(([key, preset]) => (
                  <Button key={key} variant="outline" size="sm" className="text-xs h-7" onClick={() => applyPreset(key)}>
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Column groups */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Grupos de colunas</Label>
              {(Object.entries(COLUMN_GROUPS) as [GroupKey, typeof COLUMN_GROUPS[GroupKey]][]).map(([key, group]) => (
                <div key={key} className="flex items-start gap-2">
                  <Checkbox
                    id={`grp-${key}`}
                    checked={selectedGroups.has(key)}
                    onCheckedChange={() => toggleGroup(key)}
                    className="mt-0.5"
                  />
                  <div>
                    <Label htmlFor={`grp-${key}`} className="cursor-pointer text-sm font-medium">{group.label}</Label>
                    <p className="text-xs text-muted-foreground">{group.columns.length} campos</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={doExport} disabled={exporting || selectedGroups.size === 0}>
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {exporting ? 'Exportando...' : 'Exportar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
