import type { VideoClip } from '../../clipTypes';
import { createEmptyClip } from '../clipInitService';

interface ClipNormalizationResult {
  clips: VideoClip[];
  removedClipIds: string[];
}

/**
 * Normalize the clips array:
 * - Ensure minimum 2 clips
 * - Auto-add empty slot when all slots are filled
 * - Remove extra trailing empties (keep exactly 1 trailing empty)
 *
 * Returns null if no changes are needed.
 */
export function normalizeClipSlots(clips: VideoClip[]): ClipNormalizationResult | null {
  if (clips.length === 0) return null;

  // Ensure minimum of 2
  if (clips.length < 2) {
    const clipsToAdd = 2 - clips.length;
    const newClips = Array.from({ length: clipsToAdd }, () => createEmptyClip());
    return { clips: [...clips, ...newClips], removedClipIds: [] };
  }

  // Auto-add empty slot when all filled
  if (clips.every(clip => clip.url)) {
    return {
      clips: [...clips, createEmptyClip()],
      removedClipIds: [],
    };
  }

  // Find last non-empty clip
  let lastNonEmptyIndex = -1;
  for (let i = clips.length - 1; i >= 0; i--) {
    if (clips[i].url) {
      lastNonEmptyIndex = i;
      break;
    }
  }

  const trailingEmptyCount = clips.length - lastNonEmptyIndex - 1;

  if (trailingEmptyCount > 1) {
    const targetLength = Math.max(2, lastNonEmptyIndex + 2);
    if (clips.length !== targetLength) {
      const removedClipIds = clips.slice(targetLength).map(c => c.id);
      return { clips: clips.slice(0, targetLength), removedClipIds };
    }
  }

  return null;
}
