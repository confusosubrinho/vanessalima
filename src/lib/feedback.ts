/**
 * Mobile Feedback Pack: haptics, press animation support, and optional sound.
 * Centralized util — do not spread logic. Use only for key actions (add to cart, pay, copy PIX, success, error).
 * Respects prefers-reduced-motion and prefers-reduced-transparency.
 */

export type FeedbackPattern = 'light' | 'selection' | 'success' | 'error';

const VIBRATION_PATTERNS: Record<FeedbackPattern, number | number[]> = {
  light: 12,
  selection: 8,
  success: 20,
  error: [30, 40, 30],
};

/** SSR-safe: true when reduced motion is preferred */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** SSR-safe: true when reduced transparency is preferred (for visual fallback) */
export function prefersReducedTransparency(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
}

/** SSR-safe: true when Vibration API is available (Android/compatible browsers) */
export function canVibrate(): boolean {
  if (typeof navigator === 'undefined') return false;
  return typeof navigator.vibrate === 'function';
}

/** Basic iOS detection for visual fallback (no vibration on iOS) */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Trigger vibration. No-op on SSR or when reduced motion / not supported.
 */
export function vibrate(pattern: FeedbackPattern): void {
  if (typeof navigator === 'undefined') return;
  if (prefersReducedMotion()) return;
  if (!canVibrate()) return;
  const value = VIBRATION_PATTERNS[pattern];
  try {
    navigator.vibrate(value);
  } catch {
    // ignore
  }
}

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioContext;
}

/**
 * Optional discrete click sound via Web Audio (20–40ms, low volume).
 * Only call after user gesture. OFF by default; enable via settings.
 */
export function playClickSound(_pattern: FeedbackPattern): void {
  if (prefersReducedMotion()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.03);
  } catch {
    // ignore
  }
}

export interface FeedbackOptions {
  /** Play sound (only if user enabled it in settings). Default false. */
  sound?: boolean;
}

/**
 * Main feedback entry: vibration + optional sound.
 * - If prefersReducedMotion: no vibration, no sound (visual highlight still allowed by caller).
 * - If canVibrate: vibrate with pattern.
 * - Sound only when opts.sound === true and caller has checked user setting.
 */
export function feedback(pattern: FeedbackPattern, opts?: FeedbackOptions): void {
  if (prefersReducedMotion()) return;
  vibrate(pattern);
  if (opts?.sound) {
    playClickSound(pattern);
  }
}
