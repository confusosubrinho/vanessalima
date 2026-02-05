 import { Link } from 'react-router-dom';
 import { Instagram, Facebook, Phone, Mail, MapPin } from 'lucide-react';
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
               <li><Link to="/rastrear-pedido" className="hover:text-primary transition-colors">Rastrear Pedido</Link></li>
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
 
       {/* Bottom bar */}
       <div className="border-t border-secondary-foreground/10">
         <div className="container-custom py-4">
           <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-secondary-foreground/60">
             <p>© 2025 Vanessa Lima Shoes. Todos os direitos reservados.</p>
             <div className="flex items-center gap-4">
               <img src="https://images.tcdn.com.br/files/1313274/themes/5/img/settings/stripe-new-card.png" alt="Cartões" className="h-6" />
             </div>
           </div>
         </div>
       </div>
     </footer>
   );
 }