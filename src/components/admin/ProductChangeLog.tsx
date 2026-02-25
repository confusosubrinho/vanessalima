import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ProductChangeLogProps {
  productId: string;
}

export function ProductChangeLog({ productId }: ProductChangeLogProps) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['product-change-log', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_change_log')
        .select('*')
        .eq('product_id', productId)
        .order('changed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!productId,
  });

  const typeLabels: Record<string, string> = {
    update: 'Editado',
    bulk_update: 'Edição em Massa',
    create: 'Criado',
    delete: 'Excluído',
    activate: 'Ativado',
    deactivate: 'Desativado',
  };

  const typeColors: Record<string, string> = {
    update: 'default',
    bulk_update: 'secondary',
    create: 'default',
    activate: 'default',
    deactivate: 'destructive',
  };

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Carregando histórico...</p>;
  if (!logs || logs.length === 0) return <p className="text-sm text-muted-foreground py-4">Nenhuma alteração registrada.</p>;

  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-3">
        {logs.map((log: any) => (
          <div key={log.id} className="border rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Badge variant={(typeColors[log.change_type] as any) || 'outline'}>
                {typeLabels[log.change_type] || log.change_type}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {format(new Date(log.changed_at), "dd/MM/yy HH:mm", { locale: ptBR })}
              </span>
            </div>
            {log.fields_changed && log.fields_changed.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Campos: {log.fields_changed.join(', ')}
              </p>
            )}
            {log.notes && (
              <p className="text-xs italic text-muted-foreground">{log.notes}</p>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
