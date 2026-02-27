import { supabase } from '@/integrations/supabase/client';

/** Gera um correlation_id único por ação admin (FASE 4 — observabilidade). */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

export async function logAudit(params: {
  action: 'create' | 'update' | 'delete' | 'export' | 'login' | 'admin_action';
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  /** ID de correlação para rastrear a ação em múltiplos eventos. Se omitido, é gerado um novo. */
  correlationId?: string | null;
}) {
  try {
    const correlationId = params.correlationId ?? generateCorrelationId();
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;
    const userEmail = session?.user?.email || null;

    // Sanitize: remove sensitive fields
    const sanitize = (obj?: Record<string, any>) => {
      if (!obj) return null;
      const { password, token, secret, cpf, access_token, ...safe } = obj;
      return safe;
    };

    await supabase.from('admin_audit_log').insert({
      user_id: userId,
      user_email: userEmail,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId || null,
      resource_name: params.resourceName || null,
      old_values: sanitize(params.oldValues) || null,
      new_values: sanitize(params.newValues) || null,
      user_agent: navigator.userAgent?.slice(0, 200) || null,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error('[AuditLogger] Failed to log audit entry:', err);
  }
}
