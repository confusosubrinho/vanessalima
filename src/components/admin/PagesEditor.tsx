import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Pencil, FileText } from 'lucide-react';

interface PageContent {
  id: string;
  page_slug: string;
  page_title: string;
  content: string | null;
  meta_description: string | null;
}

const PAGE_LABELS: Record<string, string> = {
  'sobre': 'Sobre Nós',
  'faq': 'Perguntas Frequentes',
  'politica-privacidade': 'Política de Privacidade',
  'termos': 'Termos de Uso',
  'trocas': 'Trocas e Devoluções',
  'como-comprar': 'Como Comprar',
  'formas-pagamento': 'Formas de Pagamento',
  'atendimento': 'Central de Atendimento',
  'rastreio': 'Rastrear Pedido',
};

export function PagesEditor() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<PageContent | null>(null);
  const [form, setForm] = useState({ page_title: '', content: '', meta_description: '' });

  const { data: pages, isLoading } = useQuery({
    queryKey: ['admin-page-contents'],
    queryFn: async () => {
      const { data, error } = await supabase.from('page_contents').select('*').order('page_slug');
      if (error) throw error;
      return (data as unknown as PageContent[]) || [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase.from('page_contents')
        .update({ page_title: form.page_title, content: form.content || null, meta_description: form.meta_description || null })
        .eq('id', editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-page-contents'] });
      queryClient.invalidateQueries({ queryKey: ['page-content'] });
      setEditing(null);
      toast({ title: 'Página atualizada!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const handleEdit = (page: PageContent) => {
    setEditing(page);
    setForm({
      page_title: page.page_title,
      content: page.content || '',
      meta_description: page.meta_description || '',
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Páginas Institucionais</h3>
        <p className="text-sm text-muted-foreground">Edite os textos e conteúdos das páginas de ajuda e institucionais</p>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground py-4">Carregando...</p> : !pages?.length ? (
        <p className="text-sm text-muted-foreground py-4">Nenhuma página cadastrada.</p>
      ) : (
        <div className="grid gap-2">
          {pages.map((page) => (
            <Card key={page.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{PAGE_LABELS[page.page_slug] || page.page_title}</p>
                    <p className="text-xs text-muted-foreground">/{page.page_slug}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {page.content ? (
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">Personalizado</span>
                    ) : (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">Padrão</span>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(page)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        💡 Páginas com conteúdo "Personalizado" usam o texto definido aqui. Páginas "Padrão" usam o conteúdo original do código. O conteúdo suporta HTML básico.
      </p>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar: {editing && (PAGE_LABELS[editing.page_slug] || editing.page_title)}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
            <div><Label>Título da Página</Label><Input value={form.page_title} onChange={(e) => setForm({ ...form, page_title: e.target.value })} className="mt-1" /></div>
            <div><Label>Meta Descrição (SEO)</Label><Input value={form.meta_description} onChange={(e) => setForm({ ...form, meta_description: e.target.value })} className="mt-1" placeholder="Descrição para mecanismos de busca" /></div>
            <div>
              <Label>Conteúdo (HTML suportado)</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="mt-1 font-mono text-xs min-h-[300px]"
                placeholder="Digite o conteúdo da página aqui. Você pode usar HTML para formatação."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
