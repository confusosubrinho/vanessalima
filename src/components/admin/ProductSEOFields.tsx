import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Search, Eye, HelpCircle, Sparkles, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ProductData {
  name: string;
  description: string;
  base_price: string;
  sale_price: string;
  brand: string;
  category_name: string;
  material?: string;
}

interface SEOData {
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
}

interface ProductSEOFieldsProps {
  productData: ProductData;
  seoData: SEOData;
  onChange: (data: SEOData) => void;
}

const AVAILABLE_VARIABLES = [
  { key: '{{produto}}', description: 'Nome do produto', field: 'name' },
  { key: '{{descricao}}', description: 'Descrição do produto', field: 'description' },
  { key: '{{preco}}', description: 'Preço (promocional ou base)', field: 'price' },
  { key: '{{marca}}', description: 'Marca do produto', field: 'brand' },
  { key: '{{categoria}}', description: 'Categoria do produto', field: 'category_name' },
];

export function ProductSEOFields({ productData, seoData, onChange }: ProductSEOFieldsProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const processVariables = (text: string): string => {
    if (!text) return '';
    let result = text;
    const price = productData.sale_price || productData.base_price;
    const formattedPrice = price ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(price)) : '';
    result = result.replace(/\{\{produto\}\}/g, productData.name || '');
    result = result.replace(/\{\{descricao\}\}/g, (productData.description || '').substring(0, 160));
    result = result.replace(/\{\{preco\}\}/g, formattedPrice);
    result = result.replace(/\{\{marca\}\}/g, productData.brand || '');
    result = result.replace(/\{\{categoria\}\}/g, productData.category_name || '');
    return result;
  };

  const getDefaultTitle = () => {
    if (productData.brand) {
      return `${productData.name} - ${productData.brand} | Compre Online`;
    }
    return productData.name ? `${productData.name} | Compre Online` : 'Título do Produto';
  };

  const getDefaultDescription = () => {
    if (productData.name) {
      const price = productData.sale_price || productData.base_price;
      const formattedPrice = price ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(price)) : '';
      const parts = [
        `Compre ${productData.name}`,
        productData.brand ? `da ${productData.brand}` : '',
        formattedPrice ? `por ${formattedPrice}` : '',
        '✓ Frete Grátis acima de R$399 ✓ Parcelamento ✓ Troca Grátis',
      ].filter(Boolean);
      return parts.join(' ').substring(0, 155);
    }
    if (productData.description) {
      return productData.description.substring(0, 155) + (productData.description.length > 155 ? '...' : '');
    }
    return 'Descrição do produto';
  };

  const previewTitle = useMemo(() => {
    if (seoData.seo_title) return processVariables(seoData.seo_title);
    return getDefaultTitle();
  }, [seoData.seo_title, productData]);

  const previewDescription = useMemo(() => {
    if (seoData.seo_description) return processVariables(seoData.seo_description);
    return getDefaultDescription();
  }, [seoData.seo_description, productData]);

  const insertVariable = (field: 'seo_title' | 'seo_description' | 'seo_keywords', variable: string) => {
    onChange({
      ...seoData,
      [field]: (seoData[field] || '') + variable,
    });
  };

  const generateWithAI = async () => {
    if (!productData.name) {
      toast({ title: 'Preencha o nome do produto primeiro', variant: 'destructive' });
      return;
    }
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-seo', {
        body: {
          name: productData.name,
          description: productData.description,
          category: productData.category_name,
          brand: productData.brand,
          material: productData.material || '',
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      onChange({
        seo_title: data.seo_title || seoData.seo_title,
        seo_description: data.seo_description || seoData.seo_description,
        seo_keywords: data.seo_keywords || seoData.seo_keywords,
      });
      toast({ title: 'SEO gerado com IA! ✨' });
    } catch (err: any) {
      toast({ title: 'Erro ao gerar SEO', description: err.message, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-between w-full p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            <span className="font-medium">SEO - Otimização para Buscadores</span>
            {!seoData.seo_title && !seoData.seo_description && (
              <Badge variant="secondary" className="text-xs">Usando padrão</Badge>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="space-y-4 pt-4">
        {/* AI Generate Button */}
        <Button
          type="button"
          variant="outline"
          onClick={generateWithAI}
          disabled={isGenerating || !productData.name}
          className="w-full border-primary/30 hover:bg-primary/5"
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2 text-primary" />
          )}
          {isGenerating ? 'Gerando com IA...' : 'Gerar SEO com IA ✨'}
        </Button>

        {/* Google Preview */}
        <div className="border rounded-lg p-4 bg-background">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Prévia no Google</span>
          </div>
          <div className="space-y-1">
            <p className="text-[#1a0dab] text-lg hover:underline cursor-pointer truncate">{previewTitle}</p>
            <p className="text-[#006621] text-sm">vanessalima.lovable.app › produto</p>
            <p className="text-sm text-[#545454] line-clamp-2">{previewDescription}</p>
          </div>
        </div>

        {/* Variables helper */}
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Variáveis disponíveis</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <TooltipProvider>
              {AVAILABLE_VARIABLES.map((v) => (
                <Tooltip key={v.key}>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="cursor-help hover:bg-muted">{v.key}</Badge>
                  </TooltipTrigger>
                  <TooltipContent><p>{v.description}</p></TooltipContent>
                </Tooltip>
              ))}
            </TooltipProvider>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Use as variáveis acima para preencher automaticamente com dados do produto</p>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Título SEO</Label>
            <span className={`text-xs ${(previewTitle?.length || 0) > 60 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {previewTitle?.length || 0}/60
            </span>
          </div>
          <Input
            value={seoData.seo_title}
            onChange={(e) => onChange({ ...seoData, seo_title: e.target.value })}
            placeholder={getDefaultTitle()}
          />
          <div className="flex gap-1 flex-wrap">
            {AVAILABLE_VARIABLES.map((v) => (
              <Badge
                key={v.key}
                variant="outline"
                className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-xs"
                onClick={() => insertVariable('seo_title', v.key)}
              >
                + {v.key}
              </Badge>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Descrição SEO</Label>
            <span className={`text-xs ${(previewDescription?.length || 0) > 160 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {previewDescription?.length || 0}/160
            </span>
          </div>
          <Textarea
            value={seoData.seo_description}
            onChange={(e) => onChange({ ...seoData, seo_description: e.target.value })}
            placeholder={getDefaultDescription()}
            rows={3}
          />
          <div className="flex gap-1 flex-wrap">
            {AVAILABLE_VARIABLES.map((v) => (
              <Badge
                key={v.key}
                variant="outline"
                className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-xs"
                onClick={() => insertVariable('seo_description', v.key)}
              >
                + {v.key}
              </Badge>
            ))}
          </div>
        </div>

        {/* Keywords */}
        <div className="space-y-2">
          <Label>Palavras-chave</Label>
          <Input
            value={seoData.seo_keywords}
            onChange={(e) => onChange({ ...seoData, seo_keywords: e.target.value })}
            placeholder="sapato feminino, salto alto, couro legítimo"
          />
          <p className="text-xs text-muted-foreground">Separe as palavras-chave por vírgula. Também aceita variáveis.</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
