import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Whether the hosted build's "Astrid stopped" or "Astrid restarted" card is on screen. The card (`RuntimeConnectionPill`)
 * is the one thing that tells the person what to do, so the editor's own technical messages about the same failure
 * (a stale canonical read, a timeline that would not load, an `Error` save badge) read this and stay quiet.
 */
let showing = false;
const listeners = new Set<() => void>();

export function setRecoveryCardShowing(next: boolean): void {
  if (showing === next) return;
  showing = next;
  for (const listener of listeners) listener();
}

export function isRecoveryCardShowing(): boolean {
  return showing;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useRecoveryCardShowing(): boolean {
  return useSyncExternalStore(subscribe, isRecoveryCardShowing, () => false);
}

/**
 * Runs `onCleared` when the card goes away (Astrid answered again). Messages the editor hid while the card was up
 * were about reads that failed during the stop, so the reader of those reads retries them here and the page carries
 * on without a click.
 */
export function useOnRecoveryCardCleared(onCleared: () => void): void {
  const showing = useRecoveryCardShowing();
  const wasShowing = useRef(showing);
  const latest = useRef(onCleared);
  useEffect(() => {
    latest.current = onCleared;
  });
  useEffect(() => {
    if (wasShowing.current && !showing) latest.current();
    wasShowing.current = showing;
  }, [showing]);
}
