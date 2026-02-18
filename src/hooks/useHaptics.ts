import { useCallback, useRef } from 'react';

/**
 * Haptic feedback hook for mobile devices.
 * Respects device settings and debounces rapid calls.
 */
export function useHaptics() {
  const lastVibration = useRef(0);

  const vibrate = useCallback((pattern: number | number[] = 15) => {
    const now = Date.now();
    // Debounce: min 100ms between vibrations
    if (now - lastVibration.current < 100) return;
    lastVibration.current = now;

    // Check if vibration API is available
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Silently fail if not supported
      }
    }
  }, []);

  const lightTap = useCallback(() => vibrate(10), [vibrate]);
  const mediumTap = useCallback(() => vibrate(20), [vibrate]);
  const success = useCallback(() => vibrate([15, 50, 15]), [vibrate]);
  const error = useCallback(() => vibrate([30, 50, 30, 50, 30]), [vibrate]);

  return { vibrate, lightTap, mediumTap, success, error };
}
