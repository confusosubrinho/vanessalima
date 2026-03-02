/**
 * E2E helper: configurar checkout via edge update-checkout-settings (requer admin JWT).
 */
import { getAdminToken } from './auth.js';

type Provider = 'stripe' | 'yampi' | 'appmax';
type Channel = 'internal' | 'external';
type Experience = 'transparent' | 'native';

export type CheckoutSettingsInput = {
  active_provider: Provider;
  channel: Channel;
  experience: Experience;
  change_reason?: string;
};

export async function setCheckoutSettings(input: CheckoutSettingsInput): Promise<{ ok: boolean; status: number; body: unknown }> {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!base) throw new Error('E2E: SUPABASE_URL obrigatório');
  const token = await getAdminToken();
  const url = base.replace(/\/$/, '') + '/functions/v1/update-checkout-settings';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      active_provider: input.active_provider,
      channel: input.channel,
      experience: input.experience,
      change_reason: input.change_reason ?? 'E2E test',
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export async function setStripeInternal(): Promise<{ ok: boolean; status: number; body: unknown }> {
  return setCheckoutSettings({
    active_provider: 'stripe',
    channel: 'internal',
    experience: 'transparent',
    change_reason: 'E2E Stripe internal',
  });
}

export async function setStripeExternal(): Promise<{ ok: boolean; status: number; body: unknown }> {
  return setCheckoutSettings({
    active_provider: 'stripe',
    channel: 'external',
    experience: 'native',
    change_reason: 'E2E Stripe external',
  });
}

export async function setYampiExternal(): Promise<{ ok: boolean; status: number; body: unknown }> {
  return setCheckoutSettings({
    active_provider: 'yampi',
    channel: 'external',
    experience: 'native',
    change_reason: 'E2E Yampi external',
  });
}
