import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Phone, Mail, MapPin } from 'lucide-react';
import logo from '@/assets/logo.png';
import { SocialIcons } from './SocialIcons';

interface PaymentMethod {
  id: string;
  name: string;
  image_url: string | null;
  link_url: string | null;
  display_order: number;
  is_active: boolean;
}

interface SecuritySeal {
  id: string;
  title: string | null;
  image_url: string | null;
  html_code: string | null;
  link_url: string | null;
  display_order: number;
  is_active: boolean;
}

export function Footer() {
  const { data: paymentMethods } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const { data, error } = await supabase.from('payment_methods_display' as any).select('*').eq('is_active', true).order('display_order');
      if (error) throw error;
      return (data as unknown as PaymentMethod[]) || [];
    },
    staleTime: 1000 * 60 * 10,
  });

  const { data: seals } = useQuery({
    queryKey: ['security-seals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('security_seals' as any).select('*').eq('is_active', true).order('display_order');
      if (error) throw error;
      return (data as unknown as SecuritySeal[]) || [];
    },
    staleTime: 1000 * 60 * 10,
  });

  const renderSeal = (seal: SecuritySeal) => {
    const content = seal.image_url ? (
      <img src={seal.image_url} alt={seal.title || 'Selo'} className="h-8 object-contain" />
    ) : seal.html_code ? (
      <div dangerouslySetInnerHTML={{ __html: seal.html_code }} />
    ) : (
      <span className="text-xs font-bold">{seal.title}</span>
    );

    if (seal.link_url) {
      return (
        <a key={seal.id} href={seal.link_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-secondary-foreground/10 px-3 py-2 rounded-lg hover:bg-secondary-foreground/20 transition-colors">
          {content}
        </a>
      );
    }

    return (
      <div key={seal.id} className="flex items-center gap-2 bg-secondary-foreground/10 px-3 py-2 rounded-lg">
        {content}
      </div>
    );
  };

  return (
    <footer className="bg-secondary text-secondary-foreground content-lazy">
      <div className="container-custom py-8 sm:py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
          <div className="space-y-4 col-span-2 md:col-span-1">
            <img src={logo} alt="Vanessa Lima Shoes" className="h-10 sm:h-12 brightness-0 invert" loading="lazy" decoding="async" width={120} height={48} />
            <p className="text-sm text-secondary-foreground/80">
              Calçados femininos de alta qualidade, feitos com couro legítimo e muito amor.
            </p>
            <div className="flex gap-4">
              <SocialIcons />
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Institucional</h4>
            <ul className="space-y-2 text-sm text-secondary-foreground/80">
              <li><Link to="/sobre" className="hover:text-primary transition-colors">Sobre Nós</Link></li>
              <li><Link to="/politica-privacidade" className="hover:text-primary transition-colors">Política de Privacidade</Link></li>
              <li><Link to="/termos" className="hover:text-primary transition-colors">Termos de Uso</Link></li>
              <li><Link to="/trocas" className="hover:text-primary transition-colors">Trocas e Devoluções</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Ajuda</h4>
            <ul className="space-y-2 text-sm text-secondary-foreground/80">
              <li><Link to="/faq" className="hover:text-primary transition-colors">Perguntas Frequentes</Link></li>
              <li><Link to="/como-comprar" className="hover:text-primary transition-colors">Como Comprar</Link></li>
              <li><Link to="/conta" className="hover:text-primary transition-colors">Minha Conta</Link></li>
              <li><Link to="/formas-pagamento" className="hover:text-primary transition-colors">Formas de Pagamento</Link></li>
              <li><Link to="/rastreio" className="hover:text-primary transition-colors">Rastrear Pedido</Link></li>
              <li><Link to="/mais-vendidos" className="hover:text-primary transition-colors">Mais Vendidos</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Contato</h4>
            <ul className="space-y-3 text-sm text-secondary-foreground/80">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <a href="tel:42991120205" className="hover:text-primary transition-colors">42 99112-0205</a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <a href="mailto:contato@vanessalimashoes.com.br" className="hover:text-primary transition-colors">contato@vanessalimashoes.com.br</a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-primary mt-0.5" />
                <span>Rua Professor Cleto - até 669/670<br/>União da Vitória - PR, CEP: 84600140</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Payment methods & security seals */}
      <div className="border-t border-secondary-foreground/20">
        <div className="container-custom py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="text-center md:text-left">
              <h4 className="font-semibold mb-3 text-xs uppercase tracking-wider">Formas de Pagamento</h4>
              <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                {paymentMethods?.map((pm) => (
                  pm.link_url ? (
                    <a key={pm.id} href={pm.link_url} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                      {pm.image_url ? (
                        <img src={pm.image_url} alt={pm.name} className="h-8 object-contain rounded" />
                      ) : (
                        <span className="bg-secondary-foreground/10 text-secondary-foreground/80 px-3 py-1.5 rounded text-xs font-medium">{pm.name}</span>
                      )}
                    </a>
                  ) : (
                    pm.image_url ? (
                      <img key={pm.id} src={pm.image_url} alt={pm.name} className="h-8 object-contain rounded" />
                    ) : (
                      <span key={pm.id} className="bg-secondary-foreground/10 text-secondary-foreground/80 px-3 py-1.5 rounded text-xs font-medium">{pm.name}</span>
                    )
                  )
                ))}
              </div>
            </div>

            <div className="text-center md:text-right">
              <h4 className="font-semibold mb-3 text-xs uppercase tracking-wider">Segurança</h4>
              <div className="flex gap-3 justify-center md:justify-end">
                {seals?.map(renderSeal)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-secondary-foreground/5">
        <div className="container-custom py-3">
          <p className="text-[10px] sm:text-xs text-secondary-foreground/50 text-center leading-relaxed">
            Vanessa S. de Lima Store · CNPJ: 19.947.968/0001-58 · Rua Professor Cleto - até 669/670, União da Vitória - PR, CEP: 84600140
          </p>
        </div>
      </div>

      <div className="bg-secondary-foreground/5">
        <div className="container-custom py-3">
          <p className="text-xs text-secondary-foreground/40 text-center">
            © 2025 Vanessa Lima Shoes. Todos os direitos reservados. · Criado com ❤️ por <a href="https://studioninja.com.br" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors font-medium">Studio Ninja</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
