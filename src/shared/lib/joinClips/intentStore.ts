import {
  getPendingJoinClipsCandidateKeys,
  getPendingJoinClipsStorageKey,
  type PendingJoinClipEntry,
} from '@/shared/lib/joinClips/pendingQueue';

interface JoinClipsIntentScope {
  projectId?: string | null;
}

type JoinClipsIntentListener = (scope: JoinClipsIntentScope) => void;

const intentsByScopeKey = new Map<string, PendingJoinClipEntry[]>();
const listeners = new Set<JoinClipsIntentListener>();

/**
 * In-memory queue for add-to-join intents.
 * This decouples handoff from localStorage read timing.
 */
export function enqueueJoinClipsIntent(
  entry: PendingJoinClipEntry,
  scope: JoinClipsIntentScope,
): void {
  const key = getPendingJoinClipsStorageKey(scope.projectId);
  const existing = intentsByScopeKey.get(key) ?? [];
  if (existing.some((pending) => pending.generationId === entry.generationId)) {
    return;
  }

  intentsByScopeKey.set(key, [...existing, entry]);
  listeners.forEach((listener) => {
    try {
      listener(scope);
    } catch {
      // Intentionally swallow listener errors to keep queue dispatch robust.
    }
  });
}

/**
 * Consume and acknowledge pending intents for the given scope.
 */
export function consumeJoinClipsIntents(scope: JoinClipsIntentScope): PendingJoinClipEntry[] {
  const candidateKeys = getPendingJoinClipsCandidateKeys(scope);
  for (const key of candidateKeys) {
    const pending = intentsByScopeKey.get(key);
    if (!pending || pending.length === 0) {
      continue;
    }

    intentsByScopeKey.delete(key);
    return pending;
  }

  return [];
}

export function subscribeJoinClipsIntents(listener: JoinClipsIntentListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** @internal For unit-test isolation only. */
export function _clearJoinClipsIntentsForTesting(): void {
  intentsByScopeKey.clear();
  listeners.clear();
}
