import { useMemo, useRef } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface UseInheritedDefaultsOptions<T> {
  shotId: string | null | undefined;
  storageKeyForShot: (shotId: string) => string;
  mergeDefaults: (defaults: Record<string, unknown>) => T;
  context: string;
}

export function useSessionInheritedDefaults<T>({
  shotId,
  storageKeyForShot,
  mergeDefaults,
  context,
}: UseInheritedDefaultsOptions<T>): T | null {
  const appliedShotRef = useRef<string | null>(null);
  const cachedValueRef = useRef<T | null>(null);

  return useMemo(() => {
    if (!shotId || typeof window === 'undefined') return null;
    // Once we've resolved inherited defaults for this shot, keep returning the
    // same value across renders so downstream effects gated on status === 'ready'
    // (e.g. saveImmediate in useShotSettings) can still observe them after the
    // initial sessionStorage read.
    if (appliedShotRef.current === shotId) return cachedValueRef.current;

    const storageKey = storageKeyForShot(shotId);
    const rawDefaults = sessionStorage.getItem(storageKey);
    if (!rawDefaults) {
      appliedShotRef.current = shotId;
      cachedValueRef.current = null;
      return null;
    }

    try {
      const parsedDefaults = JSON.parse(rawDefaults) as Record<string, unknown>;
      sessionStorage.removeItem(storageKey);
      appliedShotRef.current = shotId;
      const merged = mergeDefaults(parsedDefaults);
      cachedValueRef.current = merged;
      return merged;
    } catch (error) {
      normalizeAndPresentError(error, { context, showToast: false });
      sessionStorage.removeItem(storageKey);
      appliedShotRef.current = shotId;
      cachedValueRef.current = null;
      return null;
    }
  }, [shotId, storageKeyForShot, mergeDefaults, context]);
}
