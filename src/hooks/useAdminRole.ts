import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { hasPermission, type AdminRole } from '@/lib/permissions';

export function useAdminRole() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-role'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      // Check admin_members first
      const { data: member } = await supabase
        .from('admin_members')
        .select('role, is_active')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (member) return member.role as AdminRole;

      // Fallback: check user_roles for admin — treat as owner
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin');

      if (roles && roles.length > 0) return 'owner' as AdminRole;
      return null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const role = data || 'viewer';

  return {
    role: role as AdminRole,
    isLoading,
    can: (permission: string) => hasPermission(role as AdminRole, permission),
  };
}
