import { useCallback, useEffect, useRef, useState } from 'react';
import { assertNativeEditorConnection } from '@/integrations/astrid/nativeEditorConnection.ts';

type Attempt = { scope: string; generation: number };
/** Fresh authenticated recovery of the mounted native editor, preserving its data owner. */
export function useNativeEditorRecovery({
  enabled, scope, onRecovered,
}: { enabled: boolean; scope: string; onRecovered(): void }) {
  const current = useRef({ scope, generation: 0, remaining: 3 });
  if (current.current.scope !== scope) {
    current.current = { scope, generation: current.current.generation + 1, remaining: 3 };
  }
  const recovered = useRef(onRecovered);
  recovered.current = onRecovered;
  const [failure, setFailure] = useState<Attempt | null>(null);
  const [retrying, setRetrying] = useState(false);
  const matches = useCallback((attempt: Attempt) =>
    attempt.scope === current.current.scope && attempt.generation === current.current.generation, []);
  const beginManualAttempt = useCallback((): Attempt => {
    const attempt = { scope: current.current.scope, generation: ++current.current.generation };
    setFailure(null);
    return attempt;
  }, []);
  const completeRecovery = useCallback((attempt: Attempt) => {
    if (!matches(attempt)) return false;
    current.current.generation += 1;
    current.current.remaining = 3;
    setFailure(null);
    recovered.current();
    return true;
  }, [matches]);
  const reportFailure = useCallback(() => {
    setFailure({ scope: current.current.scope, generation: ++current.current.generation });
  }, []);

  useEffect(() => {
    if (!enabled || !failure || !matches(failure) || current.current.remaining === 0) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const verify = async () => {
      if (!active || !matches(failure) || current.current.remaining === 0) return;
      current.current.remaining -= 1;
      setRetrying(true);
      try {
        await assertNativeEditorConnection();
        if (active) completeRecovery(failure);
      } catch {
        if (active && matches(failure) && current.current.remaining > 0) {
          timer = setTimeout(() => void verify(), 3000);
        }
      } finally {
        if (active) setRetrying(false);
      }
    };
    void verify();
    return () => { active = false; clearTimeout(timer); setRetrying(false); };
  }, [enabled, scope, failure, matches, completeRecovery]);

  return { reportFailure, beginManualAttempt, completeRecovery, retrying };
}
