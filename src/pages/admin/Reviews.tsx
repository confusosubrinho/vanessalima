import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Star, CheckCircle, XCircle, MessageSquare, ExternalLink, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ReviewRow {
  id: string;
  product_id: string;
  customer_name: string;
  rating: number;
  title: string | null;
  comment: string | null;
  status: string;
  admin_reply: string | null;
  replied_at: string | null;
  is_verified_purchase: boolean;
  created_at: string;
  products?: { name: string; slug: string; } | null;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  pending: { label: 'Pendente', variant: 'secondary' },
  published: { label: 'Publicada', variant: 'default' },
  rejected: { label: 'Rejeitada', variant: 'destructive' },
};

export default function Reviews() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const { data: reviews, isLoading } = useQuery({
    queryKey: ['admin-reviews', statusFilter, ratingFilter, search],
    queryFn: async () => {
      let q: any = supabase
        .from('product_reviews')
        .select('*, products(name, slug)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (ratingFilter !== 'all') q = q.eq('rating', Number(ratingFilter));
      if (search) q = q.or(`customer_name.ilike.%${search}%,comment.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as ReviewRow[]) || [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const { error } = await supabase.from('product_reviews').update({ status } as any).in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-reviews'] });
      qc.invalidateQueries({ queryKey: ['pending-reviews-count'] });
      setSelected(new Set());
      toast({ title: 'Avaliações atualizadas!' });
    },
  });

  const submitReply = useMutation({
    mutationFn: async ({ id, reply }: { id: string; reply: string }) => {
      const { error } = await supabase.from('product_reviews')
        .update({ admin_reply: reply, replied_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-reviews'] });
      setReplyingId(null);
      setReplyText('');
      toast({ title: 'Resposta enviada!' });
    },
  });

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const renderStars = (count: number) => (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(s => (
        <Star key={s} className={`h-3.5 w-3.5 ${s <= count ? 'fill-yellow-400 text-yellow-400' : 'text-muted'}`} />
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-3xl font-bold">Avaliações</h1>
        <p className="text-sm text-muted-foreground">Modere e responda avaliações dos clientes</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por cliente ou texto..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="published">Publicadas</SelectItem>
            <SelectItem value="rejected">Rejeitadas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ratingFilter} onValueChange={setRatingFilter}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Notas</SelectItem>
            {[5,4,3,2,1].map(r => <SelectItem key={r} value={String(r)}>{r}★</SelectItem>)}
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <>
            <Button size="sm" onClick={() => updateStatus.mutate({ ids: [...selected], status: 'published' })}>
              <CheckCircle className="h-4 w-4 mr-1" />Publicar ({selected.size})
            </Button>
            <Button size="sm" variant="destructive" onClick={() => updateStatus.mutate({ ids: [...selected], status: 'rejected' })}>
              <XCircle className="h-4 w-4 mr-1" />Rejeitar ({selected.size})
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-24"/>)}</div>
      ) : !reviews?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground"><Star className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>Nenhuma avaliação encontrada</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {reviews.map(r => (
            <Card key={r.id} className={r.status === 'pending' ? 'border-yellow-300' : r.status === 'rejected' ? 'opacity-60' : ''}>
              <CardContent className="p-3 md:p-4">
                <div className="flex items-start gap-3">
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} className="mt-1" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{r.customer_name}</span>
                      {renderStars(r.rating)}
                      <Badge variant={STATUS_BADGE[r.status]?.variant || 'secondary'} className="text-[10px]">
                        {STATUS_BADGE[r.status]?.label || r.status}
                      </Badge>
                      {r.is_verified_purchase && <Badge variant="outline" className="text-[10px]">Compra verificada</Badge>}
                    </div>
                    {r.products && <p className="text-xs text-muted-foreground">Produto: {(r.products as any).name}</p>}
                    {r.title && <p className="text-sm font-medium">{r.title}</p>}
                    <p className="text-sm text-muted-foreground">{r.comment}</p>
                    {r.admin_reply && (
                      <div className="bg-muted/50 rounded-lg p-2 mt-2 text-xs">
                        <span className="font-semibold">Resposta da loja:</span> {r.admin_reply}
                      </div>
                    )}
                    {replyingId === r.id && (
                      <div className="flex gap-2 mt-2">
                        <Textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Sua resposta..." className="text-sm min-h-[60px]" />
                        <div className="flex flex-col gap-1">
                          <Button size="sm" onClick={() => submitReply.mutate({ id: r.id, reply: replyText })} disabled={!replyText.trim()}>Enviar</Button>
                          <Button size="sm" variant="ghost" onClick={() => setReplyingId(null)}>Cancelar</Button>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span>{format(new Date(r.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {r.status !== 'published' && (
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => updateStatus.mutate({ ids: [r.id], status: 'published' })}>
                        <CheckCircle className="h-3 w-3 mr-1" />Publicar
                      </Button>
                    )}
                    {r.status !== 'rejected' && (
                      <Button size="sm" variant="outline" className="text-xs h-7 text-destructive" onClick={() => updateStatus.mutate({ ids: [r.id], status: 'rejected' })}>
                        <XCircle className="h-3 w-3 mr-1" />Rejeitar
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setReplyingId(r.id); setReplyText(r.admin_reply || ''); }}>
                      <MessageSquare className="h-3 w-3 mr-1" />Responder
                    </Button>
                    {r.products && (
                      <a href={`/produto/${(r.products as any).slug}`} target="_blank" rel="noopener">
                        <Button size="sm" variant="ghost" className="text-xs h-7 w-full"><ExternalLink className="h-3 w-3 mr-1" />Ver</Button>
                      </a>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
