 import { useState } from 'react';
 import { Star, User, ThumbsUp, MessageCircle } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { Textarea } from '@/components/ui/textarea';
 import { Input } from '@/components/ui/input';
 import { useQuery } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { ProductReview } from '@/types/database';
 import { useToast } from '@/hooks/use-toast';
 import { format } from 'date-fns';
 import { ptBR } from 'date-fns/locale';
 
 interface ProductReviewsProps {
   productId: string;
   productName: string;
 }
 
 export function ProductReviews({ productId, productName }: ProductReviewsProps) {
   const { toast } = useToast();
   const [showForm, setShowForm] = useState(false);
   const [rating, setRating] = useState(5);
   const [name, setName] = useState('');
   const [title, setTitle] = useState('');
   const [comment, setComment] = useState('');
   const [isSubmitting, setIsSubmitting] = useState(false);
 
   const { data: reviews, refetch } = useQuery({
     queryKey: ['reviews', productId],
     queryFn: async () => {
        const { data, error } = await (supabase
          .from('product_reviews')
          .select('*')
          .eq('product_id', productId)
          .eq('is_approved', true) as any)
          .eq('status', 'published')
          .order('created_at', { ascending: false });
 
       if (error) throw error;
       return data as ProductReview[];
     },
   });
 
   const averageRating = reviews?.length 
     ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length 
     : 0;
 
   const ratingCounts = [5, 4, 3, 2, 1].map(star => ({
     star,
     count: reviews?.filter(r => r.rating === star).length || 0
   }));
 
   const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     
     if (!name.trim() || !comment.trim()) {
       toast({
         title: 'Preencha todos os campos obrigatórios',
         variant: 'destructive',
       });
       return;
     }
 
     setIsSubmitting(true);
 
     try {
       const { data: { user } } = await supabase.auth.getUser();
 
       const { error } = await supabase
         .from('product_reviews')
         .insert({
           product_id: productId,
           user_id: user?.id || null,
           customer_name: name,
           rating,
           title: title || null,
           comment,
           is_verified_purchase: false,
         });
 
       if (error) throw error;
 
       toast({
         title: 'Avaliação enviada!',
         description: 'Obrigado pela sua avaliação. Ela será publicada após moderação.',
       });
 
       setShowForm(false);
       setName('');
       setTitle('');
       setComment('');
       setRating(5);
       refetch();
     } catch (error) {
       toast({
         title: 'Erro ao enviar avaliação',
         description: 'Por favor, tente novamente.',
         variant: 'destructive',
       });
     } finally {
       setIsSubmitting(false);
     }
   };
 
   const renderStars = (count: number, size: 'sm' | 'md' | 'lg' = 'md') => {
     const sizeClass = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';
     return (
       <div className="flex gap-0.5">
         {[1, 2, 3, 4, 5].map((star) => (
           <Star
             key={star}
             className={`${sizeClass} ${star <= count ? 'fill-yellow-400 text-yellow-400' : 'text-muted'}`}
           />
         ))}
       </div>
     );
   };
 
   return (
     <div className="py-12 border-t">
       <div className="container-custom">
         <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
           <MessageCircle className="h-6 w-6 text-primary" />
           Avaliações dos Clientes
         </h2>
 
         <div className="grid md:grid-cols-3 gap-8">
           {/* Rating Summary */}
           <div className="md:col-span-1 bg-muted/30 p-6 rounded-xl">
             <div className="text-center mb-6">
               <p className="text-5xl font-bold text-primary">{averageRating.toFixed(1)}</p>
               <div className="flex justify-center my-2">{renderStars(Math.round(averageRating), 'lg')}</div>
               <p className="text-muted-foreground">{reviews?.length || 0} avaliações</p>
             </div>
 
             <div className="space-y-2">
               {ratingCounts.map(({ star, count }) => (
                 <div key={star} className="flex items-center gap-2 text-sm">
                   <span className="w-3">{star}</span>
                   <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                   <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                     <div
                       className="h-full bg-yellow-400 rounded-full"
                       style={{ width: `${reviews?.length ? (count / reviews.length) * 100 : 0}%` }}
                     />
                   </div>
                   <span className="w-8 text-muted-foreground text-right">{count}</span>
                 </div>
               ))}
             </div>
 
             <Button 
               className="w-full mt-6" 
               onClick={() => setShowForm(!showForm)}
             >
               Escrever Avaliação
             </Button>
           </div>
 
           {/* Reviews List */}
           <div className="md:col-span-2 space-y-6">
             {showForm && (
               <form onSubmit={handleSubmit} className="bg-muted/30 p-6 rounded-xl space-y-4">
                 <h3 className="font-bold text-lg">Sua avaliação para {productName}</h3>
                 
                 <div>
                   <label className="block text-sm font-medium mb-2">Nota</label>
                   <div className="flex gap-1">
                     {[1, 2, 3, 4, 5].map((star) => (
                       <button
                         key={star}
                         type="button"
                         onClick={() => setRating(star)}
                         className="p-1 hover:scale-110 transition-transform"
                       >
                         <Star
                           className={`h-8 w-8 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted'}`}
                         />
                       </button>
                     ))}
                   </div>
                 </div>
 
                 <div className="grid sm:grid-cols-2 gap-4">
                   <div>
                     <label className="block text-sm font-medium mb-2">Seu nome *</label>
                     <Input 
                       value={name} 
                       onChange={(e) => setName(e.target.value)} 
                       placeholder="Como você quer ser chamado"
                       required
                     />
                   </div>
                   <div>
                     <label className="block text-sm font-medium mb-2">Título (opcional)</label>
                     <Input 
                       value={title} 
                       onChange={(e) => setTitle(e.target.value)} 
                       placeholder="Resumo da sua avaliação"
                     />
                   </div>
                 </div>
 
                 <div>
                   <label className="block text-sm font-medium mb-2">Comentário *</label>
                   <Textarea
                     value={comment}
                     onChange={(e) => setComment(e.target.value)}
                     placeholder="Conte sua experiência com o produto..."
                     rows={4}
                     required
                   />
                 </div>
 
                 <div className="flex gap-2">
                   <Button type="submit" disabled={isSubmitting}>
                     {isSubmitting ? 'Enviando...' : 'Enviar Avaliação'}
                   </Button>
                   <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                     Cancelar
                   </Button>
                 </div>
               </form>
             )}
 
             {reviews && reviews.length > 0 ? (
               reviews.map((review) => (
                 <div key={review.id} className="border-b pb-6">
                   <div className="flex items-start justify-between mb-2">
                     <div className="flex items-center gap-3">
                       <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                         <User className="h-5 w-5 text-primary" />
                       </div>
                       <div>
                         <p className="font-medium">{review.customer_name}</p>
                         <p className="text-xs text-muted-foreground">
                           {format(new Date(review.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                         </p>
                       </div>
                     </div>
                     {renderStars(review.rating)}
                   </div>
                   
                   {review.title && <p className="font-medium mb-1">{review.title}</p>}
                   <p className="text-muted-foreground">{review.comment}</p>
                   
                    {review.is_verified_purchase && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-primary">
                        <ThumbsUp className="h-3 w-3" />
                        Compra verificada
                      </div>
                    )}
                    {(review as any).admin_reply && (
                      <div className="bg-muted/50 rounded-lg p-3 mt-3 text-sm">
                        <p className="font-semibold text-xs text-primary mb-1">Resposta da loja:</p>
                        <p className="text-muted-foreground">{(review as any).admin_reply}</p>
                      </div>
                    )}
                 </div>
               ))
             ) : (
               <div className="text-center py-12 text-muted-foreground">
                 <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                 <p>Seja o primeiro a avaliar este produto!</p>
                 <Button className="mt-4" onClick={() => setShowForm(true)}>
                   Escrever Avaliação
                 </Button>
               </div>
             )}
           </div>
         </div>
       </div>
     </div>
   );
 }