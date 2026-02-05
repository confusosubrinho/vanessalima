 import { useState } from 'react';
 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { Plus, Pencil, Trash2, Search, MoreHorizontal } from 'lucide-react';
 import { Button } from '@/components/ui/button';
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
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
 } from '@/components/ui/dialog';
 import { Label } from '@/components/ui/label';
 import { Textarea } from '@/components/ui/textarea';
 import { Switch } from '@/components/ui/switch';
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
 import { useToast } from '@/hooks/use-toast';
 import { Product, Category } from '@/types/database';
 
 export default function Products() {
   const queryClient = useQueryClient();
   const { toast } = useToast();
   const [searchQuery, setSearchQuery] = useState('');
   const [isDialogOpen, setIsDialogOpen] = useState(false);
   const [editingProduct, setEditingProduct] = useState<Product | null>(null);
 
   const [formData, setFormData] = useState({
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
   });
 
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
 
   const { data: categories } = useQuery({
     queryKey: ['admin-categories'],
     queryFn: async () => {
       const { data } = await supabase.from('categories').select('*').order('name');
       return data as Category[];
     },
   });
 
   const saveMutation = useMutation({
     mutationFn: async (data: typeof formData) => {
       const productData = {
         name: data.name,
         slug: data.slug || data.name.toLowerCase().replace(/\s+/g, '-'),
         description: data.description,
         base_price: parseFloat(data.base_price),
         sale_price: data.sale_price ? parseFloat(data.sale_price) : null,
         category_id: data.category_id || null,
         sku: data.sku || null,
         is_active: data.is_active,
         is_featured: data.is_featured,
         is_new: data.is_new,
       };
 
       if (editingProduct) {
         const { error } = await supabase
           .from('products')
           .update(productData)
           .eq('id', editingProduct.id);
         if (error) throw error;
       } else {
         const { error } = await supabase.from('products').insert(productData);
         if (error) throw error;
       }
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['admin-products'] });
       setIsDialogOpen(false);
       resetForm();
       toast({ title: editingProduct ? 'Produto atualizado!' : 'Produto criado!' });
     },
     onError: (error: any) => {
       toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
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
 
   const resetForm = () => {
     setFormData({
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
     });
     setEditingProduct(null);
   };
 
   const handleEdit = (product: Product) => {
     setEditingProduct(product);
     setFormData({
       name: product.name,
       slug: product.slug,
       description: product.description || '',
       base_price: String(product.base_price),
       sale_price: product.sale_price ? String(product.sale_price) : '',
       category_id: product.category_id || '',
       sku: product.sku || '',
       is_active: product.is_active,
       is_featured: product.is_featured,
       is_new: product.is_new,
     });
     setIsDialogOpen(true);
   };
 
   const formatPrice = (price: number) => {
     return new Intl.NumberFormat('pt-BR', {
       style: 'currency',
       currency: 'BRL',
     }).format(price);
   };
 
   const filteredProducts = products?.filter(p =>
     p.name.toLowerCase().includes(searchQuery.toLowerCase())
   );
 
   return (
     <div className="space-y-6">
       <div className="flex items-center justify-between">
         <div>
           <h1 className="text-3xl font-bold">Produtos</h1>
           <p className="text-muted-foreground">Gerencie os produtos da sua loja</p>
         </div>
         <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
           <DialogTrigger asChild>
             <Button>
               <Plus className="h-4 w-4 mr-2" />
               Novo Produto
             </Button>
           </DialogTrigger>
           <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
             <DialogHeader>
               <DialogTitle>{editingProduct ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
             </DialogHeader>
             <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <Label>Nome *</Label>
                   <Input
                     value={formData.name}
                     onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
               <div className="flex justify-end gap-2">
                 <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                   Cancelar
                 </Button>
                 <Button type="submit" disabled={saveMutation.isPending}>
                   {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
                 </Button>
               </div>
             </form>
           </DialogContent>
         </Dialog>
       </div>
 
       <div className="flex items-center gap-4">
         <div className="relative flex-1 max-w-sm">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
           <Input
             placeholder="Buscar produtos..."
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             className="pl-10"
           />
         </div>
       </div>
 
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
                         src={product.images?.[0]?.url || '/placeholder.svg'}
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
                     <div className="flex gap-1">
                       <Badge variant={product.is_active ? 'default' : 'secondary'}>
                         {product.is_active ? 'Ativo' : 'Inativo'}
                       </Badge>
                       {product.is_featured && <Badge variant="outline">Destaque</Badge>}
                       {product.is_new && <Badge className="bg-primary">Novo</Badge>}
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
     </div>
   );
 }