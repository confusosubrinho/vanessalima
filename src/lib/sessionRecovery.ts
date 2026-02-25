import { supabase } from '@/integrations/supabase/client';
import { logAuthError } from './errorLogger';
import { appLogger } from './appLogger';

let isRecovering = false;

/**
 * Initializes session recovery that handles expired JWTs gracefully.
 * When a session expires and can't be refreshed, it signs the user out
 * so requests fall back to the anon key (which has public read access).
 */
export function initSessionRecovery() {
  supabase.auth.onAuthStateChange(async (event) => {
    if (event === 'TOKEN_REFRESHED') {
      appLogger.info('Auth: token refreshed successfully');
    }
    if (event === 'SIGNED_OUT') {
      appLogger.info('Auth: user signed out');
    }
  });

  // Periodically check session health
  setInterval(async () => {
    if (isRecovering) return;
    
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        appLogger.warn('Auth: session error, attempting recovery:', error.message);
        logAuthError('Session check failed', { error: error.message });
        await recoverSession();
      }
      
      // If session exists, check if token is about to expire (within 60s)
      if (session) {
        const expiresAt = session.expires_at;
        if (expiresAt) {
          const now = Math.floor(Date.now() / 1000);
          const timeLeft = expiresAt - now;
          
          if (timeLeft < 60 && timeLeft > 0) {
            appLogger.info('Auth: token expiring soon, refreshing...');
            const { error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError) {
              logAuthError('Token refresh failed', { error: refreshError.message });
              await recoverSession();
            }
          } else if (timeLeft <= 0) {
            appLogger.warn('Auth: token already expired, recovering...');
            logAuthError('Token expired', { expiresAt, now });
            await recoverSession();
          }
        }
      }
    } catch (e) {
      appLogger.warn('Auth: session health check error', e);
    }
  }, 30000); // Check every 30s
}

async function recoverSession() {
  if (isRecovering) return;
  isRecovering = true;

  try {
    const { data, error } = await supabase.auth.refreshSession();
    
    if (error || !data.session) {
      appLogger.warn('Auth: cannot refresh session, signing out to use anonymous access');
      await supabase.auth.signOut();
    } else {
      appLogger.info('Auth: session recovered successfully');
    }
  } catch {
    await supabase.auth.signOut();
  } finally {
    isRecovering = false;
  }
}
