import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDragReorder } from '@/hooks/useDragReorder';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { compressImageToWebP } from '@/lib/imageCompressor';
import { Plus, Pencil, Trash2, GripVertical, Upload, CreditCard, Shield } from 'lucide-react';

// ─── Payment Methods ───

interface PaymentMethod {
  id: string;
  name: string;
  image_url: string | null;
  link_url: string | null;
  display_order: number;
  is_active: boolean;
}

function PaymentMethodsSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ name: '', image_url: '', link_url: '', is_active: true });

  const { data: items, isLoading } = useQuery({
    queryKey: ['admin-payment-methods'],
    queryFn: async () => {
      const { data, error } = await supabase.from('payment_methods_display' as any).select('*').order('display_order');
      if (error) throw error;
      return (data as unknown as PaymentMethod[]) || [];
    },
  });

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      let uploadFile: File | Blob = file;
      let fileName = `payment/${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (file.type === 'image/svg+xml') {
        fileName += '.svg';
      } else {
        const r = await compressImageToWebP(file);
        uploadFile = r.file;
        fileName = r.fileName;
      }
      const { error } = await supabase.storage.from('product-media').upload(fileName, uploadFile);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-media').getPublicUrl(fileName);
      setForm(p => ({ ...p, image_url: publicUrl }));
      toast({ title: 'Logo enviado!' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setUploading(false); }
  }, [toast]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { name: form.name, image_url: form.image_url || null, link_url: form.link_url || null, is_active: form.is_active, display_order: editing?.display_order ?? (items?.length || 0) };
      if (editing) {
        const { error } = await supabase.from('payment_methods_display' as any).update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('payment_methods_display' as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payment-methods'] });
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      setIsOpen(false); reset();
      toast({ title: editing ? 'Atualizado!' : 'Criado!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payment_methods_display' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payment-methods'] });
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      toast({ title: 'Excluído!' });
    },
  });

  const reorder = useMutation({
    mutationFn: async (reordered: PaymentMethod[]) => {
      await Promise.all(reordered.map((item, i) =>
        supabase.from('payment_methods_display' as any).update({ display_order: i }).eq('id', item.id)
      ));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payment-methods'] });
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
    },
  });

  const { getDragProps } = useDragReorder({
    items: items || [],
    onReorder: (r) => { queryClient.setQueryData(['admin-payment-methods'], r); reorder.mutate(r); },
  });

  const reset = () => { setForm({ name: '', image_url: '', link_url: '', is_active: true }); setEditing(null); };

  const edit = (item: PaymentMethod) => {
    setEditing(item);
    setForm({ name: item.name, image_url: item.image_url || '', link_url: item.link_url || '', is_active: item.is_active });
    setIsOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Formas de Pagamento</h3>
          <p className="text-sm text-muted-foreground">Logos exibidos no rodapé da loja</p>
        </div>
        <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />Novo</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Nova Forma de Pagamento'}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
              <div><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="mt-1" /></div>
              <div>
                <Label>Logo (imagem ou SVG)</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="URL ou upload" />
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*,.svg" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                    <Button type="button" variant="outline" asChild><span><Upload className="h-4 w-4 mr-1" />{uploading ? '...' : 'Upload'}</span></Button>
                  </label>
                </div>
                {form.image_url && <img src={form.image_url} alt="" className="h-8 object-contain mt-2 rounded bg-muted p-1" />}
              </div>
              <div><Label>Link (opcional)</Label><Input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder="https://..." className="mt-1" /></div>
              <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(c) => setForm({ ...form, is_active: c })} /><Label>Ativo</Label></div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Salvando...' : 'Salvar'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground py-4">Carregando...</p> : !items?.length ? (
        <p className="text-sm text-muted-foreground py-4">Nenhuma forma de pagamento.</p>
      ) : (
        <div className="grid gap-2">
          {items.map((item, index) => (
            <Card key={item.id} className={!item.is_active ? 'opacity-50' : ''} {...getDragProps(index)}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="h-8 w-12 object-contain flex-shrink-0 rounded bg-muted p-1" />
                  ) : (
                    <div className="h-8 w-12 bg-muted rounded flex items-center justify-center flex-shrink-0">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <span className="flex-1 text-sm font-medium truncate">{item.name}</span>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => edit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => del.mutate(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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

// ─── Security Seals ───

interface SecuritySeal {
  id: string;
  title: string | null;
  image_url: string | null;
  html_code: string | null;
  link_url: string | null;
  display_order: number;
  is_active: boolean;
}

function SecuritySealsSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<SecuritySeal | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ title: '', image_url: '', html_code: '', link_url: '', is_active: true });

  const { data: items, isLoading } = useQuery({
    queryKey: ['admin-security-seals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('security_seals' as any).select('*').order('display_order');
      if (error) throw error;
      return (data as unknown as SecuritySeal[]) || [];
    },
  });

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      let uploadFile: File | Blob = file;
      let fileName = `seals/${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (file.type === 'image/svg+xml') { fileName += '.svg'; } else {
        const r = await compressImageToWebP(file);
        uploadFile = r.file; fileName = r.fileName;
      }
      const { error } = await supabase.storage.from('product-media').upload(fileName, uploadFile);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-media').getPublicUrl(fileName);
      setForm(p => ({ ...p, image_url: publicUrl }));
      toast({ title: 'Imagem enviada!' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setUploading(false); }
  }, [toast]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { title: form.title || null, image_url: form.image_url || null, html_code: form.html_code || null, link_url: form.link_url || null, is_active: form.is_active, display_order: editing?.display_order ?? (items?.length || 0) };
      if (editing) {
        const { error } = await supabase.from('security_seals' as any).update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('security_seals' as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-security-seals'] });
      queryClient.invalidateQueries({ queryKey: ['security-seals'] });
      setIsOpen(false); reset();
      toast({ title: editing ? 'Atualizado!' : 'Criado!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('security_seals' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-security-seals'] });
      queryClient.invalidateQueries({ queryKey: ['security-seals'] });
      toast({ title: 'Excluído!' });
    },
  });

  const reorder = useMutation({
    mutationFn: async (reordered: SecuritySeal[]) => {
      await Promise.all(reordered.map((item, i) =>
        supabase.from('security_seals' as any).update({ display_order: i }).eq('id', item.id)
      ));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-security-seals'] });
      queryClient.invalidateQueries({ queryKey: ['security-seals'] });
    },
  });

  const { getDragProps } = useDragReorder({
    items: items || [],
    onReorder: (r) => { queryClient.setQueryData(['admin-security-seals'], r); reorder.mutate(r); },
  });

  const reset = () => { setForm({ title: '', image_url: '', html_code: '', link_url: '', is_active: true }); setEditing(null); };

  const edit = (item: SecuritySeal) => {
    setEditing(item);
    setForm({ title: item.title || '', image_url: item.image_url || '', html_code: item.html_code || '', link_url: item.link_url || '', is_active: item.is_active });
    setIsOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Selos de Segurança</h3>
          <p className="text-sm text-muted-foreground">Selos exibidos no rodapé. Use imagem/SVG ou código HTML.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />Novo</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing ? 'Editar Selo' : 'Novo Selo'}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
              <div><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1" /></div>
              <div>
                <Label>Imagem/SVG</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="URL ou upload" />
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*,.svg" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                    <Button type="button" variant="outline" asChild><span><Upload className="h-4 w-4 mr-1" />{uploading ? '...' : 'Upload'}</span></Button>
                  </label>
                </div>
                {form.image_url && <img src={form.image_url} alt="" className="h-10 object-contain mt-2 rounded bg-muted p-1" />}
              </div>
              <div>
                <Label>Código HTML (alternativa à imagem)</Label>
                <Textarea value={form.html_code} onChange={(e) => setForm({ ...form, html_code: e.target.value })} placeholder="<img src=... />" className="mt-1 font-mono text-xs" rows={3} />
              </div>
              <div><Label>Link (opcional)</Label><Input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder="https://..." className="mt-1" /></div>
              <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(c) => setForm({ ...form, is_active: c })} /><Label>Ativo</Label></div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Salvando...' : 'Salvar'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground py-4">Carregando...</p> : !items?.length ? (
        <p className="text-sm text-muted-foreground py-4">Nenhum selo cadastrado.</p>
      ) : (
        <div className="grid gap-2">
          {items.map((item, index) => (
            <Card key={item.id} className={!item.is_active ? 'opacity-50' : ''} {...getDragProps(index)}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.title || ''} className="h-8 w-12 object-contain flex-shrink-0 rounded bg-muted p-1" />
                  ) : (
                    <div className="h-8 w-12 bg-muted rounded flex items-center justify-center flex-shrink-0">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title || (item.html_code ? 'HTML personalizado' : 'Sem título')}</p>
                    {item.link_url && <p className="text-xs text-primary truncate">{item.link_url}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => edit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => del.mutate(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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

// ─── Combined Export ───

export function FooterCustomizer() {
  return (
    <Tabs defaultValue="pagamento" className="space-y-4">
      <TabsList>
        <TabsTrigger value="pagamento" className="flex items-center gap-2"><CreditCard className="h-4 w-4" />Pagamento</TabsTrigger>
        <TabsTrigger value="selos" className="flex items-center gap-2"><Shield className="h-4 w-4" />Selos</TabsTrigger>
      </TabsList>
      <TabsContent value="pagamento"><PaymentMethodsSection /></TabsContent>
      <TabsContent value="selos"><SecuritySealsSection /></TabsContent>
    </Tabs>
  );
}
