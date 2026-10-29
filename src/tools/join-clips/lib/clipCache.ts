import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

function getLocalStorageKey(projectId: string): string {
  return `join-clips-count-${projectId}`;
}

const MAX_CACHED_CLIPS_COUNT = 500;

export function getCachedClipsCount(projectId: string | null): number {
  if (!projectId) return 0;
  try {
    const cached = localStorage.getItem(getLocalStorageKey(projectId));
    if (!cached) return 0;

    const parsed = Number.parseInt(cached, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_CACHED_CLIPS_COUNT) {
      normalizeAndPresentError(new Error('Invalid join-clips cached count'), {
        context: 'JoinClipsCache.read.invalid',
        showToast: false,
        logData: { projectId, cached },
      });
      return 0;
    }
    return parsed;
  } catch (error) {
    normalizeAndPresentError(error, {
      context: 'JoinClipsCache.read.error',
      showToast: false,
      logData: { projectId },
    });
    return 0;
  }
}

export function setCachedClipsCount(projectId: string | null, count: number): void {
  if (!projectId) return;
  try {
    const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    if (normalizedCount > 0) {
      localStorage.setItem(getLocalStorageKey(projectId), normalizedCount.toString());
    } else {
      localStorage.removeItem(getLocalStorageKey(projectId));
    }
  } catch (error) {
    normalizeAndPresentError(error, {
      context: 'JoinClipsCache.write.error',
      showToast: false,
      logData: { projectId, count },
    });
  }
}
