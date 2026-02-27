/**
 * Playwright globalSetup: roda seed:qa quando SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 * estão definidos, para que E2E tenham produto/categoria (0 skipped).
 * Se env não estiver definido, apenas avisa; os testes que dependem de produto falharão.
 */
import { execSync } from 'child_process';

export default async function globalSetup() {
  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    console.warn('[E2E] SUPABASE_URL não definido — seed:qa não executado. Testes que dependem de produto podem falhar.');
    return;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[E2E] SUPABASE_SERVICE_ROLE_KEY não definido — seed:qa não executado.');
    return;
  }
  try {
    execSync('node scripts/seed-qa.mjs', {
      stdio: 'inherit',
      env: { ...process.env, SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL },
    });
    console.log('[E2E] seed:qa executado com sucesso.');
  } catch (e) {
    console.warn('[E2E] seed:qa falhou ou não executado:', (e as Error).message);
  }
}
