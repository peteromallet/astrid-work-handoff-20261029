import { useCallback } from 'react';
import { applyFluidTimeline, applyFluidTimelineMulti } from '../../utils/timeline-utils';
import { TIMELINE_PADDING_OFFSET } from '../../constants';
import { resolveSinglePositionConflict } from './positionConflict';

interface UseTapToMoveProps {
  enableTapToMove: boolean;
  framePositions: Map<string, number>;
  setFramePositions: (positions: Map<string, number>) => Promise<void>;
  fullMin: number;
  fullMax: number;
  fullRange: number;
  containerWidth: number;
  selectedIds: string[];
  clearSelection: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
  maxFrameLimit?: number;
}

interface UseTapToMoveReturn {
  handleTapToMoveAction: (imageId: string, targetFrame: number) => Promise<void>;
  handleTapToMoveMultiAction: (imageIds: string[], targetFrame: number) => Promise<void>;
  handleTimelineTapToMove: (clientX: number) => void;
}

export function useTapToMove({
  enableTapToMove,
  framePositions,
  setFramePositions,
  fullMin,
  fullMax,
  fullRange,
  containerWidth,
  selectedIds,
  clearSelection,
  containerRef,
  maxFrameLimit = 81,
}: UseTapToMoveProps): UseTapToMoveReturn {
  const handleTapToMoveAction = useCallback(async (imageId: string, targetFrame: number) => {
    const originalPos = framePositions.get(imageId) ?? 0;
    if (targetFrame === originalPos) return;

    const { positions: newPositions, hadConflict } = resolveSinglePositionConflict(
      framePositions,
      imageId,
      targetFrame,
    );

    if (originalPos === 0 && targetFrame !== 0 && !hadConflict) {
      const nearest = [...framePositions.entries()]
        .filter(([id]) => id !== imageId)
        .sort((a, b) => a[1] - b[1])[0];
      if (nearest) newPositions.set(nearest[0], 0);
    }

    const finalPositions = applyFluidTimeline(newPositions, imageId, targetFrame, undefined, fullMin, fullMax, false, maxFrameLimit);
    await setFramePositions(finalPositions);
    clearSelection();
  }, [framePositions, setFramePositions, fullMin, fullMax, clearSelection, maxFrameLimit]);

  const handleTapToMoveMultiAction = useCallback(async (imageIds: string[], targetFrame: number) => {
    const finalPositions = applyFluidTimelineMulti(framePositions, imageIds, targetFrame, false, maxFrameLimit);
    await setFramePositions(finalPositions);
    clearSelection();
  }, [framePositions, setFramePositions, clearSelection, maxFrameLimit]);

  const handleTimelineTapToMove = useCallback((clientX: number) => {
    if (!enableTapToMove || !containerRef.current || selectedIds.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
    const adjustedX = relativeX - TIMELINE_PADDING_OFFSET;
    const normalizedX = Math.max(0, Math.min(1, adjustedX / effectiveWidth));
    const targetFrame = Math.round(fullMin + (normalizedX * fullRange));

    if (selectedIds.length > 1) {
      handleTapToMoveMultiAction(selectedIds, targetFrame);
    } else {
      handleTapToMoveAction(selectedIds[0], targetFrame);
    }
  }, [enableTapToMove, containerWidth, fullMin, fullRange, selectedIds, handleTapToMoveAction, handleTapToMoveMultiAction, containerRef]);

  return {
    handleTapToMoveAction,
    handleTapToMoveMultiAction,
    handleTimelineTapToMove,
  };
}
