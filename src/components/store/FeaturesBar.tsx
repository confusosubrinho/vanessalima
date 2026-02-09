 import { CreditCard, Truck, MessageCircle, Shield, Percent } from 'lucide-react';
 
 const features = [
   {
     icon: CreditCard,
     title: 'Parcelamento',
     description: 'Em até 6x sem juros',
   },
   {
     icon: Truck,
     title: 'Envios',
     description: 'Enviamos para todo Brasil',
   },
   {
     icon: MessageCircle,
     title: 'Atendimento',
     description: 'via WhatsApp',
   },
   {
     icon: Shield,
     title: 'Site 100% Seguro',
     description: 'Selo de segurança',
   },
   {
     icon: Percent,
     title: 'Desconto de 10%',
     description: 'cupom: PRIMEIRACOMPRA',
   },
 ];
 
  export function FeaturesBar() {
    return (
      <section className="py-4 sm:py-6 md:py-8 bg-muted/50">
        <div className="container-custom">
          <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 sm:pb-0 sm:grid sm:grid-cols-3 md:grid-cols-5 sm:gap-6" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {features.map((feature, index) => (
              <div key={index} className="flex flex-col items-center text-center flex-shrink-0 min-w-[100px] sm:min-w-0">
                <feature.icon className="h-6 w-6 sm:h-8 sm:w-8 text-primary mb-1.5 sm:mb-2" />
                <h3 className="font-semibold text-xs sm:text-sm whitespace-nowrap">{feature.title}</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }