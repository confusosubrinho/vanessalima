import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { appLogger } from './appLogger';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';
export type ErrorType = 'api_error' | 'client_error' | 'auth_error' | 'network_error' | 'render_error';

interface LogErrorParams {
  type: ErrorType;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  severity?: ErrorSeverity;
  pageUrl?: string;
}

type ErrorLogInsert = Database['public']['Tables']['error_logs']['Insert'];

// In-memory buffer for rate limiting
const recentErrors = new Map<string, number>();
const RATE_LIMIT_MS = 5000; // Don't log same error more than once per 5s

export async function logError(params: LogErrorParams) {
  const {
    type,
    message,
    stack,
    context = {},
    severity = 'error',
    pageUrl = typeof window !== 'undefined' ? window.location.href : '',
  } = params;

  // Rate limit: skip duplicate errors
  const errorKey = `${type}:${message}`;
  const lastLogged = recentErrors.get(errorKey);
  if (lastLogged && Date.now() - lastLogged < RATE_LIMIT_MS) return;
  recentErrors.set(errorKey, Date.now());

  // Always log via central logger
  if (severity === 'critical' || severity === 'error') {
    appLogger.error(`[${type.toUpperCase()}] ${message}`, context);
  } else if (severity === 'warning') {
    appLogger.warn(`[${type.toUpperCase()}] ${message}`, context);
  } else {
    appLogger.info(`[${type.toUpperCase()}] ${message}`, context);
  }

  // Try to save to database (fire-and-forget)
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const row: ErrorLogInsert = {
      error_type: type,
      error_message: message.substring(0, 1000),
      error_stack: stack?.substring(0, 5000) ?? null,
      error_context: context as Database['public']['Tables']['error_logs']['Row']['error_context'],
      page_url: pageUrl,
      user_id: session?.user?.id ?? null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      severity,
    };
    await supabase.from('error_logs').insert(row);
  } catch (e) {
    appLogger.warn('ErrorLogger: failed to persist error log', e);
  }
}

// Log unhandled errors
export function initGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    logError({
      type: 'client_error',
      message: event.message || 'Unknown error',
      stack: event.error?.stack,
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
      severity: 'error',
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || String(event.reason) || 'Unhandled Promise Rejection';
    logError({
      type: 'client_error',
      message,
      stack: event.reason?.stack,
      severity: 'error',
    });
  });
}

// Monitor Supabase API errors
export function logApiError(operation: string, error: any, context?: Record<string, any>) {
  logError({
    type: 'api_error',
    message: `API Error in ${operation}: ${error?.message || String(error)}`,
    stack: error?.stack,
    context: { operation, code: error?.code, details: error?.details, ...context },
    severity: error?.code === 'PGRST303' ? 'warning' : 'error',
  });
}

// Session/Auth error helper
export function logAuthError(message: string, context?: Record<string, any>) {
  logError({
    type: 'auth_error',
    message,
    context,
    severity: 'warning',
  });
}
