import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  getPendingJoinClipsCandidateKeys,
  getPendingJoinClipsStorageKey,
  isPendingJoinClipInScope,
  type PendingJoinClipEntry,
} from '@/shared/lib/joinClips/pendingQueue';
import { consumeJoinClipsIntents } from '@/shared/lib/joinClips/intentStore';
import { generateUUID } from '@/shared/lib/taskCreation';
import {
  operationFailure,
  operationSuccess,
  type OperationResult,
} from '@/shared/lib/operationResult';
import type { VideoClip } from '../clipTypes';
import { mediaCrossOrigin } from '@/shared/lib/media/mediaCrossOrigin';

const PENDING_CLIPS_TTL_MS = 5 * 60 * 1000;

interface PendingJoinClipParseResult {
  entries: PendingJoinClipEntry[];
  invalidCount: number;
}

function parsePendingJoinClips(raw: string): PendingJoinClipParseResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  const entries: PendingJoinClipEntry[] = [];
  let invalidCount = 0;
  for (const value of parsed) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      invalidCount += 1;
      continue;
    }

    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.videoUrl !== 'string'
      || typeof candidate.generationId !== 'string'
      || typeof candidate.timestamp !== 'number'
      || !Number.isFinite(candidate.timestamp)
    ) {
      invalidCount += 1;
      continue;
    }

    entries.push({
      videoUrl: candidate.videoUrl,
      generationId: candidate.generationId,
      timestamp: candidate.timestamp,
      ...(typeof candidate.thumbnailUrl === 'string' && candidate.thumbnailUrl.length > 0
        ? { thumbnailUrl: candidate.thumbnailUrl }
        : {}),
      ...(typeof candidate.projectId === 'string' && candidate.projectId.length > 0
        ? { projectId: candidate.projectId }
        : {}),
    });
  }

  return { entries, invalidCount };
}

/** Create a throwaway <video> to read duration from a URL. */
function getVideoDurationFromUrl(videoUrl: string): Promise<number> {
  return new Promise<number>(resolve => {
    const videoElement = document.createElement('video');
    videoElement.preload = 'metadata';
    videoElement.onloadedmetadata = () => resolve(videoElement.duration);
    videoElement.onerror = () => resolve(0);
    videoElement.crossOrigin = mediaCrossOrigin(videoUrl) ?? null;
    videoElement.src = videoUrl;
  });
}

/**
 * Reads and consumes pending join clips from localStorage.
 * Returns deferred actions that are applied to clip state later.
 * Placement is intentionally not resolved here because only the consumer has
 * the previous clip array needed to choose fill-vs-append.
 */
export type PendingClipAction = {
  type: 'deferred_insert';
  clip: VideoClip;
};

interface ConsumePendingJoinClipsOptions {
  projectId?: string | null;
  readVideoDuration?: (videoUrl: string) => Promise<number>;
}

async function toPendingClipActions(
  entries: PendingJoinClipEntry[],
  readVideoDuration: (videoUrl: string) => Promise<number>,
): Promise<PendingClipAction[]> {
  const actions: PendingClipAction[] = [];

  for (const { videoUrl, thumbnailUrl, generationId } of entries) {
    if (!videoUrl) continue;

    const durationSeconds = await readVideoDuration(videoUrl);

    const clip: VideoClip = {
      id: generateUUID(),
      url: videoUrl,
      posterUrl: thumbnailUrl,
      durationSeconds,
      loaded: false,
      playing: false,
      generationId,
    };

    actions.push({ type: 'deferred_insert', clip });
  }

  return actions;
}

