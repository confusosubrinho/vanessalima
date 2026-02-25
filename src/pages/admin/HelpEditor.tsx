import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useHelpArticles, HelpArticle } from '@/hooks/useHelpArticle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { HelpCircle, Plus, Pencil, Search, Save, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function HelpEditor() {
  const { data: articles, isLoading } = useHelpArticles();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HelpArticle | null>(null);
  const [form, setForm] = useState({ key: '', title: '', content: '', audience: 'both' });

  const filtered = articles?.filter(a =>
    a.key.toLowerCase().includes(search.toLowerCase()) ||
    a.title.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase
          .from('help_articles')
          .update({ title: form.title, content: form.content, audience: form.audience } as any)
          .eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('help_articles')
          .insert(form as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['help-articles'] });
      queryClient.invalidateQueries({ queryKey: ['help-article'] });
      toast({ title: editing ? 'Artigo atualizado!' : 'Artigo criado!' });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (error: any) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('help_articles')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['help-articles'] });
      toast({ title: 'Artigo removido!' });
    },
  });

  const openNew = () => {
    setEditing(null);
    setForm({ key: '', title: '', content: '', audience: 'both' });
    setDialogOpen(true);
  };

  const openEdit = (article: HelpArticle) => {
    setEditing(article);
    setForm({ key: article.key, title: article.title, content: article.content, audience: article.audience });
    setDialogOpen(true);
  };

  const audienceLabel = (a: string) => {
    switch (a) {
      case 'store': return 'Loja';
      case 'admin': return 'Admin';
      default: return 'Ambos';
    }
  };

  const audienceColor = (a: string) => {
    switch (a) {
      case 'store': return 'bg-primary/10 text-primary';
      case 'admin': return 'bg-accent/10 text-accent-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (isLoading) return <div className="text-center py-8">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2">
            <HelpCircle className="h-6 w-6" />
            Central de Ajuda
          </h1>
          <p className="text-muted-foreground">Gerencie os artigos de ajuda contextual do site</p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Novo Artigo
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por chave ou título..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid gap-3">
        {filtered.map(article => (
          <Card key={article.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="flex items-center justify-between py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{article.key}</code>
                  <Badge variant="outline" className={audienceColor(article.audience)}>
                    {audienceLabel(article.audience)}
                  </Badge>
                </div>
                <p className="font-medium text-sm">{article.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Atualizado em {format(new Date(article.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
              <div className="flex gap-1 ml-4">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(article)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => {
                    if (confirm('Remover este artigo de ajuda?')) deleteMutation.mutate(article.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {search ? 'Nenhum artigo encontrado.' : 'Nenhum artigo cadastrado ainda.'}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Artigo' : 'Novo Artigo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Chave (única)</Label>
                <Input
                  value={form.key}
                  onChange={e => setForm(prev => ({ ...prev, key: e.target.value }))}
                  placeholder="admin.products.bulk_edit"
                  disabled={!!editing}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label>Audiência</Label>
                <Select value={form.audience} onValueChange={v => setForm(prev => ({ ...prev, audience: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">Loja</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="both">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Título</Label>
              <Input
                value={form.title}
                onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Título do artigo"
              />
            </div>

            <div>
              <Label>Conteúdo (Markdown)</Label>
              <Textarea
                value={form.content}
                onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
                placeholder="## Título&#10;&#10;Conteúdo em markdown..."
                className="min-h-[300px] font-mono text-sm"
              />
            </div>

            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.key || !form.title || saveMutation.isPending}
              className="w-full"
            >
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
