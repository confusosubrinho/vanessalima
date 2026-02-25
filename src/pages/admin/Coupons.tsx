import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Pencil, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Coupon } from '@/types/database';
import { logAudit } from '@/lib/auditLogger';
import { exportToCSV } from '@/lib/csv';

export default function Coupons() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [activeTab, setActiveTab] = useState('list');

  // Bulk generation state
  const [bulkPrefix, setBulkPrefix] = useState('');
  const [bulkCount, setBulkCount] = useState('10');
  const [bulkDiscountType, setBulkDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [bulkDiscountValue, setBulkDiscountValue] = useState('');
  const [bulkMaxUses, setBulkMaxUses] = useState('1');
  const [bulkExpiry, setBulkExpiry] = useState('');
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [generatedCoupons, setGeneratedCoupons] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    code: '',
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: '',
    min_purchase_amount: '',
    max_uses: '',
    expiry_date: '',
    is_active: true,
    type: 'standard' as 'standard' | 'free_shipping' | 'first_purchase',
    applicable_category_id: '' as string,
    applicable_states: '', // UFs separadas por vírgula, ex: SP, RJ
    applicable_zip_prefixes: '', // CEP prefixos 5 dígitos separados por vírgula
    applicable_product_ids_raw: '', // UUIDs separados por vírgula
  });

  const { data: coupons, isLoading } = useQuery({
    queryKey: ['admin-coupons'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Coupon[];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['categories-list'],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('id, name').eq('is_active', true).order('name');
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const parseList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
      const zipPrefixes = parseList(data.applicable_zip_prefixes).map((z) => z.replace(/\D/g, '').slice(0, 5)).filter(Boolean);
      const couponData: Record<string, unknown> = {
        code: data.code.toUpperCase(),
        discount_type: data.discount_type,
        discount_value: data.type === 'free_shipping' ? 0 : parseFloat(data.discount_value),
        min_purchase_amount: data.min_purchase_amount ? parseFloat(data.min_purchase_amount) : 0,
        max_uses: data.max_uses ? parseInt(data.max_uses) : null,
        expiry_date: data.expiry_date || null,
        is_active: data.is_active,
        type: data.type,
        applicable_category_id: data.applicable_category_id || null,
        applicable_states: parseList(data.applicable_states).length > 0 ? parseList(data.applicable_states).map((s) => s.toUpperCase().slice(0, 2)) : null,
        applicable_zip_prefixes: zipPrefixes.length > 0 ? zipPrefixes : null,
        applicable_product_ids: parseList(data.applicable_product_ids_raw).length > 0 ? parseList(data.applicable_product_ids_raw) : null,
      };

      if (editingCoupon) {
        const { error } = await supabase.from('coupons').update(couponData).eq('id', editingCoupon.id);
        if (error) throw error;
        await logAudit({ action: 'update', resourceType: 'coupon', resourceId: editingCoupon.id, resourceName: String(couponData.code) });
      } else {
        const { error } = await supabase.from('coupons').insert(couponData as any);
        if (error) throw error;
        await logAudit({ action: 'create', resourceType: 'coupon', resourceName: String(couponData.code) });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: editingCoupon ? 'Cupom atualizado!' : 'Cupom criado!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('coupons').delete().eq('id', id);
      if (error) throw error;
      await logAudit({ action: 'delete', resourceType: 'coupon', resourceId: id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      toast({ title: 'Cupom excluído!' });
    },
  });

  const resetForm = () => {
    setFormData({
      code: '', discount_type: 'percentage', discount_value: '', min_purchase_amount: '',
      max_uses: '', expiry_date: '', is_active: true, type: 'standard', applicable_category_id: '',
      applicable_states: '', applicable_zip_prefixes: '', applicable_product_ids_raw: '',
    });
    setEditingCoupon(null);
  };

  const handleEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    const states = (coupon as { applicable_states?: string[] }).applicable_states;
    const zips = (coupon as { applicable_zip_prefixes?: string[] }).applicable_zip_prefixes;
    const productIds = (coupon as { applicable_product_ids?: string[] }).applicable_product_ids;
    setFormData({
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      min_purchase_amount: coupon.min_purchase_amount ? String(coupon.min_purchase_amount) : '',
      max_uses: coupon.max_uses ? String(coupon.max_uses) : '',
      expiry_date: coupon.expiry_date ? coupon.expiry_date.split('T')[0] : '',
      is_active: coupon.is_active,
      type: ((coupon as any).type || 'standard') as 'standard' | 'free_shipping' | 'first_purchase',
      applicable_category_id: (coupon as { applicable_category_id?: string }).applicable_category_id || '',
      applicable_states: Array.isArray(states) ? states.join(', ') : '',
      applicable_zip_prefixes: Array.isArray(zips) ? zips.join(', ') : '',
      applicable_product_ids_raw: Array.isArray(productIds) ? productIds.join(', ') : '',
    });
    setIsDialogOpen(true);
  };

  const handleBulkGenerate = async () => {
    if (!bulkPrefix || !bulkDiscountValue || !bulkCount) return;
    const count = Math.min(parseInt(bulkCount), 500);
    setBulkGenerating(true);
    try {
      const couponsToInsert = [];
      for (let i = 1; i <= count; i++) {
        couponsToInsert.push({
          code: `${bulkPrefix.toUpperCase()}${String(i).padStart(3, '0')}`,
          discount_type: bulkDiscountType,
          discount_value: parseFloat(bulkDiscountValue),
          max_uses: bulkMaxUses ? parseInt(bulkMaxUses) : null,
          expiry_date: bulkExpiry || null,
          is_active: true,
          is_bulk: true,
          bulk_prefix: bulkPrefix.toUpperCase(),
          bulk_count: count,
        });
      }
      const { error } = await supabase.from('coupons').insert(couponsToInsert);
      if (error) throw error;
      setGeneratedCoupons(couponsToInsert);
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      toast({ title: `${count} cupons gerados com sucesso!` });
      await logAudit({ action: 'create', resourceType: 'coupon', resourceName: `Lote ${bulkPrefix} (${count})` });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setBulkGenerating(false);
    }
  };

  const formatPrice = (price: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

  const TYPE_LABELS: Record<string, string> = {
    standard: 'Padrão',
    free_shipping: 'Frete Grátis',
    first_purchase: '1ª Compra',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cupons</h1>
          <p className="text-muted-foreground">Gerencie os cupons de desconto</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Novo Cupom</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingCoupon ? 'Editar Cupom' : 'Novo Cupom'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-4">
              <div>
                <Label>Código *</Label>
                <Input value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })} placeholder="DESCONTO10" required />
              </div>
              <div>
                <Label>Tipo de Cupom</Label>
                <Select value={formData.type} onValueChange={v => setFormData({ ...formData, type: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Desconto Padrão</SelectItem>
                    <SelectItem value="free_shipping">Frete Grátis</SelectItem>
                    <SelectItem value="first_purchase">Primeira Compra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.type !== 'free_shipping' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Tipo de Desconto</Label>
                    <Select value={formData.discount_type} onValueChange={v => setFormData({ ...formData, discount_type: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                        <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Valor *</Label>
                    <Input type="number" step="0.01" value={formData.discount_value} onChange={e => setFormData({ ...formData, discount_value: e.target.value })} required />
                  </div>
                </div>
              )}
              <div>
                <Label>Aplicável apenas à categoria</Label>
                <Select value={formData.applicable_category_id} onValueChange={v => setFormData({ ...formData, applicable_category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Todas as categorias" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas as categorias</SelectItem>
                    {categories?.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Válido apenas para produtos (IDs UUID, separados por vírgula)</Label>
                <Input
                  value={formData.applicable_product_ids_raw}
                  onChange={e => setFormData({ ...formData, applicable_product_ids_raw: e.target.value })}
                  placeholder="Deixe vazio para todos os produtos"
                />
              </div>
              <div>
                <Label>Válido apenas para estados (UF, separados por vírgula)</Label>
                <Input
                  value={formData.applicable_states}
                  onChange={e => setFormData({ ...formData, applicable_states: e.target.value.toUpperCase() })}
                  placeholder="Ex: SP, RJ, MG. Vazio = todos"
                />
              </div>
              <div>
                <Label>Válido apenas para CEPs (prefixos 5 dígitos, separados por vírgula)</Label>
                <Input
                  value={formData.applicable_zip_prefixes}
                  onChange={e => setFormData({ ...formData, applicable_zip_prefixes: e.target.value })}
                  placeholder="Ex: 01310, 01311. Vazio = todos"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Compra Mínima</Label><Input type="number" step="0.01" value={formData.min_purchase_amount} onChange={e => setFormData({ ...formData, min_purchase_amount: e.target.value })} placeholder="0.00" /></div>
                <div><Label>Limite de Usos</Label><Input type="number" value={formData.max_uses} onChange={e => setFormData({ ...formData, max_uses: e.target.value })} placeholder="Ilimitado" /></div>
              </div>
              <div><Label>Data de Expiração</Label><Input type="date" value={formData.expiry_date} onChange={e => setFormData({ ...formData, expiry_date: e.target.value })} /></div>
              <div className="flex items-center gap-2">
                <Switch checked={formData.is_active} onCheckedChange={c => setFormData({ ...formData, is_active: c })} />
                <Label>Ativo</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Salvando...' : 'Salvar'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="list">Lista de Cupons</TabsTrigger>
          <TabsTrigger value="bulk">Gerar em Lote</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <div className="bg-background rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Desconto</TableHead>
                  <TableHead>Compra Mín.</TableHead>
                  <TableHead>Usos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">Carregando...</TableCell></TableRow>
                ) : coupons?.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum cupom cadastrado</TableCell></TableRow>
                ) : coupons?.map(coupon => (
                  <TableRow key={coupon.id}>
                    <TableCell className="font-mono font-bold">{coupon.code}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {TYPE_LABELS[(coupon as any).type || 'standard']}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(coupon as any).type === 'free_shipping' ? 'Frete grátis' :
                        coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : formatPrice(Number(coupon.discount_value))}
                    </TableCell>
                    <TableCell>{formatPrice(Number(coupon.min_purchase_amount))}</TableCell>
                    <TableCell>{coupon.uses_count} / {coupon.max_uses || '∞'}</TableCell>
                    <TableCell><Badge variant={coupon.is_active ? 'default' : 'secondary'}>{coupon.is_active ? 'Ativo' : 'Inativo'}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(coupon)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(coupon.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="bulk" className="space-y-6">
          <div className="bg-background rounded-lg border p-6 space-y-4">
            <h3 className="font-semibold text-lg">Gerar Cupons em Lote</h3>
            <p className="text-sm text-muted-foreground">Gere até 500 cupons de uma vez com um prefixo comum.</p>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Prefixo *</Label><Input value={bulkPrefix} onChange={e => setBulkPrefix(e.target.value.toUpperCase())} placeholder="SUMMER" /></div>
              <div><Label>Quantidade *</Label><Input type="number" min="1" max="500" value={bulkCount} onChange={e => setBulkCount(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo de Desconto</Label>
                <Select value={bulkDiscountType} onValueChange={v => setBulkDiscountType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                    <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Valor do Desconto *</Label><Input type="number" step="0.01" value={bulkDiscountValue} onChange={e => setBulkDiscountValue(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Usos por cupom</Label><Input type="number" value={bulkMaxUses} onChange={e => setBulkMaxUses(e.target.value)} placeholder="1" /></div>
              <div><Label>Validade</Label><Input type="date" value={bulkExpiry} onChange={e => setBulkExpiry(e.target.value)} /></div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleBulkGenerate} disabled={bulkGenerating || !bulkPrefix || !bulkDiscountValue}>
                {bulkGenerating ? 'Gerando...' : `Gerar ${bulkCount || 0} Cupons`}
              </Button>
              {generatedCoupons.length > 0 && (
                <Button variant="outline" onClick={() => exportToCSV(generatedCoupons.map(c => ({ codigo: c.code, desconto: c.discount_value, tipo: c.discount_type })), `cupons-${bulkPrefix}`)}>
                  <Download className="h-4 w-4 mr-2" />Exportar CSV
                </Button>
              )}
            </div>
            {generatedCoupons.length > 0 && (
              <p className="text-sm text-muted-foreground">✓ {generatedCoupons.length} cupons gerados: {generatedCoupons[0]?.code} até {generatedCoupons[generatedCoupons.length - 1]?.code}</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
