 import { useState } from 'react';
 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { Search, Eye, MoreHorizontal } from 'lucide-react';
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
 } from '@/components/ui/dialog';
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
 import { useToast } from '@/hooks/use-toast';
 import { Order } from '@/types/database';
 
 export default function Orders() {
   const queryClient = useQueryClient();
   const { toast } = useToast();
   const [searchQuery, setSearchQuery] = useState('');
   const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
 
   const { data: orders, isLoading } = useQuery({
     queryKey: ['admin-orders'],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('orders')
         .select('*')
         .order('created_at', { ascending: false });
       if (error) throw error;
       return data as Order[];
     },
   });
 
   const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' }) => {
       const { error } = await supabase
         .from('orders')
         .update({ status })
         .eq('id', id);
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
       toast({ title: 'Status atualizado!' });
     },
   });
 
   const formatPrice = (price: number) => {
     return new Intl.NumberFormat('pt-BR', {
       style: 'currency',
       currency: 'BRL',
     }).format(price);
   };
 
   const formatDate = (date: string) => {
     return new Date(date).toLocaleDateString('pt-BR', {
       day: '2-digit',
       month: '2-digit',
       year: 'numeric',
       hour: '2-digit',
       minute: '2-digit',
     });
   };
 
   const statusColors: Record<string, string> = {
     pending: 'bg-warning/20 text-warning-foreground border-warning',
     processing: 'bg-blue-100 text-blue-800',
     shipped: 'bg-purple-100 text-purple-800',
     delivered: 'bg-success/20 text-success border-success',
     cancelled: 'bg-destructive/20 text-destructive',
   };
 
   const statusLabels: Record<string, string> = {
     pending: 'Pendente',
     processing: 'Processando',
     shipped: 'Enviado',
     delivered: 'Entregue',
     cancelled: 'Cancelado',
   };
 
   const filteredOrders = orders?.filter(o =>
     o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
     o.shipping_name.toLowerCase().includes(searchQuery.toLowerCase())
   );
 
   return (
     <div className="space-y-6">
       <div>
         <h1 className="text-3xl font-bold">Pedidos</h1>
         <p className="text-muted-foreground">Gerencie os pedidos da sua loja</p>
       </div>
 
       <div className="flex items-center gap-4">
         <div className="relative flex-1 max-w-sm">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
           <Input
             placeholder="Buscar por número ou cliente..."
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
               <TableHead>Pedido</TableHead>
               <TableHead>Cliente</TableHead>
               <TableHead>Data</TableHead>
               <TableHead>Valor</TableHead>
               <TableHead>Status</TableHead>
               <TableHead className="w-[50px]"></TableHead>
             </TableRow>
           </TableHeader>
           <TableBody>
             {isLoading ? (
               <TableRow>
                 <TableCell colSpan={6} className="text-center py-8">Carregando...</TableCell>
               </TableRow>
             ) : filteredOrders?.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                   Nenhum pedido encontrado
                 </TableCell>
               </TableRow>
             ) : (
               filteredOrders?.map((order) => (
                 <TableRow key={order.id}>
                   <TableCell className="font-medium">{order.order_number}</TableCell>
                   <TableCell>
                     <div>
                       <p className="font-medium">{order.shipping_name}</p>
                       <p className="text-sm text-muted-foreground">{order.shipping_city} - {order.shipping_state}</p>
                     </div>
                   </TableCell>
                   <TableCell>{formatDate(order.created_at)}</TableCell>
                   <TableCell className="font-medium">{formatPrice(Number(order.total_amount))}</TableCell>
                   <TableCell>
                     <Select
                       value={order.status}
                      onValueChange={(value) => updateStatusMutation.mutate({ id: order.id, status: value as 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' })}
                     >
                       <SelectTrigger className="w-[140px]">
                         <Badge className={statusColors[order.status]}>
                           {statusLabels[order.status]}
                         </Badge>
                       </SelectTrigger>
                       <SelectContent>
                         {Object.entries(statusLabels).map(([key, label]) => (
                           <SelectItem key={key} value={key}>{label}</SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                   </TableCell>
                   <TableCell>
                     <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(order)}>
                       <Eye className="h-4 w-4" />
                     </Button>
                   </TableCell>
                 </TableRow>
               ))
             )}
           </TableBody>
         </Table>
       </div>
 
       {/* Order details dialog */}
       <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
         <DialogContent className="max-w-2xl">
           <DialogHeader>
             <DialogTitle>Pedido {selectedOrder?.order_number}</DialogTitle>
           </DialogHeader>
           {selectedOrder && (
             <div className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <h3 className="font-medium mb-2">Endereço de Entrega</h3>
                   <p>{selectedOrder.shipping_name}</p>
                   <p className="text-muted-foreground">
                     {selectedOrder.shipping_address}<br />
                     {selectedOrder.shipping_city} - {selectedOrder.shipping_state}<br />
                     CEP: {selectedOrder.shipping_zip}
                   </p>
                   {selectedOrder.shipping_phone && <p>Tel: {selectedOrder.shipping_phone}</p>}
                 </div>
                 <div>
                   <h3 className="font-medium mb-2">Resumo</h3>
                   <div className="space-y-1 text-sm">
                     <div className="flex justify-between">
                       <span>Subtotal:</span>
                       <span>{formatPrice(Number(selectedOrder.subtotal))}</span>
                     </div>
                     <div className="flex justify-between">
                       <span>Frete:</span>
                       <span>{formatPrice(Number(selectedOrder.shipping_cost))}</span>
                     </div>
                     {selectedOrder.discount_amount > 0 && (
                       <div className="flex justify-between text-primary">
                         <span>Desconto:</span>
                         <span>-{formatPrice(Number(selectedOrder.discount_amount))}</span>
                       </div>
                     )}
                     <div className="flex justify-between font-bold pt-2 border-t">
                       <span>Total:</span>
                       <span>{formatPrice(Number(selectedOrder.total_amount))}</span>
                     </div>
                   </div>
                 </div>
               </div>
               {selectedOrder.tracking_code && (
                 <div>
                   <h3 className="font-medium mb-2">Rastreamento</h3>
                   <p className="text-muted-foreground">{selectedOrder.tracking_code}</p>
                 </div>
               )}
               {selectedOrder.notes && (
                 <div>
                   <h3 className="font-medium mb-2">Observações</h3>
                   <p className="text-muted-foreground">{selectedOrder.notes}</p>
                 </div>
               )}
             </div>
           )}
         </DialogContent>
       </Dialog>
     </div>
   );
 }