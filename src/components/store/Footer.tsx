import { Link } from 'react-router-dom';
import { Instagram, Facebook, Phone, Mail, MapPin, Shield, CheckCircle } from 'lucide-react';
import logo from '@/assets/logo.png';

export function Footer() {
  return (
    <footer className="bg-secondary text-secondary-foreground">
      <div className="container-custom py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo and description */}
          <div className="space-y-4">
            <img src={logo} alt="Vanessa Lima Shoes" className="h-12 brightness-0 invert" />
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
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold mb-4">Contato</h4>
            <ul className="space-y-3 text-sm text-secondary-foreground/80">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <a href="tel:42991120205" className="hover:text-primary transition-colors">
                  (42) 99112-0205
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
                <span>Guarapuava - PR</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Payment methods & security seals */}
      <div className="border-t border-secondary-foreground/10">
        <div className="container-custom py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Payment methods */}
            <div className="text-center md:text-left">
              <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider">Formas de Pagamento</h4>
              <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                {['Visa', 'Mastercard', 'Elo', 'Hipercard', 'Amex', 'PIX'].map((brand) => (
                  <span key={brand} className="bg-secondary-foreground/10 text-secondary-foreground/80 px-3 py-1.5 rounded text-xs font-medium">
                    {brand}
                  </span>
                ))}
              </div>
            </div>

            {/* Security seals */}
            <div className="text-center md:text-right">
              <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider">Selos de Segurança</h4>
              <div className="flex gap-4 justify-center md:justify-end">
                <div className="flex items-center gap-2 bg-secondary-foreground/10 px-4 py-2 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <p className="text-xs font-bold">Google</p>
                    <p className="text-[10px] text-secondary-foreground/60">Site Seguro</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-secondary-foreground/10 px-4 py-2 rounded-lg">
                  <Shield className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <p className="text-xs font-bold">Loja Protegida</p>
                    <p className="text-[10px] text-secondary-foreground/60">Compra Segura</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-secondary-foreground/10">
        <div className="container-custom py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-secondary-foreground/60 text-center">
            <div>
              <p>© 2025 Vanessa Lima Shoes. Todos os direitos reservados.</p>
              <p className="text-xs mt-1">CNPJ: 00.000.000/0001-00 | Guarapuava - PR</p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
