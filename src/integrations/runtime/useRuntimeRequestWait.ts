import { useEffect, useState } from 'react';

/** An attention deadline, not a request timeout: a cold Runtime can keep starting. */
export const RUNTIME_REQUEST_WAIT_MS = 15_000;

export function useRuntimeRequestWait(pending: boolean, attempt: unknown): boolean {
  const [waitingAttempt, setWaitingAttempt] = useState<{ key: unknown } | null>(null);
  useEffect(() => {
    setWaitingAttempt(null);
    if (!pending) return;
    const timer = setTimeout(() => setWaitingAttempt({ key: attempt }), RUNTIME_REQUEST_WAIT_MS);
    return () => clearTimeout(timer);
  }, [pending, attempt]);
  return pending && waitingAttempt?.key === attempt;
}
