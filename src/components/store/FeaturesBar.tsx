import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { CreditCard, Truck, MessageCircle, ShieldCheck, Percent } from 'lucide-react';

interface FeatureItem {
  id: string;
  title: string;
  subtitle: string | null;
  icon_url: string | null;
  display_order: number;
  is_active: boolean;
}

const defaultIcons: Record<string, React.ReactNode> = {
  'parcelamento': <CreditCard className="h-full w-full" />,
  'envios': <Truck className="h-full w-full" />,
  'atendimento': <MessageCircle className="h-full w-full" />,
  'site 100% seguro': <ShieldCheck className="h-full w-full" />,
  'desconto': <Percent className="h-full w-full" />,
};

function getDefaultIcon(title: string) {
  const lower = title.toLowerCase();
  for (const [key, icon] of Object.entries(defaultIcons)) {
    if (lower.includes(key)) return icon;
  }
  return null;
}

export function FeaturesBar() {
  const isMobile = useIsMobile();
  const [current, setCurrent] = useState(0);

  const { data: features } = useQuery({
    queryKey: ['features-bar'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('features_bar' as any)
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      if (error) throw error;
      return (data as unknown as FeatureItem[]) || [];
    },
    staleTime: 1000 * 60 * 10,
  });

  useEffect(() => {
    if (!isMobile || !features?.length) return;
    const timer = setInterval(() => {
      setCurrent(prev => (prev + 1) % features.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [isMobile, features?.length]);

  if (!features?.length) return null;

  if (isMobile) {
    const feature = features[current % features.length];
    return (
      <section className="py-3 bg-muted/50">
        <div className="container-custom">
          <div className="flex items-center justify-center gap-2 transition-opacity duration-300">
            {feature.icon_url ? (
              <img src={feature.icon_url} alt="" className="h-5 w-5 flex-shrink-0 object-contain" />
            ) : getDefaultIcon(feature.title) ? (
              <span className="h-5 w-5 flex-shrink-0 text-primary">{getDefaultIcon(feature.title)}</span>
            ) : null}
            <span className="font-semibold text-xs">{feature.title}</span>
            {feature.subtitle && <span className="text-[10px] text-muted-foreground">— {feature.subtitle}</span>}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-4 sm:py-6 md:py-8 bg-muted/50">
      <div className="container-custom">
        <div className={`grid gap-6`} style={{ gridTemplateColumns: `repeat(${Math.min(features.length, 5)}, minmax(0, 1fr))` }}>
          {features.map((feature) => (
            <div key={feature.id} className="flex flex-col items-center text-center">
              {feature.icon_url ? (
                <img src={feature.icon_url} alt="" className="h-6 w-6 sm:h-8 sm:w-8 mb-1.5 sm:mb-2 object-contain" />
              ) : getDefaultIcon(feature.title) ? (
                <span className="h-6 w-6 sm:h-8 sm:w-8 mb-1.5 sm:mb-2 text-primary">{getDefaultIcon(feature.title)}</span>
              ) : null}
              <h3 className="font-semibold text-xs sm:text-sm whitespace-nowrap">{feature.title}</h3>
              {feature.subtitle && (
                <p className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">{feature.subtitle}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
