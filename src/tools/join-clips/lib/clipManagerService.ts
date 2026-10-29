/**
 * Backward-compatible facade for Join Clips clip management services.
 *
 * Logic lives in focused modules under `lib/clipManager/`.
 */

// Re-export everything from clipInitService so existing consumers keep working.
export {
  getCachedClipsCount,
  setCachedClipsCount,
  preloadPosterImages,
  tryConsumePendingJoinClips,
  applyPendingClipActions,
  buildInitialClipsFromSettings,
  padClipsWithEmptySlots,
  createEmptyClip,
} from './clipInitService';

export {
  buildClipsToSave,
  buildPromptsToSave,
} from './clipManager/serialization';

export {
  getClipsNeedingDuration,
  tryLoadClipDuration,
} from './clipManager/metadata';

export {
  normalizeClipSlots,
} from './clipManager/normalization';

export {
  reorderClipsAndPrompts,
} from './clipManager/ordering';

export {
  clearClipVideo,
} from './clipManager/updates';
