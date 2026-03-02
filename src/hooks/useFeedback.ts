/**
 * Hook for mobile feedback (haptics + optional sound) with persisted user preferences.
 * Keys: mobile_feedback_enabled (default true), mobile_feedback_sound_enabled (default false).
 */

import { useCallback, useSyncExternalStore } from 'react';
import {
  type FeedbackPattern,
  feedback as doFeedback,
} from '@/lib/feedback';

const KEY_ENABLED = 'mobile_feedback_enabled';
const KEY_SOUND = 'mobile_feedback_sound_enabled';
const CUSTOM_EVENT = 'mobile_feedback_prefs_change';

const DEFAULT_ENABLED = true;
const DEFAULT_SOUND = false;

function getStored(key: string, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const v = localStorage.getItem(key);
    if (v === null) return defaultValue;
    return v === 'true';
  } catch {
    return defaultValue;
  }
}

function setStored(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, String(value));
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENT));
  } catch {
    // ignore
  }
}

function subscribeStorage(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener('storage', handler);
  window.addEventListener(CUSTOM_EVENT, handler);
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener(CUSTOM_EVENT, handler);
  };
}

function getSnapshotEnabled(): boolean {
  return getStored(KEY_ENABLED, DEFAULT_ENABLED);
}

function getSnapshotSound(): boolean {
  return getStored(KEY_SOUND, DEFAULT_SOUND);
}

function getServerSnapshotEnabled(): boolean {
  return DEFAULT_ENABLED;
}

function getServerSnapshotSound(): boolean {
  return DEFAULT_SOUND;
}

export function useFeedback() {
  const enabled = useSyncExternalStore(subscribeStorage, getSnapshotEnabled, getServerSnapshotEnabled);
  const soundEnabled = useSyncExternalStore(subscribeStorage, getSnapshotSound, getServerSnapshotSound);

  const setEnabled = useCallback((value: boolean) => {
    setStored(KEY_ENABLED, value);
  }, []);

  const setSoundEnabled = useCallback((value: boolean) => {
    setStored(KEY_SOUND, value);
  }, []);

  const feedback = useCallback(
    (pattern: FeedbackPattern, opts?: { sound?: boolean }) => {
      if (!enabled) return;
      doFeedback(pattern, { sound: opts?.sound ?? soundEnabled });
    },
    [enabled, soundEnabled]
  );

  return {
    enabled,
    setEnabled,
    soundEnabled,
    setSoundEnabled,
    feedback,
  };
}
