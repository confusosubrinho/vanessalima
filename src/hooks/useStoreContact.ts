import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export interface StoreContact {
  store_name: string;
  contact_email: string;
  contact_phone: string;
  contact_whatsapp: string;
  address: string;
  full_address: string;
  cnpj: string;
  logo_url: string;
  header_logo_url: string;
  favicon_url?: string;
  /** ISO date da última atualização (para cache-bust da URL do logo). */
  updated_at?: string | null;
}

/** Dados públicos da loja (view). Uma única key para compartilhar cache no header, footer, etc.
 * staleTime curto + refetchOnWindowFocus para logo/identidade atualizados no painel aparecerem logo. */
export function useStoreSettingsPublic() {
  return useQuery({
    queryKey: ['store-settings-public'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_settings_public')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return (data as Database['public']['Views']['store_settings_public']['Row'] | null) || null;
    },
    staleTime: 1000 * 30,      // 30s: logo/identidade atualizados no painel aparecem em até 30s
    refetchOnMount: true,
    refetchOnWindowFocus: true, // ao voltar à aba, busca logo/header atualizados
  });
}

export function useStoreContact() {
  const { data, ...rest } = useStoreSettingsPublic();
  const contact = data
    ? ({
        store_name: data.store_name,
        contact_email: data.contact_email,
        contact_phone: data.contact_phone,
        contact_whatsapp: data.contact_whatsapp,
        address: data.address,
        full_address: data.full_address,
        cnpj: data.cnpj,
        logo_url: data.logo_url,
        header_logo_url: data.header_logo_url,
        favicon_url: (data as any).favicon_url,
        updated_at: (data as any).updated_at,
      } as StoreContact)
    : null;
  return { data: contact, ...rest };
}

/** Format phone for display: 42991120205 → (42) 99112-0205 */
export function formatPhone(raw?: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 13) { // 5542991120205
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return raw;
}

/** Get WhatsApp number ready for wa.me link */
export function getWhatsAppNumber(raw?: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}
