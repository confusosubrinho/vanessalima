 import { useState } from 'react';
 import { useQuery } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { Search, Eye, Mail, Phone } from 'lucide-react';
 import { Input } from '@/components/ui/input';
 import { Button } from '@/components/ui/button';
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
 } from '@/components/ui/dialog';
 import { Customer } from '@/types/database';
 
 export default function Customers() {
   const [searchQuery, setSearchQuery] = useState('');
   const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
 
   const { data: customers, isLoading } = useQuery({
     queryKey: ['admin-customers'],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('customers')
         .select('*')
         .order('created_at', { ascending: false });
       if (error) throw error;
       return data as Customer[];
     },
   });
 
   const formatPrice = (price: number) => {
     return new Intl.NumberFormat('pt-BR', {
       style: 'currency',
       currency: 'BRL',
     }).format(price);
   };
 
   const formatDate = (date: string) => {
     return new Date(date).toLocaleDateString('pt-BR');
   };
 
   const filteredCustomers = customers?.filter(c =>
     c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
     c.email.toLowerCase().includes(searchQuery.toLowerCase())
   );
 
   return (
     <div className="space-y-6">
       <div>
         <h1 className="text-3xl font-bold">Clientes</h1>
         <p className="text-muted-foreground">Visualize os clientes da sua loja</p>
       </div>
 
       <div className="flex items-center gap-4">
         <div className="relative flex-1 max-w-sm">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
           <Input
             placeholder="Buscar por nome ou email..."
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
               <TableHead>Cliente</TableHead>
               <TableHead>Telefone</TableHead>
               <TableHead>Pedidos</TableHead>
               <TableHead>Total Gasto</TableHead>
               <TableHead>Desde</TableHead>
               <TableHead className="w-[50px]"></TableHead>
             </TableRow>
           </TableHeader>
           <TableBody>
             {isLoading ? (
               <TableRow>
                 <TableCell colSpan={6} className="text-center py-8">Carregando...</TableCell>
               </TableRow>
             ) : filteredCustomers?.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                   Nenhum cliente encontrado
                 </TableCell>
               </TableRow>
             ) : (
               filteredCustomers?.map((customer) => (
                 <TableRow key={customer.id}>
                   <TableCell>
                     <div>
                       <p className="font-medium">{customer.full_name}</p>
                       <p className="text-sm text-muted-foreground">{customer.email}</p>
                     </div>
                   </TableCell>
                   <TableCell>{customer.phone || '-'}</TableCell>
                   <TableCell>{customer.total_orders}</TableCell>
                   <TableCell className="font-medium">{formatPrice(Number(customer.total_spent))}</TableCell>
                   <TableCell>{formatDate(customer.created_at)}</TableCell>
                   <TableCell>
                     <Button variant="ghost" size="icon" onClick={() => setSelectedCustomer(customer)}>
                       <Eye className="h-4 w-4" />
                     </Button>
                   </TableCell>
                 </TableRow>
               ))
             )}
           </TableBody>
         </Table>
       </div>
 
       {/* Customer details dialog */}
       <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle>Detalhes do Cliente</DialogTitle>
           </DialogHeader>
           {selectedCustomer && (
             <div className="space-y-4">
               <div>
                 <h3 className="font-medium text-lg">{selectedCustomer.full_name}</h3>
                 <p className="text-muted-foreground">Cliente desde {formatDate(selectedCustomer.created_at)}</p>
               </div>
               <div className="flex items-center gap-2">
                 <Mail className="h-4 w-4 text-muted-foreground" />
                 <a href={`mailto:${selectedCustomer.email}`} className="text-primary hover:underline">
                   {selectedCustomer.email}
                 </a>
               </div>
               {selectedCustomer.phone && (
                 <div className="flex items-center gap-2">
                   <Phone className="h-4 w-4 text-muted-foreground" />
                   <a href={`tel:${selectedCustomer.phone}`} className="text-primary hover:underline">
                     {selectedCustomer.phone}
                   </a>
                 </div>
               )}
               <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                 <div>
                   <p className="text-sm text-muted-foreground">Total de Pedidos</p>
                   <p className="text-2xl font-bold">{selectedCustomer.total_orders}</p>
                 </div>
                 <div>
                   <p className="text-sm text-muted-foreground">Total Gasto</p>
                   <p className="text-2xl font-bold">{formatPrice(Number(selectedCustomer.total_spent))}</p>
                 </div>
               </div>
             </div>
           )}
         </DialogContent>
       </Dialog>
     </div>
   );
 }