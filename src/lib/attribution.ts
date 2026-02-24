const ATTRIBUTION_KEY = "checkout_attribution";
const ATTRIBUTION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer?: string;
  landing_page?: string;
  captured_at: number;
}

export function captureAttribution(): void {
  const params = new URLSearchParams(window.location.search);
  const existing = getAttribution();

  const hasUtm = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].some(
    (k) => params.get(k)
  );

  // Only overwrite if new UTMs are present
  if (!hasUtm && existing) return;

  const attribution: Attribution = {
    utm_source: params.get("utm_source") || existing?.utm_source || undefined,
    utm_medium: params.get("utm_medium") || existing?.utm_medium || undefined,
    utm_campaign: params.get("utm_campaign") || existing?.utm_campaign || undefined,
    utm_term: params.get("utm_term") || existing?.utm_term || undefined,
    utm_content: params.get("utm_content") || existing?.utm_content || undefined,
    referrer: document.referrer || existing?.referrer || undefined,
    landing_page: existing?.landing_page || window.location.pathname,
    captured_at: Date.now(),
  };

  localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
}

export function getAttribution(): Attribution | null {
  try {
    const raw = localStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Attribution;
    if (Date.now() - data.captured_at > ATTRIBUTION_TTL) {
      localStorage.removeItem(ATTRIBUTION_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearAttribution(): void {
  localStorage.removeItem(ATTRIBUTION_KEY);
}
