import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem('cookie-consent');
    if (!accepted) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = () => {
    localStorage.setItem('cookie-consent', 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 animate-fade-in">
      <div className="bg-background border border-border rounded-xl shadow-lg p-4 space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Usamos cookies para melhorar sua experiência. Ao continuar navegando, você concorda com nossa{' '}
          <a href="/politica-privacidade" className="text-primary underline underline-offset-2">
            Política de Privacidade
          </a>.
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={accept} className="flex-1">
            Aceitar
          </Button>
          <Button size="sm" variant="outline" onClick={accept}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
