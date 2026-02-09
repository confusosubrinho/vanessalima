import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorLog {
  id: string;
  error_type: string;
  error_message: string;
  severity: string;
  page_url: string;
  created_at: string;
  is_resolved: boolean;
}

export function AdminErrorIndicator() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data } = await supabase.rpc('is_admin');
      setIsAdmin(!!data);
    };
    checkAdmin();
  }, []);

  const { data: errors } = useQuery({
    queryKey: ['admin-errors-indicator'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('error_logs' as any)
        .select('*')
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) return [];
      return (data as unknown as ErrorLog[]) || [];
    },
    enabled: isAdmin,
    refetchInterval: 30000, // refresh every 30s
  });

  if (!isAdmin || !errors?.length || isDismissed) return null;

  const criticalCount = errors.filter(e => e.severity === 'critical' || e.severity === 'error').length;
  const warningCount = errors.filter(e => e.severity === 'warning').length;

  return (
    <div className="fixed bottom-4 right-4 z-[100] max-w-sm">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg hover:bg-red-700 transition-colors text-sm font-medium"
        >
          <AlertTriangle className="h-4 w-4" />
          {criticalCount > 0 && <span>{criticalCount} erro(s)</span>}
          {warningCount > 0 && <span>{warningCount} aviso(s)</span>}
          <ChevronUp className="h-3 w-3" />
        </button>
      ) : (
        <div className="bg-background border border-destructive/30 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between bg-destructive/10 px-4 py-2">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Erros do Sistema (Admin)
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
                <ChevronDown className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsDismissed(true)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-3 space-y-2">
            {errors.map((err) => (
              <div key={err.id} className={`text-xs p-2 rounded border-l-2 ${
                err.severity === 'critical' ? 'border-l-red-500 bg-red-50' :
                err.severity === 'error' ? 'border-l-orange-500 bg-orange-50' :
                'border-l-yellow-500 bg-yellow-50'
              }`}>
                <div className="font-medium text-foreground truncate">{err.error_message}</div>
                <div className="text-muted-foreground mt-0.5">
                  {err.error_type} · {new Date(err.created_at).toLocaleString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
          <div className="px-3 py-2 border-t">
            <a href="/admin/configuracoes" className="text-xs text-primary hover:underline font-medium">
              Ver todos os logs →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
