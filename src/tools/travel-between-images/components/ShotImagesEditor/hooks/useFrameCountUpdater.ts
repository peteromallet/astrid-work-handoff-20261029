/**
 * Hook for updating pair frame counts on the timeline.
 * Handles the complex logic of shifting subsequent images and compression.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GenerationRow } from '@/domains/generation/types';
import { runSerializedTimelineWrite } from '@/shared/lib/timelineWriteQueue';
import { queryKeys } from '@/shared/lib/queryKeys';
import { persistTimelineFrameBatch } from '@/shared/lib/timelineFrameBatchPersist';

function shortId(id: string | null | undefined): string | null {
  return id ? id.slice(0, 8) : null;
}
const log = import.meta.env.DEV ? (...args: Parameters<typeof console.log>) => console.log(...args) : () => {};

interface UseFrameCountUpdaterProps {
  /** Current shot id (used to serialize timeline writes) */
  shotId: string | null;
  /** Shot generations (images) */
  shotGenerations: GenerationRow[];
  /** Current generation mode */
  generationMode: 'batch' | 'timeline' | 'by-pair';
  /** Maximum frame limit for a single pair */
  maxFrameLimit: number;
  /** Reload positions after update */
  loadPositions: (options?: { silent?: boolean; reason?: string }) => Promise<void>;
}

interface UseFrameCountUpdaterReturn {
  /** Update the frame count for a pair, shifting subsequent images as needed */
  updatePairFrameCount: (pairShotGenerationId: string, newFrameCount: number) => Promise<{ finalFrameCount: number } | void>;
}

/**
 * Provides a function to update the frame count for a pair.
 *
 * For pairs with an end image: shifts subsequent images forward.
 * Trailing segments (no end image) have no document-native frame count to write, so they are left unchanged.
 *
 * When exceeding maxFrameLimit, compresses subsequent pairs proportionally.
 */
