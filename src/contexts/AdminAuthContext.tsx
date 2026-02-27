/**
 * FASE 4 / BUG-ADMIN-01, 08: Watchdog 401/403 — sessão expirada ou não autorizada.
 * Componentes do admin podem chamar onSessionExpired() ao receber 401/403 para
 * limpar cache, fazer logout e redirecionar para /admin/login.
 */
import { createContext, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type AdminAuthContextValue = {
  onSessionExpired: (message?: string) => void;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function useAdminSessionExpired(): AdminAuthContextValue['onSessionExpired'] {
  const ctx = useContext(AdminAuthContext);
  return ctx?.onSessionExpired ?? (() => {});
}

export function AdminAuthProvider({
  children,
  onSessionExpired,
}: {
  children: React.ReactNode;
  onSessionExpired: (message?: string) => void;
}) {
  const value: AdminAuthContextValue = { onSessionExpired };
  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

/**
 * Hook para ser usado dentro de AdminLayout: retorna a função a ser passada ao provider.
 */
export function useAdminAuthProviderValue(): AdminAuthContextValue['onSessionExpired'] {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useCallback(
    (message?: string) => {
      queryClient.clear();
      supabase.auth.signOut().finally(() => {
        navigate('/admin/login', { replace: true, state: { sessionExpired: true, message } });
      });
    },
    [queryClient, navigate]
  );
}
