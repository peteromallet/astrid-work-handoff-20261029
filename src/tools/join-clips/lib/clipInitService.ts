/**
 * Clip initialization/public entrypoint for Join Clips.
 */

import { generateUUID } from '@/shared/lib/taskCreation';
import type { VideoClip } from '../clipTypes';
import { mediaCrossOrigin } from '@/shared/lib/media/mediaCrossOrigin';

export function createEmptyClip(): VideoClip {
  return { id: generateUUID(), url: '', loaded: false, playing: false };
}
export {
  getCachedClipsCount,
  setCachedClipsCount,
} from './clipCache';
export {
  tryConsumePendingJoinClips,
  applyPendingClipActions,
  type PendingClipAction,
} from './clipPendingActions';
export {
  buildInitialClipsFromSettings,
  padClipsWithEmptySlots,
} from './clipBootstrap';

/**
 * Warm the browser image cache for the given poster URLs.
 * Returns a promise that resolves when all images have loaded (or errored).
 */
export function preloadPosterImages(
  posterUrls: string[],
  alreadyPreloaded: Set<string>,
): Promise<void[]> {
  const promises = posterUrls
    .filter(url => url && !alreadyPreloaded.has(url))
    .map(
      url =>
        new Promise<void>(resolve => {
          const img = new Image();
          img.onload = () => {
            alreadyPreloaded.add(url);
            resolve();
          };
          img.onerror = () => resolve();
          img.crossOrigin = mediaCrossOrigin(url) ?? null;
          img.src = url;
        }),
    );
  return Promise.all(promises);
}
