import { useState, useRef, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, Search, MoreHorizontal, Pencil, ArrowUpDown, Download, Upload, PackageX, EyeOff, CheckCircle, Store, ChevronDown, RefreshCw, Power, PowerOff, Edit3, X, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { exportToCSV, parseCSV, readFileAsText } from '@/lib/csv';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { ProductFormDialog } from '@/components/admin/ProductFormDialog';
import { BulkEditDialog } from '@/components/admin/BulkEditDialog';
import { useCategories } from '@/hooks/useProducts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { HelpHint } from '@/components/HelpHint';

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
  category?: { id: string; name: string } | null;
  images?: { id: string; url: string; alt_text: string | null; display_order: number; is_primary: boolean; media_type: string }[];
  variants?: { id: string; size: string; color: string | null; color_hex: string | null; sku: string | null; stock_quantity: number; price_modifier: number | null; is_active: boolean; bling_variant_id: number | null }[];
}

export default function Products() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { data: categories } = useCategories();
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [sortBy, setSortBy] = useState<string>('newest');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('active-stock');
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const ITEMS_PER_PAGE = 25;

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllGlobal, setSelectAllGlobal] = useState(false);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [syncingProductId, setSyncingProductId] = useState<string | null>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          category:categories(*),
          images:product_images(*),
          variants:product_variants(id, size, color, color_hex, sku, stock_quantity, price_modifier, is_active, bling_variant_id)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Product[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast({ title: 'Produto excluído!' });
    },
  });

  // Bulk mutations
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, updates, changeType, fields }: { ids: string[]; updates: Record<string, any>; changeType: string; fields: string[] }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const bulkEditId = crypto.randomUUID();

      // Get before data for audit
      const { data: beforeProducts } = await supabase
        .from('products')
        .select('*')
        .in('id', ids);

      // Apply update
      const { error } = await supabase
        .from('products')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;

      // Write change logs
      if (beforeProducts) {
        const logs = beforeProducts.map((bp: any) => {
          const afterData: Record<string, any> = {};
          const beforeData: Record<string, any> = {};
          fields.forEach(f => {
            beforeData[f] = bp[f];
            afterData[f] = updates[f];
          });
          return {
            product_id: bp.id,
            changed_by: user?.id || null,
            change_type: changeType,
            bulk_edit_id: bulkEditId,
            fields_changed: fields,
            before_data: beforeData,
            after_data: afterData,
          };
        });
        await supabase.from('product_change_log' as any).insert(logs);
      }

      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      setSelectedIds(new Set());
      setSelectAllGlobal(false);
      toast({ title: `${count} produto${count !== 1 ? 's' : ''} atualizado${count !== 1 ? 's' : ''}!` });
    },
    onError: (err: any) => {
      toast({ title: 'Erro na atualização', description: err.message, variant: 'destructive' });
    },
  });

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setIsDialogOpen(true);
  };

  const handleNewProduct = () => {
    setEditingProduct(null);
    setIsDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) setEditingProduct(null);
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

  const isOutOfStock = (p: Product) => {
    if (!p.variants || p.variants.length === 0) return false;
    const active = p.variants.filter(v => v.is_active);
    if (active.length === 0) return true;
    return active.every(v => v.stock_quantity <= 0);
  };

  const hasStock = (p: Product) => {
    if (!p.variants || p.variants.length === 0) return false;
    return p.variants.some(v => v.is_active && v.stock_quantity > 0);
  };

  const getTotalStock = (p: Product): number => {
    if (!p.variants) return 0;
    return p.variants.filter(v => v.is_active).reduce((sum, v) => sum + v.stock_quantity, 0);
  };

  const hasLowStock = (p: Product): boolean => {
    if (!p.variants) return false;
    return p.variants.some(v => v.is_active && v.stock_quantity > 0 && v.stock_quantity < 5);
  };

  const tabCounts = useMemo(() => {
    const all = products || [];
    return {
      all: all.length,
      activeStock: all.filter(p => p.is_active && hasStock(p)).length,
      outOfStock: all.filter(isOutOfStock).length,
      inactive: all.filter(p => !p.is_active).length,
    };
  }, [products]);

  // Filtering
  let filteredProducts = products?.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  ) || [];

  if (activeTab === 'active-stock') filteredProducts = filteredProducts.filter(p => p.is_active && hasStock(p));
  else if (activeTab === 'out-of-stock') filteredProducts = filteredProducts.filter(isOutOfStock);
  else if (activeTab === 'inactive') filteredProducts = filteredProducts.filter(p => !p.is_active);

  if (categoryFilter !== 'all') filteredProducts = filteredProducts.filter(p => p.category_id === categoryFilter);

  if (statusFilter === 'active') filteredProducts = filteredProducts.filter(p => p.is_active);
  else if (statusFilter === 'inactive') filteredProducts = filteredProducts.filter(p => !p.is_active);
  else if (statusFilter === 'featured') filteredProducts = filteredProducts.filter(p => p.is_featured);
  else if (statusFilter === 'new') filteredProducts = filteredProducts.filter(p => p.is_new);
  else if (statusFilter === 'sale') filteredProducts = filteredProducts.filter(p => p.sale_price && p.sale_price < p.base_price);

  if (sourceFilter === 'bling') filteredProducts = filteredProducts.filter(p => p.bling_product_id != null);
  else if (sourceFilter === 'manual') filteredProducts = filteredProducts.filter(p => p.bling_product_id == null);

  switch (sortBy) {
    case 'oldest': filteredProducts.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
    case 'price-asc': filteredProducts.sort((a, b) => Number(a.sale_price || a.base_price) - Number(b.sale_price || b.base_price)); break;
    case 'price-desc': filteredProducts.sort((a, b) => Number(b.sale_price || b.base_price) - Number(a.sale_price || a.base_price)); break;
    case 'name-asc': filteredProducts.sort((a, b) => a.name.localeCompare(b.name)); break;
    case 'name-desc': filteredProducts.sort((a, b) => b.name.localeCompare(a.name)); break;
    default: filteredProducts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const clearFilters = () => {
    setSortBy('newest'); setCategoryFilter('all'); setStatusFilter('all'); setSourceFilter('all');
    setActiveTab('active-stock'); setSearchQuery(''); setCurrentPage(1);
  };

  const hasActiveFilters = categoryFilter !== 'all' || statusFilter !== 'all' || sourceFilter !== 'all' || activeTab !== 'active-stock';

  // Selection logic
  const getEffectiveIds = useCallback(() => {
    if (selectAllGlobal) return filteredProducts.map(p => p.id);
    return Array.from(selectedIds);
  }, [selectAllGlobal, selectedIds, filteredProducts]);

  const effectiveCount = selectAllGlobal ? filteredProducts.length : selectedIds.size;

  const allPageSelected = paginatedProducts.length > 0 && paginatedProducts.every(p => selectedIds.has(p.id) || selectAllGlobal);

  const toggleSelectAll = () => {
    if (allPageSelected && !selectAllGlobal) {
      const next = new Set(selectedIds);
      paginatedProducts.forEach(p => next.delete(p.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      paginatedProducts.forEach(p => next.add(p.id));
      setSelectedIds(next);
    }
    setSelectAllGlobal(false);
  };

  const toggleSelect = (id: string) => {
    setSelectAllGlobal(false);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectAllGlobal(false);
  };

  // Bulk action handlers
  const handleBulkActivate = () => {
    const ids = getEffectiveIds();
    bulkUpdateMutation.mutate({ ids, updates: { is_active: true }, changeType: 'activate', fields: ['is_active'] });
  };

  const handleBulkDeactivate = () => {
    const ids = getEffectiveIds();
    bulkUpdateMutation.mutate({ ids, updates: { is_active: false }, changeType: 'deactivate', fields: ['is_active'] });
  };

  const handleBulkEdit = (changes: Record<string, any>, fields: string[]) => {
    const ids = getEffectiveIds();
    bulkUpdateMutation.mutate({ ids, updates: changes, changeType: 'bulk_update', fields });
    setIsBulkEditOpen(false);
  };

  const handleBulkSyncBling = async () => {
    const ids = getEffectiveIds().filter(id => {
      const p = products?.find(pr => pr.id === id);
      return p?.bling_product_id != null;
    });
    if (ids.length === 0) {
      toast({ title: 'Nenhum produto Bling selecionado', variant: 'destructive' });
      return;
    }
    bulkUpdateMutation.mutate({
      ids,
      updates: { bling_sync_status: 'pending', bling_last_error: null },
      changeType: 'update',
      fields: ['bling_sync_status'],
    });
    toast({ title: `${ids.length} produtos marcados para sincronização` });
  };

  // Single product stock sync
  const handleSyncSingleStock = async (product: Product) => {
    if (syncingProductId) return;
    if (!product.is_active) {
      toast({ title: 'Produto inativo', description: 'Produtos inativos não podem ser sincronizados.', variant: 'destructive' });
      return;
    }
    setSyncingProductId(product.id);
    try {
      const { data, error } = await supabase.functions.invoke('bling-sync-single-stock', {
        body: { product_id: product.id },
      });
      if (error) throw new Error(error.message || 'Erro na sincronização');
      if (data && !data.success) throw new Error(data.message || 'Erro na sincronização');
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast({ title: 'Estoque sincronizado!', description: `${data.updated_variants} variante(s) atualizada(s)` });
    } catch (err: any) {
      toast({ title: 'Erro ao sincronizar', description: err.message, variant: 'destructive' });
    } finally {
      setSyncingProductId(null);
    }
  };

  // Bling sync badge renderer
  const renderBlingSyncBadge = (product: Product) => {
    if (!product.bling_product_id) return null;
    const status = product.bling_sync_status || 'pending';
    if (status === 'synced') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400 gap-1 text-[10px]">
                <CheckCircle className="h-3 w-3" /> Sync
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {product.bling_last_synced_at
                ? `Sincronizado em ${format(new Date(product.bling_last_synced_at), "dd/MM/yy HH:mm", { locale: ptBR })}`
                : 'Sincronizado'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    if (status === 'error') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="destructive" className="gap-1 text-[10px]">
                <AlertCircle className="h-3 w-3" /> Erro
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{product.bling_last_error || 'Erro na sincronização'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return (
      <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:text-yellow-400 gap-1 text-[10px]">
        <Clock className="h-3 w-3" /> Pendente
      </Badge>
    );
  };

  // Last updated tooltip
  const renderUpdatedAt = (product: Product) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(product.updated_at), "dd/MM", { locale: ptBR })}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Última alteração: {format(new Date(product.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const importRef = useRef<HTMLInputElement>(null);
  const trayImportRef = useRef<HTMLInputElement>(null);
  const [trayImporting, setTrayImporting] = useState(false);

  const handleExport = () => {
    if (!products) return;
    const exportData = products.map(p => ({
      nome: p.name, slug: p.slug, sku: p.sku || '', preco_base: p.base_price,
      preco_promocional: p.sale_price || '', categoria: p.category?.name || '',
      ativo: p.is_active ? 'Sim' : 'Não', destaque: p.is_featured ? 'Sim' : 'Não',
      novo: p.is_new ? 'Sim' : 'Não', marca: p.brand || '', material: p.material || '',
    }));
    exportToCSV(exportData, 'produtos');
    toast({ title: 'Produtos exportados!' });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const rows = parseCSV(text);
      toast({ title: `${rows.length} linhas lidas do CSV`, description: 'Importação em desenvolvimento.' });
    } catch (err: any) {
      toast({ title: 'Erro na importação', description: err.message, variant: 'destructive' });
    }
    if (importRef.current) importRef.current.value = '';
  };

  const handleTrayImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTrayImporting(true);
    try {
      const text = await readFileAsText(file);
      toast({ title: 'Importação Tray iniciada...', description: 'Isso pode levar alguns minutos. Não feche a página.' });
      const response = await supabase.functions.invoke('tray-import', { body: { csvData: text } });
      if (response.error) throw new Error(response.error.message || 'Erro na importação');
      const result = response.data;
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast({
        title: `Importação Tray concluída!`,
        description: `${result.matched} encontrados, ${result.updated} atualizados, ${result.imagesUploaded} imagens enviadas.`,
      });
    } catch (err: any) {
      toast({ title: 'Erro na importação Tray', description: err.message, variant: 'destructive' });
    } finally {
      setTrayImporting(false);
      if (trayImportRef.current) trayImportRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold">Produtos</h1>
            <HelpHint helpKey="admin.products" />
          </div>
          <p className="text-sm text-muted-foreground hidden sm:block">Gerencie os produtos da sua loja</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {!isMobile && (
            <>
              <label>
                <input ref={trayImportRef} type="file" accept=".csv" className="hidden" onChange={handleTrayImport} />
                <Button variant="outline" size="sm" asChild disabled={trayImporting}>
                  <span><Store className="h-4 w-4 mr-2" />{trayImporting ? 'Importando...' : 'Importar Tray'}</span>
                </Button>
              </label>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />Exportar
              </Button>
              <label>
                <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
                <Button variant="outline" size="sm" asChild>
                  <span><Upload className="h-4 w-4 mr-2" />Importar</span>
                </Button>
              </label>
            </>
          )}
          {isMobile && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Store className="h-4 w-4" />Importar Tray
                    <input ref={trayImportRef} type="file" accept=".csv" className="hidden" onChange={handleTrayImport} />
                  </label>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExport}><Download className="h-4 w-4 mr-2" /> Exportar</DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Upload className="h-4 w-4" />Importar CSV
                    <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
                  </label>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button onClick={handleNewProduct} size={isMobile ? 'icon' : 'default'} className={isMobile ? 'h-9 w-9' : ''}>
            <Plus className="h-4 w-4" />
            {!isMobile && <span className="ml-2">Novo Produto</span>}
          </Button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {effectiveCount > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/50 flex-wrap">
          <Badge variant="secondary" className="text-sm">{effectiveCount} selecionado{effectiveCount !== 1 ? 's' : ''}</Badge>

          {/* Select all global */}
          {!selectAllGlobal && selectedIds.size === paginatedProducts.length && filteredProducts.length > paginatedProducts.length && (
            <Button variant="link" size="sm" className="text-xs h-auto p-0" onClick={() => { setSelectAllGlobal(true); setSelectedIds(new Set()); }}>
              Selecionar todos os {filteredProducts.length} resultados
            </Button>
          )}

          <div className="flex-1" />

          <Button variant="outline" size="sm" onClick={handleBulkActivate} disabled={bulkUpdateMutation.isPending}>
            <Power className="h-3.5 w-3.5 mr-1" /> Ativar
          </Button>
          <Button variant="outline" size="sm" onClick={handleBulkDeactivate} disabled={bulkUpdateMutation.isPending}>
            <PowerOff className="h-3.5 w-3.5 mr-1" /> Desativar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsBulkEditOpen(true)} disabled={bulkUpdateMutation.isPending}>
            <Edit3 className="h-3.5 w-3.5 mr-1" /> Editar em Massa
          </Button>
          <Button variant="outline" size="sm" onClick={handleBulkSyncBling} disabled={bulkUpdateMutation.isPending}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Sync Bling
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearSelection}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-4 h-auto">
          <TabsTrigger value="active-stock" className="text-[11px] sm:text-sm px-1 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap">
            {isMobile ? `Ativos (${tabCounts.activeStock})` : <><CheckCircle className="h-3.5 w-3.5 mr-1" />Ativos ({tabCounts.activeStock})</>}
          </TabsTrigger>
          <TabsTrigger value="all" className="text-[11px] sm:text-sm px-1 sm:px-3 py-1.5 sm:py-2">Todos ({tabCounts.all})</TabsTrigger>
          <TabsTrigger value="out-of-stock" className="text-[11px] sm:text-sm px-1 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap">
            {isMobile ? `S/Est. (${tabCounts.outOfStock})` : <><PackageX className="h-3.5 w-3.5 mr-1" />Sem Estoque ({tabCounts.outOfStock})</>}
          </TabsTrigger>
          <TabsTrigger value="inactive" className="text-[11px] sm:text-sm px-1 sm:px-3 py-1.5 sm:py-2">
            {isMobile ? `Inat. (${tabCounts.inactive})` : <><EyeOff className="h-3.5 w-3.5 mr-1" />Inativos ({tabCounts.inactive})</>}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou SKU..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
          {isMobile && (
            <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0" onClick={() => setShowFilters(!showFilters)}>
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          )}
        </div>

        {(!isMobile || showFilters) && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" /><SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Mais recentes</SelectItem>
                <SelectItem value="oldest">Mais antigos</SelectItem>
                <SelectItem value="price-desc">Maior preço</SelectItem>
                <SelectItem value="price-asc">Menor preço</SelectItem>
                <SelectItem value="name-asc">Nome A-Z</SelectItem>
                <SelectItem value="name-desc">Nome Z-A</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas origens</SelectItem>
                <SelectItem value="bling">Bling</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            {!isMobile && (
              <>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas categorias</SelectItem>
                    {categories?.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="inactive">Inativos</SelectItem>
                    <SelectItem value="featured">Destaques</SelectItem>
                    <SelectItem value="new">Lançamentos</SelectItem>
                    <SelectItem value="sale">Em promoção</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
            {hasActiveFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Button>}
          </div>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs sm:text-sm text-muted-foreground">
        {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''} encontrado{filteredProducts.length !== 1 ? 's' : ''}
        {totalPages > 1 && ` — Página ${currentPage} de ${totalPages}`}
      </p>

      {/* Product list */}
      {isMobile ? (
        <div className="space-y-2">
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Carregando...</p>
          ) : paginatedProducts.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Nenhum produto encontrado</p>
          ) : (
            paginatedProducts.map(product => (
              <div key={product.id} className="flex items-center gap-2 p-3 rounded-lg border bg-background">
                <Checkbox
                  checked={selectAllGlobal || selectedIds.has(product.id)}
                  onCheckedChange={() => toggleSelect(product.id)}
                  className="flex-shrink-0"
                />
                <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => handleEdit(product)}>
                  <img
                    src={product.images?.find(i => i.is_primary)?.url || product.images?.[0]?.url || '/placeholder.svg'}
                    alt={product.name} className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{product.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm font-semibold text-primary">{formatPrice(Number(product.sale_price || product.base_price))}</span>
                      {product.sale_price && product.sale_price < product.base_price && (
                        <span className="text-xs text-muted-foreground line-through">{formatPrice(Number(product.base_price))}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {!product.is_active && <Badge variant="secondary" className="text-[10px] h-4 px-1">Inativo</Badge>}
                      {isOutOfStock(product) ? (
                        <Badge variant="destructive" className="text-[10px] h-4 px-1">Sem Estoque</Badge>
                      ) : hasStock(product) ? (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 border-green-500 text-green-600">{getTotalStock(product)} un.</Badge>
                      ) : null}
                      {product.bling_product_id && renderBlingSyncBadge(product)}
                    </div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEdit(product)}><Pencil className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleSyncSingleStock(product)}
                      disabled={syncingProductId === product.id || !product.is_active}
                    >
                      {syncingProductId === product.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Sincronizar estoque
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => deleteMutation.mutate(product.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Excluir</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-background rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[60px]">Atualiz.</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">Carregando...</TableCell></TableRow>
              ) : paginatedProducts.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado</TableCell></TableRow>
              ) : (
                paginatedProducts.map(product => (
                  <TableRow key={product.id} className={selectedIds.has(product.id) || selectAllGlobal ? 'bg-muted/30' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={selectAllGlobal || selectedIds.has(product.id)}
                        onCheckedChange={() => toggleSelect(product.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleEdit(product)}>
                        <img
                          src={product.images?.find(i => i.is_primary)?.url || product.images?.[0]?.url || '/placeholder.svg'}
                          alt={product.name} className="w-12 h-12 rounded-lg object-cover"
                        />
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-sm text-muted-foreground">{product.sku}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{product.category?.name || '-'}</TableCell>
                    <TableCell>
                      <div>
                        {product.sale_price && (
                          <span className="text-muted-foreground line-through text-sm mr-2">{formatPrice(Number(product.base_price))}</span>
                        )}
                        <span className="font-medium">{formatPrice(Number(product.sale_price || product.base_price))}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={product.is_active ? 'default' : 'secondary'}>{product.is_active ? 'Ativo' : 'Inativo'}</Badge>
                        {product.bling_product_id ? renderBlingSyncBadge(product) : (
                          <Badge variant="outline" className="border-muted-foreground text-muted-foreground">Manual</Badge>
                        )}
                        {isOutOfStock(product) ? (
                          <Badge variant="destructive" className="gap-1"><PackageX className="h-3 w-3" />Sem Estoque</Badge>
                        ) : hasLowStock(product) ? (
                          <Badge variant="outline" className="gap-1 border-orange-500 text-orange-600 dark:text-orange-400">Estoque Baixo ({getTotalStock(product)})</Badge>
                        ) : hasStock(product) ? (
                          <Badge variant="outline" className="gap-1 border-green-500 text-green-600 dark:text-green-400">{getTotalStock(product)} un.</Badge>
                        ) : null}
                        {product.is_featured && <Badge variant="outline">Destaque</Badge>}
                        {product.is_new && <Badge className="bg-primary">Novo</Badge>}
                        {product.sale_price && product.sale_price < product.base_price && <Badge className="bg-destructive">Promoção</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{renderUpdatedAt(product)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(product)}><Pencil className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSyncSingleStock(product)}
                            disabled={syncingProductId === product.id || !product.is_active}
                          >
                            {syncingProductId === product.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                            Sincronizar estoque
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deleteMutation.mutate(product.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Excluir</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 sm:gap-2 pt-2">
          <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>‹</Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(isMobile ? 3 : 5, totalPages) }, (_, i) => {
              let pageNum: number;
              const maxVisible = isMobile ? 3 : 5;
              if (totalPages <= maxVisible) pageNum = i + 1;
              else if (currentPage <= Math.ceil(maxVisible / 2)) pageNum = i + 1;
              else if (currentPage >= totalPages - Math.floor(maxVisible / 2)) pageNum = totalPages - maxVisible + 1 + i;
              else pageNum = currentPage - Math.floor(maxVisible / 2) + i;
              return (
                <Button key={pageNum} variant={currentPage === pageNum ? 'default' : 'outline'} size="sm" className="w-8 h-8 p-0 text-xs" onClick={() => setCurrentPage(pageNum)}>
                  {pageNum}
                </Button>
              );
            })}
          </div>
          <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>›</Button>
        </div>
      )}

      <ProductFormDialog open={isDialogOpen} onOpenChange={handleDialogClose} editingProduct={editingProduct} />
      <BulkEditDialog
        open={isBulkEditOpen}
        onOpenChange={setIsBulkEditOpen}
        selectedCount={effectiveCount}
        onApply={handleBulkEdit}
        isLoading={bulkUpdateMutation.isPending}
      />
    </div>
  );
}
