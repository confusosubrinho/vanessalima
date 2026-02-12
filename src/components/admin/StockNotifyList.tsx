import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Bell, Mail, MessageCircle, Send, CheckCircle2 } from 'lucide-react';

interface StockNotifyListProps {
  productId: string;
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockNotifyList({ productId, productName, open, onOpenChange }: StockNotifyListProps) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  const { data: notifications, refetch } = useQuery({
    queryKey: ['stock-notifications', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_notifications' as any)
        .select('*')
        .eq('product_id', productId)
        .eq('is_notified', false)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    enabled: open,
  });

  const { data: notifiedCount } = useQuery({
    queryKey: ['stock-notifications-notified', productId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('stock_notifications' as any)
        .select('*', { count: 'exact', head: true })
        .eq('product_id', productId)
        .eq('is_notified', true);
      if (error) throw error;
      return count || 0;
    },
    enabled: open,
  });

  const handleMarkNotified = async (ids: string[]) => {
    setSending(true);
    try {
      const { error } = await supabase
        .from('stock_notifications' as any)
        .update({ is_notified: true, notified_at: new Date().toISOString(), status: 'notified' } as any)
        .in('id', ids);

      if (error) throw error;

      toast({
        title: `${ids.length} notificação(ões) marcada(s) como enviada(s)`,
        description: 'Quando integrar o Resend, os e-mails serão disparados automaticamente.',
      });
      refetch();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const pendingCount = notifications?.length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Interessados - {productName}
          </DialogTitle>
          <DialogDescription>
            {pendingCount} pendente(s) · {notifiedCount} já notificado(s)
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2">
          {pendingCount === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum interessado pendente para este produto.
            </p>
          ) : (
            notifications?.map((n: any) => (
              <div key={n.id} className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {n.email && (
                      <span className="flex items-center gap-1 text-sm">
                        <Mail className="h-3 w-3" /> {n.email}
                      </span>
                    )}
                    {n.whatsapp && (
                      <span className="flex items-center gap-1 text-sm">
                        <MessageCircle className="h-3 w-3" /> {n.whatsapp}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {n.variant_info && (
                      <Badge variant="outline" className="text-xs">{n.variant_info}</Badge>
                    )}
                    {n.desired_price && (
                      <Badge variant="secondary" className="text-xs">
                        Quer por R$ {Number(n.desired_price).toFixed(2)}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sending}
                  onClick={() => handleMarkNotified([n.id])}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>

        {pendingCount > 0 && (
          <div className="border-t pt-3 flex gap-2">
            <Button
              className="flex-1"
              disabled={sending}
              onClick={() => handleMarkNotified(notifications!.map((n: any) => n.id))}
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? 'Processando...' : `Marcar todos como notificados (${pendingCount})`}
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          💡 Integre o Resend para disparar e-mails automaticamente ao marcar como notificado.
        </p>
      </DialogContent>
    </Dialog>
  );
}
