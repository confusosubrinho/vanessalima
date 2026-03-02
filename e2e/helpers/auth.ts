import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'qa-admin@example.com';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'qa-admin-e2e-secure';

export async function getAdminToken(): Promise<string> {
  if (!url || !anonKey) throw new Error('E2E: SUPABASE_URL e SUPABASE_ANON_KEY obrigatorios');
  const client = createClient(url, anonKey);
  const { data, error } = await client.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (error) throw new Error('E2E getAdminToken: ' + error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error('E2E getAdminToken: sem access_token');
  return token;
}

export async function loginAdminInPage(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Senha').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15000 }).catch(() => {});
}
