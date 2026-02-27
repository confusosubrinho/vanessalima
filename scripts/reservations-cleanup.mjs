/**
 * P0-2: Chama release-expired-reservations (TTL 15 min).
 * Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/reservations-cleanup.mjs
 * Ou: npm run reservations:cleanup
 */
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const functionsUrl = url.replace(/\/$/, '') + '/functions/v1/release-expired-reservations';

async function run() {
  const res = await fetch(functionsUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Erro:', res.status, data);
    process.exit(1);
  }
  console.log('Reservas expiradas liberadas:', data.released || 0, 'order_ids:', data.order_ids || []);
}

run();
