/**
 * P1-2: Load test leve — 20 requisições concorrentes ao checkout (create-intent).
 * Mede latência e erros. Pode usar payload inválido (esperado 400) para não criar pedidos reais.
 */
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const concurrency = 20;

if (!url || !key) {
  console.error('Defina VITE_SUPABASE_URL e SUPABASE_ANON_KEY (ou SERVICE_ROLE_KEY)');
  process.exit(1);
}

const fnUrl = url.replace(/\/$/, '') + '/functions/v1/stripe-create-intent';

async function oneRequest() {
  const start = Date.now();
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ action: 'create_payment_intent', order_id: null, amount: 0 }),
  });
  const ms = Date.now() - start;
  return { status: res.status, ms };
}

async function run() {
  const start = Date.now();
  const results = await Promise.all(Array.from({ length: concurrency }, () => oneRequest()));
  const total = Date.now() - start;
  const ok = results.filter((r) => r.status === 200).length;
  const err = results.filter((r) => r.status >= 400).length;
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)] ?? 0;
  const p95 = times[Math.floor(times.length * 0.95)] ?? 0;

  console.log('Load test checkout-sim:', concurrency, 'concurrent');
  console.log('Total ms:', total);
  console.log('2xx:', ok, '4xx/5xx:', err);
  console.log('Latency p50:', p50, 'ms, p95:', p95, 'ms');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
