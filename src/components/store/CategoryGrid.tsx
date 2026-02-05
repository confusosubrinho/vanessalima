import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
 import { useCategories } from '@/hooks/useProducts';
 
 export function CategoryGrid() {
   const { data: categories, isLoading } = useCategories();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };
 
   if (isLoading) {
     return (
       <section className="py-12">
         <div className="container-custom">
           <h2 className="text-2xl font-bold text-center mb-8">Navegue por Categorias</h2>
          <div className="flex gap-6 overflow-hidden">
             {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse flex-shrink-0">
                <div className="w-[150px] h-[150px] bg-muted rounded-full mb-3" />
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

        <div className="relative">
          {/* Navigation arrows */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => scroll('left')}
            className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 bg-background shadow-lg rounded-full hidden md:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => scroll('right')}
            className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 bg-background shadow-lg rounded-full hidden md:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>

          {/* Categories carousel */}
          <div
            ref={scrollRef}
            className="flex gap-6 overflow-x-auto scrollbar-hide pb-4 snap-x snap-mandatory"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {categories?.map((category) => (
              <Link
                key={category.id}
                to={`/categoria/${category.slug}`}
                className="group text-center flex-shrink-0 snap-start"
              >
                <div className="w-[130px] md:w-[150px] h-[130px] md:h-[150px] rounded-full overflow-hidden bg-muted mb-3 mx-auto ring-2 ring-transparent group-hover:ring-primary transition-all">
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
       </div>
     </section>
   );
 }