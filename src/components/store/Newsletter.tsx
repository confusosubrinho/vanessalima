import { useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export function Newsletter() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('newsletter_subscribers' as any)
        .insert({ email: email.toLowerCase().trim(), source: 'website' } as any);

      if (error) {
        // Unique constraint = already subscribed
        if (error.code === '23505') {
        toast({
          title: '📧 Você já está cadastrado!',
          description: 'Este email já está recebendo nossas novidades.',
        });
        } else {
          throw error;
        }
      } else {
        toast({
          title: '🎉 Cadastro realizado!',
          description: 'Você receberá seu cupom de 5% de desconto no email.',
        });
      }
      setEmail('');
    } catch {
      toast({
        title: 'Erro ao cadastrar',
        description: 'Tente novamente em alguns instantes.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="py-10 sm:py-16 bg-[hsl(0,0%,12%)] text-white">
      <div className="container-custom">
        <div className="max-w-2xl mx-auto text-center px-2">
          <Mail className="h-8 w-8 sm:h-10 sm:w-10 mx-auto mb-3 sm:mb-4 text-primary" />
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2">
            Receba novidades e ofertas exclusivas
          </h2>
          <p className="text-white/70 mb-4 sm:mb-6 text-sm sm:text-base">
            Assine nossa newsletter e fique por dentro dos lançamentos e promoções!
          </p>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <Input
              type="email"
              placeholder="Seu melhor email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50 rounded-full"
              required
            />
            <Button
              type="submit"
              disabled={isLoading}
              className="rounded-full px-8"
            >
              {isLoading ? 'Enviando...' : 'Quero meu cupom!'}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
