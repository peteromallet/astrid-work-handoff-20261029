import { createElement, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { SceneSurface } from './SceneSurface';
import { shotStills, STILL_HEIGHT, STILL_WIDTH, type ShotStillStore } from './shotStills';
import type { SceneStatus } from './runtime';

/** Keep the hidden instance alive this long after the queue empties, so a page turn reuses it. */
const LINGER_MS = 4000;
/** Where the hidden instance rests between stills, so asking for a shot at t=0 is always a new frame. */
const PARK_TIME = 1e-6;

function whenIdle(run: () => void): () => void {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void });
  if (typeof idle.requestIdleCallback === 'function') {
    const id = idle.requestIdleCallback(run, { timeout: 1500 });
    return () => idle.cancelIdleCallback?.(id);
  }
  const id = setTimeout(run, 60);
  return () => clearTimeout(id);
}

/**
 * Renders queued start-frame stills for one world, one at a time, in a hidden dedicated scene instance.
 * Mount once per open world, next to the viewer. It draws nothing visible, mounts the instance only while
 * stills are wanted, and waits for an idle moment before each one.
 */
export function ShotStillRenderer({ source, revision, store = shotStills }: { source: unknown; revision: string; store?: ShotStillStore }) {
  const version = useSyncExternalStore(store.subscribe, store.version, store.version);
  const [current, setCurrent] = useState<number | null>(null);
  const [lingering, setLingering] = useState(false);
  const currentRef = useRef<number | null>(null);
  currentRef.current = current;
  const waiting = store.busy(revision);

  // Pick the next still when none is in flight, once the page is idle.
  useEffect(() => {
    if (current !== null) return;
    if (!store.busy(revision)) return;
    return whenIdle(() => {
      if (currentRef.current !== null) return;
      const next = store.take(revision);
      if (next) setCurrent(next.start);
    });
  }, [store, revision, current, version]);

  // Linger, then release the hidden instance (and its WebGL context).
  useEffect(() => {
    if (waiting || current !== null) { setLingering(true); return; }
    const timer = setTimeout(() => setLingering(false), LINGER_MS);
    return () => clearTimeout(timer);
  }, [waiting, current]);

  // A new revision abandons whatever was in flight.
  useEffect(() => () => { setCurrent(null); }, [revision]);

  const onStatus = (status: SceneStatus) => {
    const start = currentRef.current;
    if (start === null) return;
    if (status.phase === 'ready' && status.sourceTime === start) {
      if (status.image) store.fulfil(revision, start, status.image); else store.fail(revision, start);
      setCurrent(null);
    } else if (status.phase === 'error') {
      store.failRevision(revision);
      setCurrent(null);
    }
  };

  if (!lingering && current === null && !waiting) return null;
  return createElement('div', {
    'aria-hidden': true, 'data-testid': 'shot-still-renderer',
    style: { position: 'fixed', left: 0, top: 0, width: STILL_WIDTH, height: STILL_HEIGHT, opacity: 0, pointerEvents: 'none', zIndex: -1, overflow: 'hidden' },
  }, createElement(SceneSurface, {
    source, sourceTime: current ?? PARK_TIME, width: STILL_WIDTH, height: STILL_HEIGHT, capture: true, onStatus,
  }));
}
