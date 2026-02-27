/**
 * P1-1: Reconcilia pedidos pending há X horas (default 2).
 * Chama a Edge Function reconcile-order para cada um.
 * Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/reconcile-stale.mjs [hours]
 */
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hours = parseInt(process.argv[2] || '2', 10) || 2;

if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

async function run() {
  const q = `select=id&status=eq.pending&transaction_id=not.is.null&created_at=lt.${encodeURIComponent(cutoff)}`;
  const res = await fetch(
    `${url.replace(/\/$/, '')}/rest/v1/orders?${q}`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!res.ok) {
    console.error('Erro ao listar pedidos:', res.status);
    process.exit(1);
  }
  const orders = await res.json();
  const fnUrl = url.replace(/\/$/, '') + '/functions/v1/reconcile-order';
  let reconciled = 0;
  for (const o of orders) {
    const r = await fetch(fnUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: o.id }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.ok) reconciled++;
  }
  console.log(`Reconciliados: ${reconciled}/${orders.length} pedidos pending há mais de ${hours}h`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
