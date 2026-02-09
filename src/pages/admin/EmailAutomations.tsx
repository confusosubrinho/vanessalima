import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Mail, AlertTriangle, Clock, Pencil, Plus, Code, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface EmailAutomation {
  id: string;
  automation_type: string;
  trigger_event: string;
  delay_minutes: number;
  email_subject: string;
  email_body: string;
  is_active: boolean;
}

const typeLabels: Record<string, string> = {
  abandoned_cart: 'Carrinho Abandonado',
  birthday: 'Aniversário',
  post_purchase: 'Pós-Compra',
  welcome: 'Boas-vindas',
};

const triggerLabels: Record<string, string> = {
  cart_abandoned: 'Carrinho abandonado',
  customer_birthday: 'Data de aniversário',
  order_delivered: 'Pedido entregue',
  user_signup: 'Novo cadastro',
};

export default function EmailAutomations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingEmail, setEditingEmail] = useState<EmailAutomation | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [editMode, setEditMode] = useState<'visual' | 'html'>('visual');

  const [formData, setFormData] = useState({
    automation_type: 'welcome',
    trigger_event: 'user_signup',
    delay_minutes: 0,
    email_subject: '',
    email_body: '',
    is_active: false,
  });

  const { data: automations, isLoading } = useQuery({
    queryKey: ['email-automations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_automations')
        .select('*')
        .order('automation_type', { ascending: true });
      if (error) throw error;
      return data as EmailAutomation[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('email_automations')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-automations'] });
      toast({ title: 'Automação atualizada!' });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (editingEmail) {
        const { error } = await supabase
          .from('email_automations')
          .update(data)
          .eq('id', editingEmail.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('email_automations')
          .insert([data]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-automations'] });
      toast({ title: editingEmail ? 'Email atualizado!' : 'Automação criada!' });
      handleCloseDialog();
    },
    onError: (e: Error) => {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    },
  });

  const handleEdit = (auto: EmailAutomation) => {
    setEditingEmail(auto);
    setFormData({
      automation_type: auto.automation_type,
      trigger_event: auto.trigger_event,
      delay_minutes: auto.delay_minutes,
      email_subject: auto.email_subject,
      email_body: auto.email_body,
      is_active: auto.is_active,
    });
    setEditMode(auto.email_body.includes('<') ? 'html' : 'visual');
    setIsDialogOpen(true);
  };

  const handleNew = () => {
    setEditingEmail(null);
    setFormData({
      automation_type: 'welcome',
      trigger_event: 'user_signup',
      delay_minutes: 0,
      email_subject: '',
      email_body: '',
      is_active: false,
    });
    setEditMode('visual');
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingEmail(null);
  };

  const handlePreview = () => {
    setPreviewHtml(formData.email_body);
    setIsPreviewOpen(true);
  };

  const handleHtmlFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const html = ev.target?.result as string;
      setFormData(prev => ({ ...prev, email_body: html }));
      setEditMode('html');
      toast({ title: 'HTML carregado!' });
    };
    reader.readAsText(file);
  };

  const formatDelay = (minutes: number) => {
    if (minutes === 0) return 'Imediato';
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 1440)} dias`;
  };

  const triggerOptions: Record<string, string> = {
    welcome: 'user_signup',
    abandoned_cart: 'cart_abandoned',
    birthday: 'customer_birthday',
    post_purchase: 'order_delivered',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6" />
            Automações de Email
          </h1>
          <p className="text-muted-foreground">Configure disparos automáticos com templates HTML</p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Automação
        </Button>
      </div>

      <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-sm">Configuração pendente</p>
          <p className="text-sm text-muted-foreground">
            Para ativar os disparos, configure um serviço de email (Resend, SendGrid) nas Integrações. 
            Os templates podem ser editados e preparados agora.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Gatilho</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead>Delay</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ativar</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(automations || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhuma automação cadastrada. Clique em "Nova Automação".
                  </TableCell>
                </TableRow>
              ) : (
                (automations || []).map(auto => (
                  <TableRow key={auto.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {typeLabels[auto.automation_type] || auto.automation_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {triggerLabels[auto.trigger_event] || auto.trigger_event}
                    </TableCell>
                    <TableCell className="text-sm font-medium max-w-[200px] truncate">
                      {auto.email_subject}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDelay(auto.delay_minutes)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={auto.email_body?.includes('<') ? 'default' : 'secondary'}>
                        {auto.email_body?.includes('<') ? 'HTML' : 'Texto'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={auto.is_active ? 'default' : 'secondary'}>
                        {auto.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={auto.is_active}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: auto.id, is_active: checked })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(auto)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(o) => !o && handleCloseDialog()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEmail ? 'Editar Automação' : 'Nova Automação'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={formData.automation_type}
                  onValueChange={(v) => setFormData(prev => ({
                    ...prev,
                    automation_type: v,
                    trigger_event: triggerOptions[v] || prev.trigger_event,
                  }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="welcome">Boas-vindas</SelectItem>
                    <SelectItem value="abandoned_cart">Carrinho Abandonado</SelectItem>
                    <SelectItem value="birthday">Aniversário</SelectItem>
                    <SelectItem value="post_purchase">Pós-Compra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Delay (minutos)</Label>
                <Input
                  type="number"
                  value={formData.delay_minutes}
                  onChange={(e) => setFormData(prev => ({ ...prev, delay_minutes: parseInt(e.target.value) || 0 }))}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">0 = imediato, 60 = 1h, 1440 = 1 dia</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assunto do Email</Label>
              <Input
                value={formData.email_subject}
                onChange={(e) => setFormData(prev => ({ ...prev, email_subject: e.target.value }))}
                placeholder="Bem-vinda à Vanessa Lima! 🎉"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Conteúdo do Email</Label>
                <div className="flex gap-2">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".html,.htm"
                      className="hidden"
                      onChange={handleHtmlFileUpload}
                    />
                    <Button type="button" variant="outline" size="sm" asChild>
                      <span>
                        <Code className="h-3 w-3 mr-1" />
                        Upload HTML
                      </span>
                    </Button>
                  </label>
                  <Button type="button" variant="outline" size="sm" onClick={handlePreview} disabled={!formData.email_body}>
                    <Eye className="h-3 w-3 mr-1" />
                    Preview
                  </Button>
                </div>
              </div>

              <Tabs value={editMode} onValueChange={(v) => setEditMode(v as 'visual' | 'html')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="visual">Editor Visual</TabsTrigger>
                  <TabsTrigger value="html">Código HTML</TabsTrigger>
                </TabsList>
                <TabsContent value="visual">
                  <Textarea
                    value={formData.email_body}
                    onChange={(e) => setFormData(prev => ({ ...prev, email_body: e.target.value }))}
                    placeholder="Escreva o conteúdo do email... Use variáveis: {{nome}}, {{email}}, {{produtos}}"
                    rows={10}
                    required
                  />
                </TabsContent>
                <TabsContent value="html">
                  <Textarea
                    value={formData.email_body}
                    onChange={(e) => setFormData(prev => ({ ...prev, email_body: e.target.value }))}
                    placeholder="<html><body>Cole seu HTML aqui...</body></html>"
                    rows={15}
                    className="font-mono text-xs"
                    required
                  />
                </TabsContent>
              </Tabs>
              <p className="text-xs text-muted-foreground">
                Variáveis disponíveis: <code>{'{{nome}}'}</code>, <code>{'{{email}}'}</code>, <code>{'{{produtos}}'}</code>, <code>{'{{valor}}'}</code>, <code>{'{{link_carrinho}}'}</code>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(c) => setFormData(prev => ({ ...prev, is_active: c }))}
              />
              <Label>Ativo (só funciona com serviço de email configurado)</Label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>Cancelar</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Preview do Email</DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg overflow-auto bg-white" style={{ maxHeight: '60vh' }}>
            {previewHtml.includes('<') ? (
              <iframe
                srcDoc={previewHtml}
                className="w-full min-h-[400px] border-0"
                title="Email Preview"
                sandbox=""
              />
            ) : (
              <div className="p-6 whitespace-pre-wrap text-sm">{previewHtml}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
