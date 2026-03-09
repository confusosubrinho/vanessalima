import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { StoreLayout } from '@/components/store/StoreLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { User, Package, MapPin, LogOut, ChevronDown, Loader2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { lookupCEP } from '@/lib/validators';
import type { User as SupaUser } from '@supabase/supabase-js';

export default function MyAccount() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<SupaUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [cepLoading, setCepLoading] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate('/auth');
      } else {
        setUser(session.user);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session?.user) navigate('/auth');
      else setUser(session.user);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: orders } = useQuery({
    queryKey: ['my-orders', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user?.id,
  });

  const [profileForm, setProfileForm] = useState({
    full_name: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
  });

  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || user?.user_metadata?.full_name || '',
        phone: profile.phone || '',
        address: profile.address || '',
        city: profile.city || '',
        state: profile.state || '',
        zip_code: profile.zip_code || '',
      });
    } else if (user) {
      setProfileForm(prev => ({
        ...prev,
        full_name: user.user_metadata?.full_name || '',
      }));
    }
  }, [profile, user]);

  const updateProfile = useMutation({
    mutationFn: async (data: typeof profileForm) => {
      if (profile) {
        const { error } = await supabase
          .from('profiles')
          .update(data)
          .eq('user_id', user!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('profiles')
          .insert({ ...data, user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      toast({ title: 'Dados atualizados!' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleCepBlur = async () => {
    const cleaned = profileForm.zip_code.replace(/\D/g, '');
    if (cleaned.length !== 8) return;
    setCepLoading(true);
    const result = await lookupCEP(cleaned);
    setCepLoading(false);
    if (result) {
      setProfileForm(prev => ({
        ...prev,
        address: result.logradouro || prev.address,
        city: result.localidade || prev.city,
        state: result.uf || prev.state,
      }));
    }
  };

  const toggleOrder = (orderId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

  const statusLabels: Record<string, string> = {
    pending: 'Pendente',
    processing: 'Processando',
    shipped: 'Enviado',
    delivered: 'Entregue',
    cancelled: 'Cancelado',
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    shipped: 'bg-purple-100 text-purple-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  if (loading) {
    return (
      <StoreLayout>
        <Helmet><title>Minha Conta | Vanessa Lima Shoes</title></Helmet>
        <div className="container-custom py-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-10 w-20 rounded-full" />
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      <Helmet><title>Minha Conta | Vanessa Lima Shoes</title></Helmet>
      <div className="container-custom py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Minha Conta</h1>
            <p className="text-muted-foreground">{user?.email}</p>
          </div>
          <Button variant="outline" onClick={handleLogout} className="rounded-full">
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>

        <Tabs defaultValue="profile">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Meus Dados
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Pedidos
            </TabsTrigger>
            <TabsTrigger value="addresses" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Endereço
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Dados Pessoais</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateProfile.mutate(profileForm);
                  }}
                  className="space-y-4 max-w-lg"
                >
                  <div className="space-y-2">
                    <Label>Nome completo</Label>
                    <Input
                      value={profileForm.full_name}
                      onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={user?.email || ''} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <Button type="submit" disabled={updateProfile.isPending} className="rounded-full">
                    {updateProfile.isPending ? 'Salvando...' : 'Salvar Dados'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>Meus Pedidos</CardTitle>
              </CardHeader>
              <CardContent>
                {!orders || orders.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Você ainda não fez nenhum pedido.</p>
                    <Button asChild className="mt-4 rounded-full">
                      <a href="/">Explorar Produtos</a>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orders.map((order: any) => (
                      <Collapsible
                        key={order.id}
                        open={expandedOrders.has(order.id)}
                        onOpenChange={() => toggleOrder(order.id)}
                      >
                        <div className="border rounded-lg p-4">
                          <CollapsibleTrigger className="w-full text-left">
                            <div className="flex items-center justify-between mb-1">
                              <div>
                                <p className="font-medium">Pedido #{order.order_number}</p>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-right">
                                  <Badge className={statusColors[order.status] || ''}>
                                    {statusLabels[order.status] || order.status}
                                  </Badge>
                                  <p className="font-bold mt-1">{formatPrice(order.total_amount)}</p>
                                </div>
                                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedOrders.has(order.id) ? 'rotate-180' : ''}`} />
                              </div>
                            </div>
                            {order.tracking_code && (
                              <p className="text-sm text-primary">Rastreio: {order.tracking_code}</p>
                            )}
                            <p className="text-sm text-muted-foreground mt-1">
                              {order.order_items?.length || 0} {order.order_items?.length === 1 ? 'item' : 'itens'} — Clique para ver detalhes
                            </p>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            <div className="mt-3 pt-3 border-t space-y-2">
                              {order.order_items?.map((item: any) => (
                                <div key={item.id} className="flex items-center justify-between text-sm py-1">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{item.product_name}</p>
                                    {item.variant_info && (
                                      <p className="text-xs text-muted-foreground">{item.variant_info}</p>
                                    )}
                                  </div>
                                  <div className="text-right ml-4 shrink-0">
                                    <p className="text-muted-foreground">{item.quantity}x {formatPrice(item.unit_price)}</p>
                                    <p className="font-medium">{formatPrice(item.total_price)}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="addresses">
            <Card>
              <CardHeader>
                <CardTitle>Endereço de Entrega</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateProfile.mutate(profileForm);
                  }}
                  className="space-y-4 max-w-lg"
                >
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <div className="relative">
                      <Input
                        value={profileForm.zip_code}
                        onChange={(e) => setProfileForm({ ...profileForm, zip_code: e.target.value })}
                        onBlur={handleCepBlur}
                        placeholder="00000-000"
                      />
                      {cepLoading && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Endereço</Label>
                    <Input
                      value={profileForm.address}
                      onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                      placeholder="Rua, número, complemento"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Cidade</Label>
                      <Input
                        value={profileForm.city}
                        onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Estado</Label>
                      <Input
                        value={profileForm.state}
                        onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
                        maxLength={2}
                        placeholder="PR"
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={updateProfile.isPending} className="rounded-full">
                    {updateProfile.isPending ? 'Salvando...' : 'Salvar Endereço'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </StoreLayout>
  );
}
