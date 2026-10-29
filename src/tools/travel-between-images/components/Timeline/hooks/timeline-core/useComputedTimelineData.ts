import { useMemo } from 'react';
import { getPairInfo, sortPositionEntries, TRAILING_ENDPOINT_KEY } from '../../utils/timeline-utils';
import { TIMELINE_PADDING_OFFSET } from '../../constants';
import type { GenerationRow } from '@/domains/generation/types';

interface UseComputedTimelineDataProps {
  currentPositions: Map<string, number>;
  images: GenerationRow[];

  containerWidth: number;
  fullRange: number;
  zoomLevel: number;
}

interface UseComputedTimelineDataReturn {
  pairInfo: ReturnType<typeof getPairInfo>;
  localShotGenPositions: Map<string, number>;
  showPairLabels: boolean;
}

export function useComputedTimelineData({
  currentPositions,
  images,

  containerWidth,
  fullRange,
  zoomLevel,
}: UseComputedTimelineDataProps): UseComputedTimelineDataReturn {
  const pairInfo = useMemo(() => getPairInfo(currentPositions), [currentPositions]);

  // Image-only positions (excluding trailing endpoint key)
  const imageOnlyPositions = useMemo(() => {
    const filtered = new Map(currentPositions);
    filtered.delete(TRAILING_ENDPOINT_KEY);
    return filtered;
  }, [currentPositions]);

  // Compute shot_generation_id -> position index map
  const localShotGenPositions = useMemo(() => {
    const posMap = new Map<string, number>();
    const sortedEntries = sortPositionEntries(imageOnlyPositions);
    sortedEntries.forEach(([shotGenId], index) => {
      posMap.set(shotGenId, index);
    });
    return posMap;
  }, [imageOnlyPositions]);

  // Calculate whether to show pair labels
  const showPairLabels = useMemo(() => {
    if (images.length < 2) return false;
    const sortedPositions = sortPositionEntries(imageOnlyPositions);
    let totalPairWidth = 0;
    let pairCount = 0;
    for (let i = 0; i < sortedPositions.length - 1; i++) {
      const [, startFrame] = sortedPositions[i];
      const [, endFrame] = sortedPositions[i + 1];
      const frameWidth = endFrame - startFrame;
      const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
      const pixelWidth = (frameWidth / fullRange) * effectiveWidth * zoomLevel;
      totalPairWidth += pixelWidth;
      pairCount++;
    }
    const avgPairWidth = pairCount > 0 ? totalPairWidth / pairCount : 0;
    return avgPairWidth >= 100;
  }, [images.length, imageOnlyPositions, containerWidth, fullRange, zoomLevel]);

  return {
    pairInfo,
    localShotGenPositions,
    showPairLabels,
  };
}
