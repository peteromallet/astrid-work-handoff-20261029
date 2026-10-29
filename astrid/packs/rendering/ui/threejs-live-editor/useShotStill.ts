import { useEffect, useSyncExternalStore } from 'react';
import { shotStills, type ShotStillStore, type StillState } from './shotStills';

/** The current state of one start-frame still; re-renders when it settles. Queues it on first use. */
export function useShotStill(revision: string, start: number, store: ShotStillStore = shotStills): StillState {
  useEffect(() => { store.request(revision, [start]); }, [store, revision, start]);
  useSyncExternalStore(store.subscribe, store.version, store.version);
  return store.get(revision, start);
}
