import type { VideoEditorShotsHost } from '@/tools/video-editor/runtime/ports.ts';

/**
 * True until the canonical shots (and the clips and tracks they hold) have arrived or failed.
 * Load-time chrome that depends on them (the unused-track count, the preview's first frame)
 * waits on this instead of showing a value that is about to change.
 */
export function areShotsSettling(shots: VideoEditorShotsHost | null | undefined): boolean {
  if (!shots) return false;
  if (shots.isLoading) return true;
  return Boolean(shots.shotComposition)
    && !shots.canonicalComposition
    && !shots.canonicalCompositionError
    && !shots.error;
}
