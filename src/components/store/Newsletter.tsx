import { useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export function Newsletter() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);
    setTimeout(() => {
      toast({
        title: '🎉 Cadastro realizado!',
        description: 'Você receberá seu cupom de 5% de desconto no email.',
      });
      setEmail('');
      setIsLoading(false);
    }, 800);
  };

  return (
    <section className="py-16 bg-[hsl(0,0%,12%)] text-white">
      <div className="container-custom">
        <div className="max-w-2xl mx-auto text-center">
          <Mail className="h-10 w-10 mx-auto mb-4 text-primary" />
          <h2 className="text-2xl md:text-3xl font-bold mb-2">
            Ganhe 5% de desconto
          </h2>
          <p className="text-white/70 mb-6">
            Assine nossa newsletter e receba um cupom exclusivo de 5% de desconto na sua primeira compra!
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
