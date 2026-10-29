import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { persistTimelineFrameBatch } from '@/shared/lib/timelineFrameBatchPersist';
import type { GenerationRow } from '@/domains/generation/types';
import type { Shot } from '@/domains/generation/types';
import type {
  ApplyResult,
  ExtractedGenerationSettings,
} from './types';

const LOG_PREFIX = '[ApplySettings]';

/**
 * Apply frame positions from segment_frames_expanded to existing images.
 * Settings applied from a task keep the shot's images and move them onto the
 * task's positions.
 */
export const applyFramePositionsToExistingImages = async (
  settings: ExtractedGenerationSettings,
  selectedShot: Shot | null,
  simpleFilteredImages: GenerationRow[],
): Promise<ApplyResult> => {
  const segmentGaps = settings.segmentFramesExpanded;
  const hasSegmentGaps = Array.isArray(segmentGaps) && segmentGaps.length > 0;

  if (!hasSegmentGaps) {
    return { success: true, settingName: 'framePositions', details: 'no data' };
  }

  if (!selectedShot?.id) {
    return { success: true, settingName: 'framePositions', details: 'skipped - no shot' };
  }

  // Calculate cumulative positions from gaps
  const cumulativePositions: number[] = [0]; // First image always at frame 0
  for (let i = 0; i < segmentGaps.length; i++) {
    const prevPosition = cumulativePositions[cumulativePositions.length - 1];
    cumulativePositions.push(prevPosition + segmentGaps[i]);
  }

  try {
    const updates = simpleFilteredImages.flatMap((img, index) => {
      // img.id is the shot_generations.id
      if (!img.id) {
        return [];
      }

      // Use cumulative position if available
      const timelineFrame = index < cumulativePositions.length
        ? cumulativePositions[index]
        : cumulativePositions[cumulativePositions.length - 1] + (index - cumulativePositions.length + 1) * (segmentGaps[segmentGaps.length - 1] || 60);

      return [{ shotGenerationId: img.id, timelineFrame }];
    });

    const { updateCount } = await persistTimelineFrameBatch({
      shotId: selectedShot.id,
      updates,
      operationLabel: 'apply-settings-frame-positions',
      timeoutOperationName: 'apply-settings-frame-positions-write',
      logPrefix: LOG_PREFIX,
      log: (message, payload) => {
        if (import.meta.env.DEV) console.log(message, payload);
      },
    });

    return {
      success: true,
      settingName: 'framePositions',
      details: { updated: updateCount, total: simpleFilteredImages.length },
    };
  } catch (e) {
    const appError = normalizeAndPresentError(e, {
      context: 'ApplySettings.applyFramePositions',
      showToast: false,
    });
    return {
      success: false,
      settingName: 'framePositions',
      error: appError.message,
    };
  }
};
