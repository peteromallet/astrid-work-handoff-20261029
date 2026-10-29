/**
 * useImageManagement - Image reorder management hook
 *
 * Extracted from ShotEditor to reduce component size.
 * Handles:
 * - Image reorder within shot timeline
 * - Pending position tracking
 */

import { useCallback, useRef } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { GenerationRow, Shot } from '@/domains/generation/types';

interface ReorderUpdate {
  shotId: string;
  projectId: string;
  updates: Array<{ shot_id: string; generation_id: string; timeline_frame: number }>;
}

interface UseImageManagementOptions {
  selectedShotRef: React.MutableRefObject<Shot | undefined>;
  projectIdRef: React.MutableRefObject<string | null>;
  allShotImagesRef: React.MutableRefObject<GenerationRow[]>;
  batchVideoFramesRef: React.MutableRefObject<number>;
  updateShotImageOrderMutation: {
    mutate: (params: ReorderUpdate, options?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => void;
  };
  actionsRef: React.MutableRefObject<{ setPendingFramePositions: (value: Map<string, number>) => void }>;
  pendingFramePositions: Map<string, number>;
}

interface UseImageManagementReturn {
  // Image reorder
  handleReorderImagesInShot: (orderedShotGenerationIds: string[], draggedItemId?: string) => void;
  // Pending positions
  handlePendingPositionApplied: (generationId: string) => void;
}

export function useImageManagement({
  selectedShotRef,
  projectIdRef,
  allShotImagesRef,
  batchVideoFramesRef,
  updateShotImageOrderMutation,
  actionsRef,
  pendingFramePositions,
}: UseImageManagementOptions): UseImageManagementReturn {
  // Refs for stable callbacks
  const updateShotImageOrderMutationRef = useRef(updateShotImageOrderMutation);
  updateShotImageOrderMutationRef.current = updateShotImageOrderMutation;

  const pendingFramePositionsRef = useRef(pendingFramePositions);
  pendingFramePositionsRef.current = pendingFramePositions;

  // Handler for reordering images in shot timeline
  const handleReorderImagesInShot = useCallback((orderedShotGenerationIds: string[]) => {
    const shot = selectedShotRef.current;
    const projId = projectIdRef.current;

    if (!shot || !projId) {
      normalizeAndPresentError(new Error('Cannot reorder images: No shot or project selected.'), { context: 'ShotEditor', showToast: false });
      return;
    }

    // Convert ordered IDs into timeline_frame updates
    const updates = orderedShotGenerationIds.map((shotGenerationId, index) => ({
      shot_id: shot.id,
      generation_id: (() => {
        const img = allShotImagesRef.current?.find((i) => i.id === shotGenerationId);
        return img?.generation_id ?? shotGenerationId;
      })(),
      timeline_frame: index * batchVideoFramesRef.current,
    }));

    updateShotImageOrderMutationRef.current.mutate({
      shotId: shot.id,
      projectId: projId,
      updates,
    }, {
      onError: (error: unknown) => {
        normalizeAndPresentError(error, { context: 'ShotEditor', showToast: false });
      }
    });
  }, [selectedShotRef, projectIdRef, allShotImagesRef, batchVideoFramesRef]);

  // Handler for clearing applied pending positions
  const handlePendingPositionApplied = useCallback((generationId: string) => {
    const newMap = new Map(pendingFramePositionsRef.current);
    if (newMap.has(generationId)) {
      newMap.delete(generationId);
    }
    actionsRef.current.setPendingFramePositions(newMap);
  }, [actionsRef]);

  return {
    handleReorderImagesInShot,
    handlePendingPositionApplied,
  };
}
