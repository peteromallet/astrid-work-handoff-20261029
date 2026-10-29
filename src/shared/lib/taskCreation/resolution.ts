import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/media/aspectRatios';
import { DEFAULT_ASPECT_RATIO, type ProjectResolutionResult } from './types';

/**
 * Resolution for task admission input sizing.
 *
 * The project `aspect_ratio` column has no route
 * (bridge projects are slug+name; layout authority is the timeline document
 * config). Until a declared aspect source exists, resolution degrades to the
 * app default unless the caller passes an explicit custom resolution — a
 * documented degradation, not a silent behavioral fork.
 */
export async function resolveProjectResolution(
  projectId: string,
  customResolution?: string,
): Promise<ProjectResolutionResult> {
  if (customResolution?.trim()) {
    return {
      resolution: customResolution.trim(),
      aspectRatio: 'custom',
    };
  }

  return {
    resolution: ASPECT_RATIO_TO_RESOLUTION[DEFAULT_ASPECT_RATIO],
    aspectRatio: DEFAULT_ASPECT_RATIO,
  };
}
