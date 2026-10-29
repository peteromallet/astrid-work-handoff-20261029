import { useMemo } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import { filterTimelineEligiblePositionedImages } from '@/shared/lib/timelineEligibility';
import { useTimelinePositionUtils } from '../../../../hooks/timeline/useTimelinePositionUtils';
import { usePositionManagement } from '../usePositionManagement';

const NO_GENERATIONS: GenerationRow[] = [];

interface UseTimelineDomainServiceInput {
  shotId: string;
  projectId?: string;
  frameSpacing: number;
  isDragInProgress: boolean;
  onFramePositionsChange?: (framePositions: Map<string, number>) => void;
  propShotGenerations?: GenerationRow[];
  propImages?: GenerationRow[];
  propAllGenerations?: GenerationRow[];
  readOnly: boolean;
}

interface UseTimelineDomainServiceResult {
  shotGenerations: GenerationRow[];
  images: GenerationRow[];
  readOnlyGenerations: GenerationRow[] | undefined;
  positions: Map<string, number>;
  updatePositions: (positions: Map<string, number>) => Promise<void>;
  actualPairPrompts: Record<number, { prompt: string; negativePrompt: string }>;
  loadPositions: (opts?: { silent?: boolean; reason?: string }) => void | Promise<void>;
}

/**
 * Domain/application service boundary for Timeline data.
 * Consolidates position/query orchestration and keeps Timeline.tsx as view composition.
 */
export function useTimelineDomainService(input: UseTimelineDomainServiceInput): UseTimelineDomainServiceResult {
  const {
    shotId,
    projectId,
    frameSpacing,
    isDragInProgress,
    onFramePositionsChange,
    propShotGenerations,
    propImages,
    propAllGenerations,
    readOnly,
  } = input;

  const allGenerations = propAllGenerations ?? NO_GENERATIONS;
  const utilsHookData = useTimelinePositionUtils({
    shotId,
    generations: allGenerations,
    projectId,
  });

  const shotGenerations: GenerationRow[] = propShotGenerations ?? allGenerations;
  const loadPositions = utilsHookData.loadPositions;
  const actualPairPrompts = utilsHookData.pairPrompts;

  const images = useMemo(() => {
    let result: GenerationRow[] = propImages ?? shotGenerations;
    result = filterTimelineEligiblePositionedImages(result);

    result = result.sort((a, b) => {
      const frameDiff = (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0);
      if (frameDiff !== 0) return frameDiff;
      return String(a.id ?? '').localeCompare(String(b.id ?? ''));
    });

    return result;
  }, [shotGenerations, propImages]);

  const readOnlyGenerations = readOnly ? propAllGenerations : undefined;

  const {
    positions,
    updatePositions,
  } = usePositionManagement({
    shotId,
    shotGenerations,
    frameSpacing,
    isDragInProgress,
    onFramePositionsChange,
  });

  return {
    shotGenerations,
    images,
    readOnlyGenerations,
    positions,
    updatePositions,
    actualPairPrompts,
    loadPositions,
  };
}
