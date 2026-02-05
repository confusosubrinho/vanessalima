 import { useState } from 'react';
 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { Plus, Pencil, Trash2 } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Label } from '@/components/ui/label';
 import { Switch } from '@/components/ui/switch';
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
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
 } from '@/components/ui/dialog';
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
 import { useToast } from '@/hooks/use-toast';
 import { Coupon } from '@/types/database';
 
 export default function Coupons() {
   const queryClient = useQueryClient();
   const { toast } = useToast();
   const [isDialogOpen, setIsDialogOpen] = useState(false);
   const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
 
   const [formData, setFormData] = useState({
     code: '',
     discount_type: 'percentage' as 'percentage' | 'fixed',
     discount_value: '',
     min_purchase_amount: '',
     max_uses: '',
     expiry_date: '',
     is_active: true,
   });
 
   const { data: coupons, isLoading } = useQuery({
     queryKey: ['admin-coupons'],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('coupons')
         .select('*')
         .order('created_at', { ascending: false });
       if (error) throw error;
       return data as Coupon[];
     },
   });
 
   const saveMutation = useMutation({
     mutationFn: async (data: typeof formData) => {
       const couponData = {
         code: data.code.toUpperCase(),
         discount_type: data.discount_type,
         discount_value: parseFloat(data.discount_value),
         min_purchase_amount: data.min_purchase_amount ? parseFloat(data.min_purchase_amount) : 0,
         max_uses: data.max_uses ? parseInt(data.max_uses) : null,
         expiry_date: data.expiry_date || null,
         is_active: data.is_active,
       };
 
       if (editingCoupon) {
         const { error } = await supabase
           .from('coupons')
           .update(couponData)
           .eq('id', editingCoupon.id);
         if (error) throw error;
       } else {
         const { error } = await supabase.from('coupons').insert(couponData);
         if (error) throw error;
       }
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
       setIsDialogOpen(false);
       resetForm();
       toast({ title: editingCoupon ? 'Cupom atualizado!' : 'Cupom criado!' });
     },
     onError: (error: any) => {
       toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
     },
   });
 
   const deleteMutation = useMutation({
     mutationFn: async (id: string) => {
       const { error } = await supabase.from('coupons').delete().eq('id', id);
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
       toast({ title: 'Cupom excluído!' });
     },
   });
 
   const resetForm = () => {
     setFormData({
       code: '',
       discount_type: 'percentage',
       discount_value: '',
       min_purchase_amount: '',
       max_uses: '',
       expiry_date: '',
       is_active: true,
     });
     setEditingCoupon(null);
   };
 
   const handleEdit = (coupon: Coupon) => {
     setEditingCoupon(coupon);
     setFormData({
       code: coupon.code,
       discount_type: coupon.discount_type,
       discount_value: String(coupon.discount_value),
       min_purchase_amount: coupon.min_purchase_amount ? String(coupon.min_purchase_amount) : '',
       max_uses: coupon.max_uses ? String(coupon.max_uses) : '',
       expiry_date: coupon.expiry_date ? coupon.expiry_date.split('T')[0] : '',
       is_active: coupon.is_active,
     });
     setIsDialogOpen(true);
   };
 
   const formatPrice = (price: number) => {
     return new Intl.NumberFormat('pt-BR', {
       style: 'currency',
       currency: 'BRL',
     }).format(price);
   };
 
   return (
     <div className="space-y-6">
       <div className="flex items-center justify-between">
         <div>
           <h1 className="text-3xl font-bold">Cupons</h1>
           <p className="text-muted-foreground">Gerencie os cupons de desconto</p>
         </div>
         <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
           <DialogTrigger asChild>
             <Button>
               <Plus className="h-4 w-4 mr-2" />
               Novo Cupom
             </Button>
           </DialogTrigger>
           <DialogContent>
             <DialogHeader>
               <DialogTitle>{editingCoupon ? 'Editar Cupom' : 'Novo Cupom'}</DialogTitle>
             </DialogHeader>
             <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-4">
               <div>
                 <Label>Código *</Label>
                 <Input
                   value={formData.code}
                   onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                   placeholder="DESCONTO10"
                   required
                 />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <Label>Tipo de Desconto</Label>
                   <Select
                     value={formData.discount_type}
                     onValueChange={(value) => setFormData({ ...formData, discount_type: value as 'percentage' | 'fixed' })}
                   >
                     <SelectTrigger>
                       <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                       <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
                 <div>
                   <Label>Valor *</Label>
                   <Input
                     type="number"
                     step="0.01"
                     value={formData.discount_value}
                     onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                     required
                   />
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <Label>Compra Mínima</Label>
                   <Input
                     type="number"
                     step="0.01"
                     value={formData.min_purchase_amount}
                     onChange={(e) => setFormData({ ...formData, min_purchase_amount: e.target.value })}
                     placeholder="0.00"
                   />
                 </div>
                 <div>
                   <Label>Limite de Usos</Label>
                   <Input
                     type="number"
                     value={formData.max_uses}
                     onChange={(e) => setFormData({ ...formData, max_uses: e.target.value })}
                     placeholder="Ilimitado"
                   />
                 </div>
               </div>
               <div>
                 <Label>Data de Expiração</Label>
                 <Input
                   type="date"
                   value={formData.expiry_date}
                   onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                 />
               </div>
               <div className="flex items-center gap-2">
                 <Switch
                   checked={formData.is_active}
                   onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                 />
                 <Label>Ativo</Label>
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
 
       <div className="bg-background rounded-lg border">
         <Table>
           <TableHeader>
             <TableRow>
               <TableHead>Código</TableHead>
               <TableHead>Desconto</TableHead>
               <TableHead>Compra Mínima</TableHead>
               <TableHead>Usos</TableHead>
               <TableHead>Status</TableHead>
               <TableHead className="w-[100px]"></TableHead>
             </TableRow>
           </TableHeader>
           <TableBody>
             {isLoading ? (
               <TableRow>
                 <TableCell colSpan={6} className="text-center py-8">Carregando...</TableCell>
               </TableRow>
             ) : coupons?.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                   Nenhum cupom cadastrado
                 </TableCell>
               </TableRow>
             ) : (
               coupons?.map((coupon) => (
                 <TableRow key={coupon.id}>
                   <TableCell className="font-mono font-bold">{coupon.code}</TableCell>
                   <TableCell>
                     {coupon.discount_type === 'percentage'
                       ? `${coupon.discount_value}%`
                       : formatPrice(Number(coupon.discount_value))}
                   </TableCell>
                   <TableCell>{formatPrice(Number(coupon.min_purchase_amount))}</TableCell>
                   <TableCell>
                     {coupon.uses_count} / {coupon.max_uses || '∞'}
                   </TableCell>
                   <TableCell>
                     <Badge variant={coupon.is_active ? 'default' : 'secondary'}>
                       {coupon.is_active ? 'Ativo' : 'Inativo'}
                     </Badge>
                   </TableCell>
                   <TableCell>
                     <div className="flex gap-1">
                       <Button variant="ghost" size="icon" onClick={() => handleEdit(coupon)}>
                         <Pencil className="h-4 w-4" />
                       </Button>
                       <Button
                         variant="ghost"
                         size="icon"
                         className="text-destructive"
                         onClick={() => deleteMutation.mutate(coupon.id)}
                       >
                         <Trash2 className="h-4 w-4" />
                       </Button>
                     </div>
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