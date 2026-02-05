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
     <section className="py-8 bg-muted/50">
       <div className="container-custom">
         <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
           {features.map((feature, index) => (
             <div key={index} className="flex flex-col items-center text-center">
               <feature.icon className="h-8 w-8 text-primary mb-2" />
               <h3 className="font-semibold text-sm">{feature.title}</h3>
               <p className="text-xs text-muted-foreground">{feature.description}</p>
             </div>
           ))}
         </div>
       </div>
     </section>
   );
 }