import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatPrice, getProviderLabel } from '@/lib/formatters';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, CreditCard, MapPin, MessageCircle, Package, RefreshCw, ShoppingBag, Trash2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Order } from '@/types/database';
import { getWhatsAppNumber } from '@/hooks/useStoreContact';

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  image_snapshot?: string;
  title_snapshot?: string;
  variant_info?: string;
  sku_snapshot?: string;
}

interface OrderDetailContentProps {
  order: Order;
  orderItems: OrderItem[] | null;
  orderItemsLoading: boolean;
  syncYampiOrderId: string | null;
  reconcileOrderId: string | null;
  onSyncYampi: (id: string) => void;
  onReconcile: (id: string) => void;
  onDeleteTest: (order: Order) => void;
  onTrackingUpdated: (code: string) => void;
  TrackingEditor: React.ComponentType<{ order: Order; onUpdated: (code: string) => void }>;
}

function PaymentBadge({ order }: { order: Order }) {
  const ps = (order as any).payment_status;
  const st = order.status;
  const label =
    ps === 'refunded' ? 'Reembolsado'
    : ps === 'approved' || ['processing', 'shipped', 'delivered'].includes(st) ? 'Aprovado'
    : ps === 'pending' || st === 'pending' ? 'Pendente'
    : ps === 'failed' || st === 'cancelled' ? 'Não efetuado'
    : null;
  const style =
    label === 'Aprovado' ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
    : label === 'Pendente' ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
    : label === 'Não efetuado' || label === 'Reembolsado' ? 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
    : 'bg-muted';
  return label ? <Badge className={style}>{label}</Badge> : null;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pendente', cls: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300' },
    processing: { label: 'Processando', cls: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300' },
    shipped: { label: 'Enviado', cls: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300' },
    delivered: { label: 'Entregue', cls: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300' },
    cancelled: { label: 'Cancelado', cls: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300' },
  };
  const s = map[status] || { label: status, cls: 'bg-muted' };
  return <Badge className={s.cls}>{s.label}</Badge>;
}

export function OrderDetailContent({
  order,
  orderItems,
  orderItemsLoading,
  syncYampiOrderId,
  reconcileOrderId,
  onSyncYampi,
  onReconcile,
  onDeleteTest,
  onTrackingUpdated,
  TrackingEditor,
}: OrderDetailContentProps) {
  const isMobile = useIsMobile();

  return (
    <div className="space-y-5">
      {/* ── Header: Customer + Badges ── */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} />
          <PaymentBadge order={order} />
          <Badge variant="outline" className="text-xs">{getProviderLabel((order as any).provider)}</Badge>
          {(order as any).provider === 'yampi' && (order as any).yampi_order_number && (
            <Badge variant="secondary" className="text-[10px] font-mono">
              Yampi #{(order as any).yampi_order_number}
            </Badge>
          )}
        </div>

        {(order as any).customer_email && (
          <p className="text-sm text-muted-foreground">
            {(order as any).customer_email}
            {(order as any).customer_cpf && <> · CPF: {(order as any).customer_cpf}</>}
          </p>
        )}
      </div>

      <Separator />

      {/* ── Payment Section ── */}
      <section>
        <h3 className="font-medium text-sm flex items-center gap-1.5 mb-3">
          <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
          Pagamento
        </h3>
        <div className={`grid gap-3 text-sm ${isMobile ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <InfoCard label="Método" value={(order as any).payment_method || '—'} />
          <InfoCard label="Gateway" value={(order as any).gateway || '—'} />
          <InfoCard label="Parcelas" value={(order as any).installments > 0 ? `${(order as any).installments}x` : '—'} />
        </div>
        {(order as any).shipping_method && (
          <div className="mt-3 text-sm rounded-lg border bg-card p-2.5">
            <p className="text-muted-foreground text-[11px] font-medium mb-0.5">Envio</p>
            <p className="font-semibold text-sm">{(order as any).shipping_method}</p>
          </div>
        )}
      </section>

      <Separator />

      {/* ── Order Items ── */}
      <section>
        <h3 className="font-medium text-sm flex items-center gap-1.5 mb-3">
          <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
          Itens do pedido
        </h3>
        {orderItemsLoading ? (
          <p className="text-sm text-muted-foreground">Carregando itens...</p>
        ) : orderItems && orderItems.length > 0 ? (
          isMobile ? (
            <div className="space-y-3">
              {orderItems.map((item) => (
                <div key={item.id} className="flex gap-3 p-3 rounded-lg border bg-card">
                  {(item as any).image_snapshot ? (
                    <img
                      src={(item as any).image_snapshot}
                      alt=""
                      className="w-14 h-14 object-cover rounded-md border bg-muted flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-md border bg-muted flex items-center justify-center text-muted-foreground flex-shrink-0">
                      <Package className="h-5 w-5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-tight truncate">
                      {(item as any).title_snapshot || item.product_name}
                    </p>
                    {((item as any).variant_info || (item as any).sku_snapshot) && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {(item as any).variant_info || (item as any).sku_snapshot}
                      </p>
                    )}
                    <p className="text-sm mt-1 text-muted-foreground">
                      {item.quantity}x {formatPrice(Number(item.unit_price))}
                      <span className="font-semibold text-foreground ml-1">
                        = {formatPrice(Number(item.total_price))}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-xs font-medium text-left p-2.5 w-14"></th>
                    <th className="text-xs font-medium text-left p-2.5">Produto</th>
                    <th className="text-xs font-medium text-center p-2.5 w-16">Qtd</th>
                    <th className="text-xs font-medium text-right p-2.5 w-24">Unit.</th>
                    <th className="text-xs font-medium text-right p-2.5 w-24">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item, idx) => (
                    <tr
                      key={item.id}
                      className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${idx % 2 === 1 ? 'bg-muted/15' : ''}`}
                    >
                      <td className="p-2.5">
                        {(item as any).image_snapshot ? (
                          <img src={(item as any).image_snapshot} alt="" className="w-10 h-10 object-cover rounded border bg-muted" />
                        ) : (
                          <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center text-muted-foreground">
                            <Package className="h-4 w-4" />
                          </div>
                        )}
                      </td>
                      <td className="p-2.5">
                        <span className="font-medium">{(item as any).title_snapshot || item.product_name}</span>
                        {(item as any).variant_info && <span className="text-muted-foreground block text-xs mt-0.5">Variante: {(item as any).variant_info}</span>}
                        {(item as any).sku_snapshot && <span className="text-muted-foreground block text-xs">SKU: {(item as any).sku_snapshot}</span>}
                      </td>
                      <td className="p-2.5 text-center">{item.quantity}</td>
                      <td className="p-2.5 text-right text-muted-foreground">{formatPrice(Number(item.unit_price))}</td>
                      <td className="p-2.5 text-right font-semibold">{formatPrice(Number(item.total_price))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <p className="text-sm text-muted-foreground italic">Nenhum item encontrado.</p>
        )}
      </section>

      <Separator />

      {/* ── Address + Summary ── */}
      <div className={`grid gap-5 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <section>
          <h3 className="font-medium text-sm flex items-center gap-1.5 mb-3">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            Endereço de Entrega
          </h3>
          <div className="text-sm space-y-1 rounded-lg border bg-card p-3">
            <p className="font-medium">{order.shipping_name ?? '—'}</p>
            <p className="text-muted-foreground leading-relaxed">
              {order.shipping_address && <>{order.shipping_address}<br /></>}
              {(order.shipping_city || order.shipping_state) && <>{order.shipping_city}{order.shipping_state ? ` - ${order.shipping_state}` : ''}<br /></>}
              {order.shipping_zip && <>CEP: {order.shipping_zip}</>}
            </p>
            {order.shipping_phone && (
              <div className="flex items-center gap-2">
                <p className="text-muted-foreground">Tel: {order.shipping_phone}</p>
                <a
                  href={`https://wa.me/${getWhatsAppNumber(order.shipping_phone)}?text=${encodeURIComponent(`Olá! Referente ao pedido #${order.order_number}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  <MessageCircle className="h-3 w-3" />
                  WhatsApp
                </a>
              </div>
            )}
          </div>
        </section>

        <section>
          <h3 className="font-medium text-sm mb-3">Resumo</h3>
          <div className="space-y-2 text-sm rounded-lg border bg-card p-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPrice(Number(order.subtotal))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Frete</span>
              <span>{formatPrice(Number(order.shipping_cost))}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-primary">
                <span>Desconto</span>
                <span>-{formatPrice(Number(order.discount_amount))}</span>
              </div>
            )}
            {(order as any).coupon_code && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Cupom</span>
                <Badge variant="secondary" className="text-[10px] h-5">{(order as any).coupon_code}</Badge>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-bold text-base">
              <span>Total</span>
              <span>{formatPrice(Number(order.total_amount))}</span>
            </div>
          </div>
        </section>
      </div>

      <Separator />

      {/* ── Tracking ── */}
      <TrackingEditor order={order} onUpdated={onTrackingUpdated} />

      {/* ── Notes ── */}
      {order.notes && (
        <section>
          <h3 className="font-medium mb-1 text-sm">Observações</h3>
          <p className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-3">{order.notes}</p>
        </section>
      )}

      {/* ── Timeline ── */}
      <section>
        <h3 className="font-medium mb-2 text-sm flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Timeline
        </h3>
        <div className="rounded-lg border bg-card p-3">
          <ul className="text-xs space-y-1.5 text-muted-foreground">
            {(order as any).yampi_created_at && (
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                Compra (Yampi): {format(new Date((order as any).yampi_created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </li>
            )}
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
              Criado: {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
              Atualizado: {format(new Date(order.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              {(order as any).last_webhook_event ? ` (${(order as any).last_webhook_event})` : ''}
            </li>
          </ul>
        </div>
      </section>

      <Separator />

      {/* ── Actions ── */}
      <section className="space-y-3">
        <h3 className="font-medium text-sm">Ações</h3>
        <div className={`flex gap-2 ${isMobile ? 'flex-col' : 'flex-row flex-wrap'}`}>
          {(order as any).provider === 'yampi' && (order as any).external_reference && (
            <Button
              variant="outline"
              size="sm"
              className={isMobile ? 'w-full' : ''}
              onClick={() => onSyncYampi(order.id)}
              disabled={syncYampiOrderId !== null}
              title="Atualiza status, pagamento e rastreio a partir da Yampi."
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncYampiOrderId === order.id ? 'animate-spin' : ''}`} />
              Sincronizar com Yampi
            </Button>
          )}

          {(order as any).provider === 'stripe' && (order as any).transaction_id && (
            <Button
              variant="outline"
              size="sm"
              className={isMobile ? 'w-full' : ''}
              onClick={() => onReconcile(order.id)}
              disabled={reconcileOrderId !== null}
              title="Consulta o status do pagamento no Stripe."
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${reconcileOrderId === order.id ? 'animate-spin' : ''}`} />
              Conciliar com Stripe
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className={`text-destructive border-destructive/30 hover:bg-destructive/10 ${isMobile ? 'w-full' : ''}`}
            onClick={() => onDeleteTest(order)}
            title="Restaura estoque e remove o pedido. Apenas teste."
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Excluir pedido (teste)
          </Button>
        </div>
      </section>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <p className="text-muted-foreground text-[11px] font-medium mb-0.5">{label}</p>
      <p className="font-semibold text-sm truncate">{value}</p>
    </div>
  );
}
