import { Link } from 'react-router-dom';
import { Instagram, Facebook, Phone, Mail, MapPin } from 'lucide-react';
import logo from '@/assets/logo.png';

export function Footer() {
  return (
    <footer className="bg-secondary text-secondary-foreground content-lazy">
      <div className="container-custom py-8 sm:py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
          {/* Logo and description */}
          <div className="space-y-4 col-span-2 md:col-span-1">
            <img src={logo} alt="Vanessa Lima Shoes" className="h-10 sm:h-12 brightness-0 invert" loading="lazy" decoding="async" width={120} height={48} />
            <p className="text-sm text-secondary-foreground/80">
              Calçados femininos de alta qualidade, feitos com couro legítimo e muito amor.
            </p>
            <div className="flex gap-4">
              <a
                href="https://instagram.com/vanessalimashoes"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a
                href="https://facebook.com/vanessalimashoes"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                <Facebook className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Institutional */}
          <div>
            <h4 className="font-semibold mb-4">Institucional</h4>
            <ul className="space-y-2 text-sm text-secondary-foreground/80">
              <li><Link to="/sobre" className="hover:text-primary transition-colors">Sobre Nós</Link></li>
              <li><Link to="/politica-privacidade" className="hover:text-primary transition-colors">Política de Privacidade</Link></li>
              <li><Link to="/termos" className="hover:text-primary transition-colors">Termos de Uso</Link></li>
              <li><Link to="/trocas" className="hover:text-primary transition-colors">Trocas e Devoluções</Link></li>
            </ul>
          </div>

          {/* Help */}
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

          {/* Contact */}
          <div>
            <h4 className="font-semibold mb-4">Contato</h4>
            <ul className="space-y-3 text-sm text-secondary-foreground/80">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <a href="tel:42991120205" className="hover:text-primary transition-colors">
                  42 99112-0205
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <a href="mailto:contato@vanessalimashoes.com.br" className="hover:text-primary transition-colors">
                  contato@vanessalimashoes.com.br
                </a>
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
            {/* Payment methods */}
            <div className="text-center md:text-left">
              <h4 className="font-semibold mb-3 text-xs uppercase tracking-wider">Formas de Pagamento</h4>
              <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                {['Visa', 'Mastercard', 'Elo', 'Hipercard', 'Amex', 'PIX', 'Boleto'].map((brand) => (
                  <span key={brand} className="bg-secondary-foreground/10 text-secondary-foreground/80 px-3 py-1.5 rounded text-xs font-medium">
                    {brand}
                  </span>
                ))}
              </div>
            </div>

            {/* Security seals */}
            <div className="text-center md:text-right">
              <h4 className="font-semibold mb-3 text-xs uppercase tracking-wider">Segurança</h4>
              <div className="flex gap-3 justify-center md:justify-end">
                <div className="flex items-center gap-2 bg-secondary-foreground/10 px-3 py-2 rounded-lg">
                  <span className="text-xs font-bold">🔒 SSL</span>
                </div>
                <div className="flex items-center gap-2 bg-secondary-foreground/10 px-3 py-2 rounded-lg">
                  <span className="text-xs font-bold">✅ Google Safe</span>
                </div>
                <div className="flex items-center gap-2 bg-secondary-foreground/10 px-3 py-2 rounded-lg">
                  <span className="text-xs font-bold">🛡️ Compra Segura</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Company info - single line */}
      <div className="bg-secondary-foreground/5">
        <div className="container-custom py-3">
          <p className="text-[10px] sm:text-xs text-secondary-foreground/50 text-center leading-relaxed">
            Vanessa S. de Lima Store · CNPJ: 19.947.968/0001-58 · Rua Professor Cleto - até 669/670, União da Vitória - PR, CEP: 84600140
          </p>
        </div>
      </div>

      {/* Credits */}
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
