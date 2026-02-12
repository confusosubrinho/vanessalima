import { StoreLayout } from '@/components/store/StoreLayout';
import { ContactForm } from '@/components/store/ContactForm';
import { Phone, Mail, MapPin, Clock, MessageCircle } from 'lucide-react';
import { useStoreContact, formatPhone, getWhatsAppNumber } from '@/hooks/useStoreContact';

export default function AtendimentoPage() {
  const { data: contact } = useStoreContact();
  const whatsappNum = getWhatsAppNumber(contact?.contact_whatsapp);
  const phoneDisplay = formatPhone(contact?.contact_phone || contact?.contact_whatsapp);

  return (
    <StoreLayout>
      <div className="container-custom py-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold mb-2">Central de Atendimento ao Cliente</h1>
            <p className="text-muted-foreground">Estamos aqui para ajudar você. Entre em contato pelos nossos canais ou preencha o formulário abaixo.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-6 mb-12">
            <div className="bg-muted/30 rounded-xl p-6 text-center space-y-3">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Phone className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold">Telefone / WhatsApp</h3>
              {contact?.contact_phone && (
                <a href={`tel:${contact.contact_phone.replace(/\D/g, '')}`} className="text-sm text-muted-foreground hover:text-primary block">
                  {phoneDisplay}
                </a>
              )}
            </div>
            <div className="bg-muted/30 rounded-xl p-6 text-center space-y-3">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold">E-mail</h3>
              {contact?.contact_email && (
                <a href={`mailto:${contact.contact_email}`} className="text-sm text-muted-foreground hover:text-primary block">
                  {contact.contact_email}
                </a>
              )}
            </div>
            <div className="bg-muted/30 rounded-xl p-6 text-center space-y-3">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold">Endereço</h3>
              <p className="text-sm text-muted-foreground">{contact?.full_address || contact?.address || 'Endereço não configurado'}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-6 text-center space-y-3">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold">Horário</h3>
              <p className="text-sm text-muted-foreground">Seg a Sex: 9h às 18h<br/>Sáb: 9h às 13h</p>
            </div>
          </div>

          {whatsappNum && (
            <div className="flex justify-center mb-12">
              <a
                href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent('Olá, preciso de ajuda!')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 bg-[hsl(142,70%,45%)] text-white px-8 py-4 rounded-full text-lg font-semibold hover:opacity-90 transition-opacity"
              >
                <MessageCircle className="h-6 w-6" />
                Falar pelo WhatsApp
              </a>
            </div>
          )}
        </div>
      </div>

      <ContactForm />
    </StoreLayout>
  );
}
