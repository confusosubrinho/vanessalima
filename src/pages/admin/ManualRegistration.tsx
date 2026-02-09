import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Save, UserPlus, ShoppingCart } from 'lucide-react';

export default function ManualRegistration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Manual sale form
  const [saleData, setSaleData] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    productName: '',
    quantity: '1',
    unitPrice: '',
    paymentMethod: 'pix',
    notes: '',
  });

  // Manual lead form
  const [leadData, setLeadData] = useState({
    name: '',
    email: '',
    phone: '',
    source: '',
    notes: '',
  });

  const saleMutation = useMutation({
    mutationFn: async (data: typeof saleData) => {
      // Create or find customer
      let customerId: string | null = null;
      if (data.customerEmail) {
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('email', data.customerEmail)
          .single();

        if (existing) {
          customerId = existing.id;
        } else {
          const { data: newCustomer, error } = await supabase
            .from('customers')
            .insert({ full_name: data.customerName, email: data.customerEmail, phone: data.customerPhone })
            .select()
            .single();
          if (error) throw error;
          customerId = newCustomer.id;
        }
      }

      const total = Number(data.unitPrice) * Number(data.quantity);
      const orderNumber = 'MAN' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + String(Math.floor(Math.random() * 10000)).padStart(4, '0');

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          customer_id: customerId,
          subtotal: total,
          shipping_cost: 0,
          total_amount: total,
          status: 'processing',
          shipping_name: data.customerName,
          shipping_address: 'Registro manual',
          shipping_city: '-',
          shipping_state: '-',
          shipping_zip: '-',
          notes: `Venda manual | Pagamento: ${data.paymentMethod} | ${data.notes}`,
        })
        .select()
        .single();
      if (orderErr) throw orderErr;

      await supabase.from('order_items').insert({
        order_id: order.id,
        product_name: data.productName,
        quantity: Number(data.quantity),
        unit_price: Number(data.unitPrice),
        total_price: total,
      });

      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast({ title: 'Venda registrada com sucesso!' });
      setSaleData({ customerName: '', customerEmail: '', customerPhone: '', productName: '', quantity: '1', unitPrice: '', paymentMethod: 'pix', notes: '' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao registrar venda', description: err.message, variant: 'destructive' });
    },
  });

  const leadMutation = useMutation({
    mutationFn: async (data: typeof leadData) => {
      const { error } = await supabase
        .from('customers')
        .insert({ full_name: data.name, email: data.email, phone: data.phone, total_orders: 0, total_spent: 0 });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast({ title: 'Lead registrado com sucesso!' });
      setLeadData({ name: '', email: '', phone: '', source: '', notes: '' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao registrar lead', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Registro Manual</h1>
        <p className="text-muted-foreground">Registre vendas e leads manualmente</p>
      </div>

      <Tabs defaultValue="sale">
        <TabsList>
          <TabsTrigger value="sale"><ShoppingCart className="h-4 w-4 mr-2" />Registrar Venda</TabsTrigger>
          <TabsTrigger value="lead"><UserPlus className="h-4 w-4 mr-2" />Registrar Lead</TabsTrigger>
        </TabsList>

        <TabsContent value="sale" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Nova Venda Manual</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); saleMutation.mutate(saleData); }} className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Nome do Cliente *</Label>
                  <Input value={saleData.customerName} onChange={e => setSaleData(p => ({ ...p, customerName: e.target.value }))} required />
                </div>
                <div>
                  <Label>Email do Cliente *</Label>
                  <Input type="email" value={saleData.customerEmail} onChange={e => setSaleData(p => ({ ...p, customerEmail: e.target.value }))} required />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={saleData.customerPhone} onChange={e => setSaleData(p => ({ ...p, customerPhone: e.target.value }))} />
                </div>
                <div>
                  <Label>Produto *</Label>
                  <Input value={saleData.productName} onChange={e => setSaleData(p => ({ ...p, productName: e.target.value }))} required />
                </div>
                <div>
                  <Label>Quantidade</Label>
                  <Input type="number" min="1" value={saleData.quantity} onChange={e => setSaleData(p => ({ ...p, quantity: e.target.value }))} />
                </div>
                <div>
                  <Label>Preço Unitário (R$) *</Label>
                  <Input type="number" step="0.01" min="0" value={saleData.unitPrice} onChange={e => setSaleData(p => ({ ...p, unitPrice: e.target.value }))} required />
                </div>
                <div className="md:col-span-2">
                  <Label>Observações</Label>
                  <Textarea value={saleData.notes} onChange={e => setSaleData(p => ({ ...p, notes: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit" disabled={saleMutation.isPending}>
                    <Save className="h-4 w-4 mr-2" />
                    {saleMutation.isPending ? 'Salvando...' : 'Registrar Venda'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lead" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Novo Lead</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); leadMutation.mutate(leadData); }} className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Nome *</Label>
                  <Input value={leadData.name} onChange={e => setLeadData(p => ({ ...p, name: e.target.value }))} required />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input type="email" value={leadData.email} onChange={e => setLeadData(p => ({ ...p, email: e.target.value }))} required />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={leadData.phone} onChange={e => setLeadData(p => ({ ...p, phone: e.target.value }))} />
                </div>
                <div>
                  <Label>Origem</Label>
                  <Input value={leadData.source} onChange={e => setLeadData(p => ({ ...p, source: e.target.value }))} placeholder="Instagram, Google, WhatsApp..." />
                </div>
                <div className="md:col-span-2">
                  <Label>Observações</Label>
                  <Textarea value={leadData.notes} onChange={e => setLeadData(p => ({ ...p, notes: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit" disabled={leadMutation.isPending}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    {leadMutation.isPending ? 'Salvando...' : 'Registrar Lead'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
