import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
}

export function useStoreContact() {
  return useQuery({
    queryKey: ['store-contact'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_settings_public' as any)
        .select('store_name, contact_email, contact_phone, contact_whatsapp, address, full_address, cnpj, logo_url, header_logo_url')
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as StoreContact) || null;
    },
    staleTime: 1000 * 60 * 10,
  });
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
