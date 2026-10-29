import { useEffect, useRef, useState } from 'react';
import type { SpotlightRect } from './useSpotlightRects';

/** Quiet frames needed before a move starts. */
const STABLE_FRAMES = 2;
/** The longest a move waits for things to stop shifting. */
const SETTLE_CAP_MS = 300;
/** Within a beat the cutouts (and the card beside them) move again only for a change bigger than this. */
const RECT_DISTANCE = 2;

interface Settled<T> {
  value: T;
  /** False for the first placement and for a viewport resize, which should jump, not glide. */
  animate: boolean;
  /** The run:act:beat `value` was committed for: the beat the tour is showing, which trails the store's by the settle. */
  beatKey: string;
}

interface SettleOptions<T> {
  /** The run:act:beat the value belongs to; a change always travels, however small. */
  beatKey: string;
  value: T;
  /** Changes whenever `value` does; the hook waits for it to hold still. */
  signature: string;
  /** Whether `next` is far enough from the committed value to justify travelling within a beat. */
  isFar: (committed: T, next: T) => boolean;
  /** A change here (the viewport) commits straight away without animation. */
  jumpKey: string;
}

/**
 * Holds the last committed value, and moves it on once per beat: after `value` has been unchanged for
 * two animation frames (capped at 300 ms). Within a beat it moves again only when the new value is far
 * from the committed one, and then waits to settle the same way. Before the first commit the live
 * value passes through unanimated.
 */
export function useSettledValue<T>({ beatKey, value, signature, isFar, jumpKey }: SettleOptions<T>): Settled<T> {
  const [state, setState] = useState<Settled<T> | null>(null);
  const committed = useRef<{ value: T; beatKey: string; jumpKey: string } | null>(null);
  const latest = useRef({ value, beatKey, jumpKey });
  latest.current = { value, beatKey, jumpKey };
  const capTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capBeat = useRef<string | null>(null);

  const clearCap = () => {
    if (capTimer.current) clearTimeout(capTimer.current);
    capTimer.current = null;
    capBeat.current = null;
  };
  const commit = (animate: boolean) => {
    const { value: next, beatKey: key, jumpKey: jump } = latest.current;
    clearCap();
    committed.current = { value: next, beatKey: key, jumpKey: jump };
    setState({ value: next, animate, beatKey: key });
  };

  useEffect(() => {
    const done = committed.current;
    if (done && done.jumpKey !== jumpKey) {
      commit(false);
      return;
    }
    const newBeat = !done || done.beatKey !== beatKey;
    if (!newBeat && done && !isFar(done.value, value)) {
      clearCap(); // drifted back, or never left
      return;
    }
    // Pending: the cap runs from the first change (or from the start of a new beat), not from each frame.
    if (!capTimer.current || (newBeat && capBeat.current !== beatKey)) {
      clearCap();
      capBeat.current = beatKey;
      capTimer.current = setTimeout(() => commit(!!committed.current), SETTLE_CAP_MS);
    }
    let frames = 0;
    let frame = 0;
    const tick = () => {
      frames += 1;
      if (frames >= STABLE_FRAMES) commit(!!committed.current);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatKey, signature, jumpKey]);

  useEffect(() => clearCap, []);

  return state ?? { value, animate: false, beatKey };
}

function useViewportKey(): { width: number; height: number } {
  const read = () => ({ width: window.innerWidth, height: window.innerHeight });
  const [viewport, setViewport] = useState(read);
  useEffect(() => {
    const onResize = () => setViewport((previous) => {
      const next = read();
      return previous.width === next.width && previous.height === next.height ? previous : next;
    });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return viewport;
}

const rectsSignature = (rects: readonly SpotlightRect[]) => rects.map((r) => `${r.x},${r.y},${r.width},${r.height}`).join(';');

/**
 * The spotlight's rects, settled so the cutouts and the card glide once per beat instead of chasing targets
 * that are still moving (a row sliding in, the timeline scrolling). The returned `beatKey` is the beat they
 * belong to: the card shows that beat, so its content changes as it starts to move, not before.
 */
export function useSettledRects(beatKey: string, rects: readonly SpotlightRect[]): Settled<readonly SpotlightRect[]> {
  const viewport = useViewportKey();
  return useSettledValue<readonly SpotlightRect[]>({
    beatKey,
    value: rects,
    signature: rectsSignature(rects),
    isFar: (a, b) => a.length !== b.length || a.some((r, i) => [r.x - b[i].x, r.y - b[i].y, r.width - b[i].width, r.height - b[i].height].some((d) => Math.abs(d) > RECT_DISTANCE)),
    jumpKey: `${viewport.width}x${viewport.height}`,
  });
}
