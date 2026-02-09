import { supabase } from '@/integrations/supabase/client';
import { logAuthError } from './errorLogger';

let isRecovering = false;

/**
 * Initializes session recovery that handles expired JWTs gracefully.
 * When a session expires and can't be refreshed, it signs the user out
 * so requests fall back to the anon key (which has public read access).
 */
export function initSessionRecovery() {
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'TOKEN_REFRESHED') {
      console.info('[Auth] Token refreshed successfully');
    }

    if (event === 'SIGNED_OUT') {
      console.info('[Auth] User signed out');
    }
  });

  // Periodically check session health
  setInterval(async () => {
    if (isRecovering) return;
    
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.warn('[Auth] Session error, attempting recovery:', error.message);
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
            console.info('[Auth] Token expiring soon, refreshing...');
            const { error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError) {
              logAuthError('Token refresh failed', { error: refreshError.message });
              await recoverSession();
            }
          } else if (timeLeft <= 0) {
            console.warn('[Auth] Token already expired, recovering...');
            logAuthError('Token expired', { expiresAt, now });
            await recoverSession();
          }
        }
      }
    } catch (e) {
      console.warn('[Auth] Session health check error:', e);
    }
  }, 30000); // Check every 30s
}

async function recoverSession() {
  if (isRecovering) return;
  isRecovering = true;

  try {
    // Try to refresh
    const { data, error } = await supabase.auth.refreshSession();
    
    if (error || !data.session) {
      // Can't refresh - sign out so we use anon key
      console.warn('[Auth] Cannot refresh session, signing out to use anonymous access');
      await supabase.auth.signOut();
    } else {
      console.info('[Auth] Session recovered successfully');
    }
  } catch (e) {
    // Force sign out
    await supabase.auth.signOut();
  } finally {
    isRecovering = false;
  }
}
