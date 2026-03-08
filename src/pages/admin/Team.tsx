import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Trash2 } from 'lucide-react';
import { ROLE_LABELS, ROLE_COLORS, type AdminRole } from '@/lib/permissions';
import { logAudit } from '@/lib/auditLogger';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Team() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<AdminRole>('operator');

  const { data: members, isLoading } = useQuery({
    queryKey: ['admin-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_members')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.from('admin_members').insert({
        email: email.toLowerCase(),
        full_name: fullName || null,
        role,
        invited_by: session?.user?.id || null,
      });
      if (error) throw error;
      await logAudit({ action: 'create', resourceType: 'admin_member', resourceName: email, newValues: { role } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-members'] });
      setDialogOpen(false);
      setEmail('');
      setFullName('');
      setRole('operator');
      toast({ title: 'Membro adicionado!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase.from('admin_members').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-members'] });
      toast({ title: 'Atualizado!' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('admin_members').delete().eq('id', id);
      if (error) throw error;
      await logAudit({ action: 'delete', resourceType: 'admin_member', resourceId: id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-members'] });
      toast({ title: 'Membro removido!' });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-3xl font-bold">Equipe & Acessos</h1>
          <p className="text-sm text-muted-foreground">Gerencie quem pode acessar o painel administrativo</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size={isMobile ? 'sm' : 'default'}><UserPlus className="h-4 w-4 mr-2" />Convidar</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Convidar Membro</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); inviteMutation.mutate(); }} className="space-y-4">
              <div><Label>Email *</Label><Input value={email} onChange={e => setEmail(e.target.value)} required type="email" /></div>
              <div><Label>Nome</Label><Input value={fullName} onChange={e => setFullName(e.target.value)} /></div>
              <div>
                <Label>Função</Label>
                <Select value={role} onValueChange={v => setRole(v as AdminRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Gerente</SelectItem>
                    <SelectItem value="operator">Operador</SelectItem>
                    <SelectItem value="viewer">Visualizador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? 'Salvando...' : 'Convidar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : members?.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">Nenhum membro cadastrado</div>
      ) : isMobile ? (
        <div className="space-y-3">
          {members?.map(m => (
            <div key={m.id} className="bg-background border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                  {(m.full_name || m.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{m.full_name || '—'}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                </div>
                <Badge className={ROLE_COLORS[m.role as AdminRole] || 'bg-muted'}>
                  {ROLE_LABELS[m.role as AdminRole] || m.role}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {m.last_access
                    ? `Último acesso: ${formatDistanceToNow(new Date(m.last_access), { addSuffix: true, locale: ptBR })}`
                    : 'Nunca acessou'}
                </span>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={m.is_active}
                    onCheckedChange={c => updateMutation.mutate({ id: m.id, updates: { is_active: c } })}
                    disabled={m.role === 'owner'}
                  />
                  {m.role !== 'owner' && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive h-8 w-8">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover membro?</AlertDialogTitle>
                          <AlertDialogDescription>
                            O membro <strong>{m.full_name || m.email}</strong> será removido permanentemente da equipe.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(m.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-background rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membro</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Último Acesso</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members?.map(m => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {(m.full_name || m.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{m.full_name || '—'}</p>
                        <p className="text-xs text-muted-foreground">{m.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={m.role}
                      onValueChange={v => updateMutation.mutate({ id: m.id, updates: { role: v } })}
                      disabled={m.role === 'owner'}
                    >
                      <SelectTrigger className="w-[140px]">
                        <Badge className={ROLE_COLORS[m.role as AdminRole] || 'bg-muted'}>
                          {ROLE_LABELS[m.role as AdminRole] || m.role}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manager">Gerente</SelectItem>
                        <SelectItem value="operator">Operador</SelectItem>
                        <SelectItem value="viewer">Visualizador</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {m.last_access
                      ? formatDistanceToNow(new Date(m.last_access), { addSuffix: true, locale: ptBR })
                      : 'Nunca'}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={m.is_active}
                      onCheckedChange={c => updateMutation.mutate({ id: m.id, updates: { is_active: c } })}
                      disabled={m.role === 'owner'}
                    />
                  </TableCell>
                  <TableCell>
                    {m.role !== 'owner' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover membro?</AlertDialogTitle>
                            <AlertDialogDescription>
                              O membro <strong>{m.full_name || m.email}</strong> será removido permanentemente da equipe.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(m.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
