/**
 * Start-frame stills for shots: a small cache and a one-at-a-time queue.
 *
 * Nothing here renders. A ShotStillRenderer (shotStillRenderer.tsx) owns a hidden, dedicated scene
 * instance and drains this queue while the page is idle, so the live viewer is never asked to draw a
 * thumbnail and never competes with one. Entries are keyed by world revision, start time and size, so
 * a new revision never shows a stale still. Failed stills stay failed until the revision changes.
 */

export const STILL_WIDTH = 320;
export const STILL_HEIGHT = 180;
/** Cached stills across worlds; the oldest are dropped first (about 15 KB each). */
export const STILL_CACHE_LIMIT = 256;

export type StillState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly url: string }
  | { readonly status: 'error' };

const IDLE: StillState = Object.freeze({ status: 'idle' });

export interface StillRequest { readonly revision: string; readonly start: number }

export function stillKey(revision: string, start: number, width = STILL_WIDTH, height = STILL_HEIGHT): string {
  return `${revision}|${Math.round(start * 1000) / 1000}|${width}x${height}`;
}

export interface ShotStillStore {
  get(revision: string, start: number): StillState;
  /** Queue stills for these starts (idempotent; ready/errored/queued ones are skipped). */
  request(revision: string, starts: readonly number[]): void;
  /** The next queued request for this revision and marks it loading; null when none is waiting. */
  take(revision: string): StillRequest | null;
  /** True while anything for this revision is queued or loading. */
  busy(revision: string): boolean;
  fulfil(revision: string, start: number, url: string): void;
  fail(revision: string, start: number): void;
  /** The scene itself failed: every queued/loading still of this revision fails. */
  failRevision(revision: string): void;
  subscribe(listener: () => void): () => void;
  /** Bumps on every change; for useSyncExternalStore. */
  version(): number;
}

export function createShotStillStore(limit = STILL_CACHE_LIMIT): ShotStillStore {
  const states = new Map<string, StillState>();
  const queue: StillRequest[] = [];
  const listeners = new Set<() => void>();
  let changes = 0;
  const emit = () => { changes += 1; for (const listener of [...listeners]) listener(); };
  const set = (key: string, state: StillState) => {
    states.delete(key);
    states.set(key, state);
    // Drop the oldest settled entries first; never one that is queued or loading.
    for (const [oldKey, old] of states) {
      if (states.size <= limit) break;
      if (oldKey !== key && (old.status === 'ready' || old.status === 'error')) states.delete(oldKey);
    }
  };
  return {
    get: (revision, start) => states.get(stillKey(revision, start)) ?? IDLE,
    request(revision, starts) {
      let queued = false;
      for (const start of starts) {
        if (!Number.isFinite(start) || start < 0) continue;
        const key = stillKey(revision, start);
        if (states.has(key)) continue;
        set(key, { status: 'loading' });
        queue.push({ revision, start });
        queued = true;
      }
      if (queued) emit();
    },
    take(revision) {
      const index = queue.findIndex((item) => item.revision === revision);
      return index < 0 ? null : queue.splice(index, 1)[0];
    },
    busy(revision) {
      if (queue.some((item) => item.revision === revision)) return true;
      for (const [key, state] of states) if (state.status === 'loading' && key.startsWith(`${revision}|`)) return true;
      return false;
    },
    fulfil(revision, start, url) { set(stillKey(revision, start), { status: 'ready', url }); emit(); },
    fail(revision, start) { set(stillKey(revision, start), { status: 'error' }); emit(); },
    failRevision(revision) {
      for (let index = queue.length - 1; index >= 0; index -= 1) if (queue[index].revision === revision) queue.splice(index, 1);
      for (const [key, state] of [...states]) if (state.status === 'loading' && key.startsWith(`${revision}|`)) set(key, { status: 'error' });
      emit();
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    version: () => changes,
  };
}

/** One shared cache for the whole panel. */
export const shotStills: ShotStillStore = createShotStillStore();
