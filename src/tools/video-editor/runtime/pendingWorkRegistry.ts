import type { ExtensionPendingWorkState } from '@/sdk/context.ts';

const EMPTY: ExtensionPendingWorkState = Object.freeze({ writing: false, unsaved: false });

/** Editor-local pending work from any extension, aggregated for navigation. */
export function createPendingWorkRegistry() {
  const entries = new Map<string, ExtensionPendingWorkState>();
  const listeners = new Set<() => void>();
  let current = EMPTY;
  const publish = () => {
    const next = {
      writing: [...entries.values()].some((state) => state.writing),
      unsaved: [...entries.values()].some((state) => state.unsaved),
    };
    if (next.writing === current.writing && next.unsaved === current.unsaved) return;
    current = Object.freeze(next);
    for (const listener of listeners) listener();
  };
  return {
    report(extensionId: string, state: ExtensionPendingWorkState) {
      entries.set(extensionId, { writing: !!state.writing, unsaved: !!state.unsaved });
      publish();
    },
    clear(extensionId: string) { entries.delete(extensionId); publish(); },
    snapshot: () => current,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export type PendingWorkRegistry = ReturnType<typeof createPendingWorkRegistry>;
