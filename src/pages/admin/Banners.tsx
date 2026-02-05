 import { useState } from 'react';
 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Label } from '@/components/ui/label';
 import { Switch } from '@/components/ui/switch';
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
 } from '@/components/ui/dialog';
 import { Card, CardContent } from '@/components/ui/card';
 import { useToast } from '@/hooks/use-toast';
 import { Banner } from '@/types/database';
 
 export default function Banners() {
   const queryClient = useQueryClient();
   const { toast } = useToast();
   const [isDialogOpen, setIsDialogOpen] = useState(false);
   const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
 
   const [formData, setFormData] = useState({
     title: '',
     subtitle: '',
     image_url: '',
     cta_text: '',
     cta_url: '',
     is_active: true,
   });
 
   const { data: banners, isLoading } = useQuery({
     queryKey: ['admin-banners'],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('banners')
         .select('*')
         .order('display_order', { ascending: true });
       if (error) throw error;
       return data as Banner[];
     },
   });
 
   const saveMutation = useMutation({
     mutationFn: async (data: typeof formData) => {
       const bannerData = {
         title: data.title || null,
         subtitle: data.subtitle || null,
         image_url: data.image_url,
         cta_text: data.cta_text || null,
         cta_url: data.cta_url || null,
         is_active: data.is_active,
         display_order: editingBanner?.display_order || (banners?.length || 0),
       };
 
       if (editingBanner) {
         const { error } = await supabase
           .from('banners')
           .update(bannerData)
           .eq('id', editingBanner.id);
         if (error) throw error;
       } else {
         const { error } = await supabase.from('banners').insert(bannerData);
         if (error) throw error;
       }
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['admin-banners'] });
       setIsDialogOpen(false);
       resetForm();
       toast({ title: editingBanner ? 'Banner atualizado!' : 'Banner criado!' });
     },
     onError: (error: any) => {
       toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
     },
   });
 
   const deleteMutation = useMutation({
     mutationFn: async (id: string) => {
       const { error } = await supabase.from('banners').delete().eq('id', id);
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['admin-banners'] });
       toast({ title: 'Banner excluído!' });
     },
   });
 
   const resetForm = () => {
     setFormData({
       title: '',
       subtitle: '',
       image_url: '',
       cta_text: '',
       cta_url: '',
       is_active: true,
     });
     setEditingBanner(null);
   };
 
   const handleEdit = (banner: Banner) => {
     setEditingBanner(banner);
     setFormData({
       title: banner.title || '',
       subtitle: banner.subtitle || '',
       image_url: banner.image_url,
       cta_text: banner.cta_text || '',
       cta_url: banner.cta_url || '',
       is_active: banner.is_active,
     });
     setIsDialogOpen(true);
   };
 
   return (
     <div className="space-y-6">
       <div className="flex items-center justify-between">
         <div>
           <h1 className="text-3xl font-bold">Banners</h1>
           <p className="text-muted-foreground">Gerencie os banners do carrossel da home</p>
         </div>
         <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
           <DialogTrigger asChild>
             <Button>
               <Plus className="h-4 w-4 mr-2" />
               Novo Banner
             </Button>
           </DialogTrigger>
           <DialogContent className="max-w-2xl">
             <DialogHeader>
               <DialogTitle>{editingBanner ? 'Editar Banner' : 'Novo Banner'}</DialogTitle>
             </DialogHeader>
             <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-4">
               <div>
                 <Label>URL da Imagem *</Label>
                 <Input
                   value={formData.image_url}
                   onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                   placeholder="https://..."
                   required
                 />
                 {formData.image_url && (
                   <img src={formData.image_url} alt="Preview" className="mt-2 h-32 object-cover rounded" />
                 )}
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <Label>Título</Label>
                   <Input
                     value={formData.title}
                     onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                   />
                 </div>
                 <div>
                   <Label>Subtítulo</Label>
                   <Input
                     value={formData.subtitle}
                     onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                   />
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <Label>Texto do Botão</Label>
                   <Input
                     value={formData.cta_text}
                     onChange={(e) => setFormData({ ...formData, cta_text: e.target.value })}
                     placeholder="Ver ofertas"
                   />
                 </div>
                 <div>
                   <Label>Link do Botão</Label>
                   <Input
                     value={formData.cta_url}
                     onChange={(e) => setFormData({ ...formData, cta_url: e.target.value })}
                     placeholder="/outlet"
                   />
                 </div>
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
 
       {isLoading ? (
         <div className="text-center py-8">Carregando...</div>
       ) : banners?.length === 0 ? (
         <Card>
           <CardContent className="py-8 text-center text-muted-foreground">
             Nenhum banner cadastrado. Clique em "Novo Banner" para começar.
           </CardContent>
         </Card>
       ) : (
         <div className="grid gap-4">
           {banners?.map((banner) => (
             <Card key={banner.id} className={!banner.is_active ? 'opacity-60' : ''}>
               <CardContent className="p-4">
                 <div className="flex items-center gap-4">
                   <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                   <img
                     src={banner.image_url}
                     alt={banner.title || 'Banner'}
                     className="h-20 w-40 object-cover rounded"
                   />
                   <div className="flex-1">
                     <p className="font-medium">{banner.title || 'Sem título'}</p>
                     <p className="text-sm text-muted-foreground">{banner.subtitle}</p>
                     {banner.cta_url && (
                       <p className="text-xs text-primary">{banner.cta_url}</p>
                     )}
                   </div>
                   <div className="flex items-center gap-2">
                     <Button variant="ghost" size="icon" onClick={() => handleEdit(banner)}>
                       <Pencil className="h-4 w-4" />
                     </Button>
                     <Button
                       variant="ghost"
                       size="icon"
                       className="text-destructive"
                       onClick={() => deleteMutation.mutate(banner.id)}
                     >
                       <Trash2 className="h-4 w-4" />
                     </Button>
                   </div>
                 </div>
               </CardContent>
             </Card>
           ))}
         </div>
       )}
     </div>
   );
 }