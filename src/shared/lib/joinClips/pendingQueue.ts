const LEGACY_PENDING_JOIN_CLIPS_KEY = 'pendingJoinClips';
const PENDING_JOIN_CLIPS_KEY_PREFIX = 'pendingJoinClips';

export interface PendingJoinClipEntry {
  videoUrl: string;
  thumbnailUrl?: string;
  generationId: string;
  timestamp: number;
  projectId?: string;
}

interface PendingJoinClipScope {
  projectId?: string | null;
}

function normalizeScopePart(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getPendingJoinClipsStorageKey(
  projectId: string | null | undefined,
): string {
  const normalizedProjectId = normalizeScopePart(projectId);
  if (!normalizedProjectId) {
    return LEGACY_PENDING_JOIN_CLIPS_KEY;
  }
  return `${PENDING_JOIN_CLIPS_KEY_PREFIX}:${normalizedProjectId}`;
}

export function getPendingJoinClipsCandidateKeys(
  scope: PendingJoinClipScope,
): string[] {
  const scopedKey = getPendingJoinClipsStorageKey(scope.projectId);
  return scopedKey === LEGACY_PENDING_JOIN_CLIPS_KEY
    ? [LEGACY_PENDING_JOIN_CLIPS_KEY]
    : [scopedKey, LEGACY_PENDING_JOIN_CLIPS_KEY];
}

export function isPendingJoinClipInScope(
  entry: PendingJoinClipEntry,
  scope: PendingJoinClipScope,
): boolean {
  const normalizedProjectId = normalizeScopePart(scope.projectId);
  if (normalizedProjectId) {
    const entryProjectId = normalizeScopePart(entry.projectId);
    if (entryProjectId && entryProjectId !== normalizedProjectId) {
      return false;
    }
  }

  return true;
}
