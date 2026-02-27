/**
 * Playwright globalSetup: roda seed:qa quando SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 * estão definidos. Se env não estiver definido, FALHA com mensagem clara (qa:ultimate exige env).
 */
import { execSync } from 'child_process';

const MSG = 'Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para rodar seed:qa (e test:e2e).';

export default async function globalSetup() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    console.error('[E2E] ' + MSG);
    throw new Error(MSG);
  }
  if (!key) {
    console.error('[E2E] ' + MSG);
    throw new Error(MSG);
  }
  try {
    execSync('node scripts/seed-qa.mjs', {
      stdio: 'inherit',
      env: { ...process.env, SUPABASE_URL: url },
    });
    console.log('[E2E] seed:qa executado com sucesso.');
  } catch (e) {
    console.error('[E2E] seed:qa falhou:', (e as Error).message);
    throw e;
  }
}
