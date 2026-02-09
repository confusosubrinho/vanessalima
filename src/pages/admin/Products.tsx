import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, Search, MoreHorizontal, Pencil, ArrowUpDown, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportToCSV, parseCSV, readFileAsText } from '@/lib/csv';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ProductFormDialog } from '@/components/admin/ProductFormDialog';
import { useCategories } from '@/hooks/useProducts';

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
  category?: { id: string; name: string } | null;
  images?: { id: string; url: string; alt_text: string | null; display_order: number; is_primary: boolean; media_type: string }[];
}

export default function Products() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: categories } = useCategories();
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [sortBy, setSortBy] = useState<string>('newest');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: products, isLoading } = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          category:categories(*),
          images:product_images(*)
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
    if (!open) {
      setEditingProduct(null);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  };

  // Filter products
  let filteredProducts = products?.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  ) || [];

  // Category filter
  if (categoryFilter !== 'all') {
    filteredProducts = filteredProducts.filter(p => p.category_id === categoryFilter);
  }

  // Status filter
  if (statusFilter === 'active') {
    filteredProducts = filteredProducts.filter(p => p.is_active);
  } else if (statusFilter === 'inactive') {
    filteredProducts = filteredProducts.filter(p => !p.is_active);
  } else if (statusFilter === 'featured') {
    filteredProducts = filteredProducts.filter(p => p.is_featured);
  } else if (statusFilter === 'new') {
    filteredProducts = filteredProducts.filter(p => p.is_new);
  } else if (statusFilter === 'sale') {
    filteredProducts = filteredProducts.filter(p => p.sale_price && p.sale_price < p.base_price);
  }

  // Sort products
  switch (sortBy) {
    case 'oldest':
      filteredProducts.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      break;
    case 'price-asc':
      filteredProducts.sort((a, b) => Number(a.sale_price || a.base_price) - Number(b.sale_price || b.base_price));
      break;
    case 'price-desc':
      filteredProducts.sort((a, b) => Number(b.sale_price || b.base_price) - Number(a.sale_price || a.base_price));
      break;
    case 'name-asc':
      filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'name-desc':
      filteredProducts.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'newest':
    default:
      filteredProducts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      break;
  }

  const clearFilters = () => {
    setSortBy('newest');
    setCategoryFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
  };

  const hasActiveFilters = categoryFilter !== 'all' || statusFilter !== 'all';
  const importRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    if (!products) return;
    const exportData = products.map(p => ({
      nome: p.name,
      slug: p.slug,
      sku: p.sku || '',
      preco_base: p.base_price,
      preco_promocional: p.sale_price || '',
      categoria: p.category?.name || '',
      ativo: p.is_active ? 'Sim' : 'Não',
      destaque: p.is_featured ? 'Sim' : 'Não',
      novo: p.is_new ? 'Sim' : 'Não',
      marca: p.brand || '',
      material: p.material || '',
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Produtos</h1>
          <p className="text-muted-foreground">Gerencie os produtos da sua loja</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <label>
            <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
            <Button variant="outline" size="sm" asChild>
              <span>
                <Upload className="h-4 w-4 mr-2" />
                Importar
              </span>
            </Button>
          </label>
          <Button onClick={handleNewProduct}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Produto
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {categories?.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
            <SelectItem value="featured">Destaques</SelectItem>
            <SelectItem value="new">Lançamentos</SelectItem>
            <SelectItem value="sale">Em promoção</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[160px]">
            <ArrowUpDown className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Ordenar" />
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

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''} encontrado{filteredProducts.length !== 1 ? 's' : ''}
      </p>

      <div className="bg-background rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell>
              </TableRow>
            ) : filteredProducts?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nenhum produto encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts?.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <img
                        src={product.images?.find(i => i.is_primary)?.url || product.images?.[0]?.url || '/placeholder.svg'}
                        alt={product.name}
                        className="w-12 h-12 rounded-lg object-cover"
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
                        <span className="text-muted-foreground line-through text-sm mr-2">
                          {formatPrice(Number(product.base_price))}
                        </span>
                      )}
                      <span className="font-medium">
                        {formatPrice(Number(product.sale_price || product.base_price))}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={product.is_active ? 'default' : 'secondary'}>
                        {product.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      {product.is_featured && <Badge variant="outline">Destaque</Badge>}
                      {product.is_new && <Badge className="bg-primary">Novo</Badge>}
                      {product.sale_price && product.sale_price < product.base_price && (
                        <Badge className="bg-destructive">Promoção</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(product)}>
                          <Pencil className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteMutation.mutate(product.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ProductFormDialog
        open={isDialogOpen}
        onOpenChange={handleDialogClose}
        editingProduct={editingProduct}
      />
    </div>
  );
}
