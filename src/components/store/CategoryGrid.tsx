 import { Link } from 'react-router-dom';
 import { useCategories } from '@/hooks/useProducts';
 
 export function CategoryGrid() {
   const { data: categories, isLoading } = useCategories();
 
   if (isLoading) {
     return (
       <section className="py-12">
         <div className="container-custom">
           <h2 className="text-2xl font-bold text-center mb-8">Navegue por Categorias</h2>
           <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
             {[...Array(6)].map((_, i) => (
               <div key={i} className="animate-pulse">
                 <div className="aspect-square bg-muted rounded-full mb-3" />
                 <div className="h-4 bg-muted rounded w-2/3 mx-auto" />
               </div>
             ))}
           </div>
         </div>
       </section>
     );
   }
 
   return (
     <section className="py-12">
       <div className="container-custom">
         <h2 className="text-2xl font-bold text-center mb-2">Navegue por Categorias</h2>
         <div className="w-16 h-1 bg-secondary mx-auto mb-8" />
         
         <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
           {categories?.map((category) => (
             <Link
               key={category.id}
               to={`/categoria/${category.slug}`}
               className="group text-center"
             >
               <div className="aspect-square rounded-full overflow-hidden bg-muted mb-3 mx-auto max-w-[150px] ring-2 ring-transparent group-hover:ring-primary transition-all">
                 <img
                   src={category.image_url || '/placeholder.svg'}
                   alt={category.name}
                   className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                 />
               </div>
               <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                 {category.name}
               </h3>
             </Link>
           ))}
         </div>
       </div>
     </section>
   );
 }