export function useFrameCountUpdater({
  shotId,
  shotGenerations,
  generationMode,
  maxFrameLimit,
  loadPositions,
}: UseFrameCountUpdaterProps): UseFrameCountUpdaterReturn {
  const SEGMENT_FRAME_LOG_PREFIX = '[SegmentFramePersist]';
  const queryClient = useQueryClient();

  const logQueuePhase = useCallback((
    phase: 'queued' | 'start' | 'end',
    meta: {
      shotId: string;
      operation: string;
      waitMs: number;
      durationMs: number;
      queueDepth: number;
    },
  ) => {
    if (phase === 'queued') {
      log(`${SEGMENT_FRAME_LOG_PREFIX} write queue queued`, {
        shotId: shortId(meta.shotId),
        operation: meta.operation,
        waitMs: meta.waitMs,
        durationMs: meta.durationMs,
        queueDepth: meta.queueDepth,
      });
      return;
    }

    if (phase === 'start') {
      log(`${SEGMENT_FRAME_LOG_PREFIX} write queue start`, {
        shotId: shortId(meta.shotId),
        operation: meta.operation,
        waitMs: meta.waitMs,
        queueDepth: meta.queueDepth,
      });
      return;
    }

    log(`${SEGMENT_FRAME_LOG_PREFIX} write queue end`, {
      shotId: shortId(meta.shotId),
      operation: meta.operation,
      waitMs: meta.waitMs,
      durationMs: meta.durationMs,
      queueDepth: meta.queueDepth,
    });
  }, []);

  const updatePairFrameCount = useCallback(async (
    pairShotGenerationId: string,
    newFrameCount: number
  ) => {
    // Only works in timeline mode
    if (!shotId || !shotGenerations?.length || generationMode !== 'timeline') {
      return;
    }

    // Sort images by frame position
    const sortedImages = [...shotGenerations]
      .filter((img) => img.timeline_frame != null && img.timeline_frame >= 0)
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

    // Find the image by id
    const pairIndex = sortedImages.findIndex((img) => img.id === pairShotGenerationId);
    if (pairIndex === -1) {
      return;
    }

    const startImage = sortedImages[pairIndex];
    const startFrame = startImage.timeline_frame ?? 0;
    const isTrailingSegment = pairIndex === sortedImages.length - 1;

    // Calculate effective frame count (capped at maxFrameLimit)
    const effectiveNewFrameCount = Math.min(newFrameCount, maxFrameLimit);

    if (isTrailingSegment) {
      return;
    }

    // Standard case: pair with end image - shift subsequent images
    const endImage = sortedImages[pairIndex + 1];
    const currentFrameCount = (endImage.timeline_frame ?? 0) - startFrame;
    const exceedsMax = newFrameCount > maxFrameLimit;

    // Collect subsequent pairs for potential compression
    const subsequentPairs: Array<{ startIdx: number; endIdx: number; originalFrames: number }> = [];
    for (let j = pairIndex + 1; j < sortedImages.length - 1; j++) {
      const pairStart = sortedImages[j];
      const pairEnd = sortedImages[j + 1];
      subsequentPairs.push({
        startIdx: j,
        endIdx: j + 1,
        originalFrames: (pairEnd.timeline_frame ?? 0) - (pairStart.timeline_frame ?? 0),
      });
    }

    // Calculate how much we can borrow from subsequent pairs
    const overflow = exceedsMax ? newFrameCount - maxFrameLimit : 0;
    const needsCompression = overflow > 0 && subsequentPairs.length > 0;
    const totalSubsequentFrames = subsequentPairs.reduce((sum, p) => sum + p.originalFrames, 0);
    const minTotalSubsequent = subsequentPairs.length; // 1 frame minimum per pair
    const maxBorrowable = Math.max(0, totalSubsequentFrames - minTotalSubsequent);
    const actualBorrow = Math.min(overflow, maxBorrowable);
    const finalFrameCount = effectiveNewFrameCount + actualBorrow;
    const finalDelta = finalFrameCount - currentFrameCount;

    if (finalDelta === 0) {
      return;
    }

    // Calculate new positions
    const updates: Array<{ id: string; newFrame: number }> = [];

    if (needsCompression && actualBorrow > 0) {
      // Compress subsequent pairs proportionally
      const targetTotal = totalSubsequentFrames - actualBorrow;
      const compressionRatio = targetTotal / totalSubsequentFrames;

      let currentFrame = startFrame + finalFrameCount;
      updates.push({ id: sortedImages[pairIndex + 1].id, newFrame: currentFrame });

      for (let i = 0; i < subsequentPairs.length; i++) {
        const pair = subsequentPairs[i];
        const compressedFrames = Math.max(1, Math.min(maxFrameLimit, Math.round(pair.originalFrames * compressionRatio)));
        currentFrame += compressedFrames;

        if (pair.endIdx < sortedImages.length) {
          updates.push({ id: sortedImages[pair.endIdx].id, newFrame: currentFrame });
        }
      }
    } else {
      // Simple shift: add delta to all subsequent images
      for (let j = pairIndex + 1; j < sortedImages.length; j++) {
        const img = sortedImages[j];
        const newFrame = (img.timeline_frame ?? 0) + finalDelta;
        updates.push({ id: img.id, newFrame });
      }
    }

    // Apply updates to database
    await runSerializedTimelineWrite(
      shotId,
      'segment-pair-frame-update',
      async (signal) => {
        await persistTimelineFrameBatch({
          shotId,
          updates: updates.map((update) => ({
            shotGenerationId: update.id,
            timelineFrame: update.newFrame,
            metadata: {
              user_positioned: true,
              drag_source: 'segment-frame-count',
            },
          })),
          operationLabel: 'segment-pair-frame-update',
          timeoutOperationName: 'segment-pair-frame-rpc',
          signal,
          logPrefix: SEGMENT_FRAME_LOG_PREFIX,
          log: (message, payload) => {
            log(message, {
              ...payload,
              pairShotGenerationId: shortId(pairShotGenerationId),
            });
          },
        });

      },
      logQueuePhase,
    );

    // Refresh data
    if (loadPositions) {
      await loadPositions({ silent: true, reason: 'frame-count-update' });
    }
    queryClient.refetchQueries({ queryKey: queryKeys.segments.liveTimeline(shotId) });

    return { finalFrameCount };
  }, [
    shotId,
    shotGenerations,
    generationMode,
    loadPositions,
    maxFrameLimit,
    logQueuePhase,
    queryClient,
  ]);

  return { updatePairFrameCount };
}
