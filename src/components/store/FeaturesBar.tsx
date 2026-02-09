import { useState, useEffect } from 'react';
import { CreditCard, Truck, MessageCircle, Shield, Percent } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

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
  const isMobile = useIsMobile();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!isMobile) return;
    const timer = setInterval(() => {
      setCurrent(prev => (prev + 1) % features.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [isMobile]);

  if (isMobile) {
    const feature = features[current];
    return (
      <section className="py-3 bg-muted/50">
        <div className="container-custom">
          <div className="flex items-center justify-center gap-2 transition-opacity duration-300">
            <feature.icon className="h-5 w-5 text-primary flex-shrink-0" />
            <span className="font-semibold text-xs">{feature.title}</span>
            <span className="text-[10px] text-muted-foreground">— {feature.description}</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-4 sm:py-6 md:py-8 bg-muted/50">
      <div className="container-custom">
        <div className="grid grid-cols-3 md:grid-cols-5 gap-6">
          {features.map((feature, index) => (
            <div key={index} className="flex flex-col items-center text-center">
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
