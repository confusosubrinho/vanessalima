import { supabase } from '@/integrations/supabase/client';

const SESSION_KEY = 'vl_session_id';
const UTM_KEY = 'vl_utm_data';

function generateSessionId(): string {
  return 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function getSessionId(): string {
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export interface UTMData {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string;
  landing_page: string;
  traffic_type: string;
}

function classifyTraffic(params: URLSearchParams, referrer: string): string {
  if (params.get('utm_source') || params.get('utm_medium')) {
    const medium = params.get('utm_medium')?.toLowerCase() || '';
    if (['cpc', 'ppc', 'paid', 'paidsocial', 'paid_social'].includes(medium)) return 'paid';
    if (['email', 'e-mail'].includes(medium)) return 'email';
    if (['social', 'socialmedia'].includes(medium)) return 'social';
    if (['referral'].includes(medium)) return 'referral';
    return 'campaign';
  }
  if (params.get('gclid') || params.get('fbclid') || params.get('ttclid')) return 'paid';
  if (!referrer) return 'direct';
  
  const ref = referrer.toLowerCase();
  const searchEngines = ['google', 'bing', 'yahoo', 'duckduckgo', 'baidu'];
  if (searchEngines.some(se => ref.includes(se))) return 'organic';
  
  const socialNetworks = ['facebook', 'instagram', 'twitter', 'tiktok', 'youtube', 'linkedin', 'pinterest'];
  if (socialNetworks.some(sn => ref.includes(sn))) return 'social';
  
  return 'referral';
}

export function captureUTMData(): UTMData {
  const params = new URLSearchParams(window.location.search);
  const referrer = document.referrer || '';
  
  const data: UTMData = {
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
    utm_term: params.get('utm_term'),
    utm_content: params.get('utm_content'),
    referrer,
    landing_page: window.location.pathname + window.location.search,
    traffic_type: classifyTraffic(params, referrer),
  };

  // Store in session for later use
  const existing = sessionStorage.getItem(UTM_KEY);
  if (!existing) {
    sessionStorage.setItem(UTM_KEY, JSON.stringify(data));
  }

  return data;
}

export function getStoredUTM(): UTMData | null {
  const stored = sessionStorage.getItem(UTM_KEY);
  return stored ? JSON.parse(stored) : null;
}

export async function trackSession(): Promise<void> {
  const existing = sessionStorage.getItem('vl_session_tracked');
  if (existing) return;

  // Don't track admin sessions
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin');
      
      if (roles && roles.length > 0) {
        sessionStorage.setItem('vl_session_tracked', 'true');
        return; // Skip tracking for admins
      }
    }
  } catch {
    // Continue tracking if role check fails
  }

  const sessionId = getSessionId();
  const utm = captureUTMData();

  try {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('traffic_sessions').insert({
      session_id: sessionId,
      user_id: session?.user?.id || null,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_term: utm.utm_term,
      utm_content: utm.utm_content,
      referrer: utm.referrer,
      landing_page: utm.landing_page,
      traffic_type: utm.traffic_type,
      device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      user_agent: navigator.userAgent,
    });
    sessionStorage.setItem('vl_session_tracked', 'true');
  } catch (e) {
    console.error('Error tracking session:', e);
  }
}

export async function saveAbandonedCart(
  cartData: any[],
  subtotal: number,
  email?: string,
  phone?: string,
  name?: string
): Promise<void> {
  const sessionId = getSessionId();
  const utm = getStoredUTM();

  try {
    // Upsert by session_id
    await supabase.from('abandoned_carts').upsert(
      {
        session_id: sessionId,
        email,
        phone,
        customer_name: name,
        cart_data: cartData,
        subtotal,
        utm_source: utm?.utm_source,
        utm_medium: utm?.utm_medium,
        utm_campaign: utm?.utm_campaign,
        page_url: window.location.href,
      },
      { onConflict: 'session_id' as any }
    );
  } catch (e) {
    console.error('Error saving abandoned cart:', e);
  }
}
