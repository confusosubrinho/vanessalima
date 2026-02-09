import { StoreLayout } from '@/components/store/StoreLayout';
import { Heart, Award, Truck, Shield } from 'lucide-react';

export default function SobrePage() {
  return (
    <StoreLayout>
      <div className="container-custom py-12">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Sobre a Vanessa Lima Shoes</h1>
          
          <div className="prose prose-lg max-w-none space-y-6 text-muted-foreground">
            <p>
              A <strong className="text-foreground">Vanessa Lima Shoes</strong> nasceu da paixão por calçados femininos de alta qualidade. 
              Nossa missão é oferecer sapatos que combinam estilo, conforto e durabilidade, 
              feitos com couro legítimo e acabamento impecável.
            </p>
            <p>
              Localizada em Guarapuava - PR, atendemos clientes de todo o Brasil através da nossa 
              loja virtual e WhatsApp. Cada peça é cuidadosamente selecionada para garantir que 
              você encontre o calçado perfeito para qualquer ocasião.
            </p>
            <p>
              Acreditamos que um bom calçado tem o poder de transformar o seu dia. Por isso, 
              investimos em qualidade, design e atendimento personalizado para que sua experiência 
              de compra seja única.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-12">
            {[
              { icon: Heart, title: 'Paixão', desc: 'Por calçados femininos' },
              { icon: Award, title: 'Qualidade', desc: 'Couro legítimo' },
              { icon: Truck, title: 'Entrega', desc: 'Para todo o Brasil' },
              { icon: Shield, title: 'Segurança', desc: 'Compra protegida' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center">
                <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}