export async function tryConsumePendingJoinClips(
  options: ConsumePendingJoinClipsOptions = {},
): Promise<OperationResult<PendingClipAction[]>> {
  const projectId = options.projectId ?? null;
  const readVideoDuration = options.readVideoDuration ?? getVideoDurationFromUrl;

  try {
    const inMemoryPending = consumeJoinClipsIntents({ projectId });
    if (inMemoryPending.length > 0) {
      const now = Date.now();
      const scopedRecentClips = inMemoryPending.filter(
        (clip) =>
          now - clip.timestamp < PENDING_CLIPS_TTL_MS
          && isPendingJoinClipInScope(clip, { projectId }),
      );
      if (scopedRecentClips.length === 0) {
        localStorage.removeItem(getPendingJoinClipsStorageKey(projectId));
        return operationSuccess([]);
      }

      const actions = await toPendingClipActions(scopedRecentClips, readVideoDuration);
      localStorage.removeItem(getPendingJoinClipsStorageKey(projectId));
      return operationSuccess(actions);
    }

    const pendingKeys = getPendingJoinClipsCandidateKeys({ projectId });
    const pendingSource = pendingKeys
      .map((key) => ({ key, raw: localStorage.getItem(key) }))
      .find((item) => typeof item.raw === 'string' && item.raw.length > 0);

    if (!pendingSource || !pendingSource.raw) {
      return operationSuccess([]);
    }

    const parsedPendingClips = parsePendingJoinClips(pendingSource.raw);
    if (!parsedPendingClips) {
      normalizeAndPresentError(new Error('Invalid pending join clips payload'), {
        context: 'JoinClipsPage.pendingClipsInvalid',
        showToast: false,
        logData: { key: pendingSource.key },
      });
      localStorage.removeItem(pendingSource.key);
      return operationFailure(new Error('Invalid pending join clips payload'), {
        policy: 'degrade',
        errorCode: 'pending_join_clips_invalid_payload',
        message: 'Invalid pending join clips payload',
        recoverable: true,
        cause: { key: pendingSource.key },
      });
    }

    if (parsedPendingClips.invalidCount > 0) {
      normalizeAndPresentError(new Error('Dropped invalid pending join clip entries'), {
        context: 'JoinClipsPage.pendingClipsPartialRecovery',
        showToast: false,
        logData: {
          key: pendingSource.key,
          totalEntries: parsedPendingClips.entries.length + parsedPendingClips.invalidCount,
          invalidEntries: parsedPendingClips.invalidCount,
        },
      });
    }

    const now = Date.now();
    const recentClips = parsedPendingClips.entries.filter(
      clip => now - clip.timestamp < PENDING_CLIPS_TTL_MS,
    );
    const scopedRecentClips = recentClips.filter((clip) =>
      isPendingJoinClipInScope(clip, { projectId }),
    );

    if (scopedRecentClips.length === 0) {
      localStorage.removeItem(pendingSource.key);
      return operationSuccess([], {
        ...(parsedPendingClips.invalidCount > 0 ? { policy: 'degrade' } : {}),
      });
    }

    const actions = await toPendingClipActions(scopedRecentClips, readVideoDuration);

    localStorage.removeItem(pendingSource.key);
    return operationSuccess(actions, {
      ...(parsedPendingClips.invalidCount > 0 ? { policy: 'degrade' } : {}),
    });
  } catch (error) {
    normalizeAndPresentError(error, { context: 'JoinClipsPage', showToast: false });
    return operationFailure(error, {
      policy: 'degrade',
      errorCode: 'pending_join_clips_read_failed',
      message: 'Failed to consume pending join clips',
      recoverable: true,
      cause: error,
    });
  }
}

/**
 * Apply pending clip actions to an existing clips array.
 * Resolves each deferred action by filling the first available empty slot,
 * or appending when no empty slots remain.
 */
export function applyPendingClipActions(
  prevClips: VideoClip[],
  actions: PendingClipAction[],
): VideoClip[] {
  let clips = [...prevClips];
  // Track which indices have been filled by previous actions in this batch
  const filledIndices = new Set<number>();

  for (const action of actions) {
    const emptyIndex = clips.findIndex(
      (clip, idx) => !clip.url && !filledIndices.has(idx),
    );

    if (emptyIndex !== -1) {
      clips = clips.map((clip, idx) =>
        idx === emptyIndex
          ? {
              ...clip,
              url: action.clip.url,
              posterUrl: action.clip.posterUrl,
              durationSeconds: action.clip.durationSeconds,
              loaded: false,
              playing: false,
              generationId: action.clip.generationId,
            }
          : clip,
      );
      filledIndices.add(emptyIndex);
    } else {
      clips = [...clips, action.clip];
    }
  }

  return clips;
}
