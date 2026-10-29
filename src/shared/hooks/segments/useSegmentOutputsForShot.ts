/**
 * useSegmentOutputsForShot Hook
 *
 * Manages segment outputs for inline display above the timeline.
 * Handles multiple parent generations (different "runs"), their children,
 * and the slot system for partial results. All of it is derived from the
 * generations the caller passes in; without them the hook reports no outputs.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { GenerationRow } from '@/domains/generation/types';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { compareByCreatedAtDesc } from '@/shared/lib/sorting/createdAtSort';
import {
  extractExpectedSegmentData,
  isSegmentGeneration,
} from './segmentDataTransforms';
import { buildSegmentSlots } from './segmentSlotAssignment';
import type {
  ExpectedSegmentData,
  LiveTimelineRow,
  SegmentSlot,
} from './segmentOutputTypes';

export type { SegmentSlot } from './segmentOutputTypes';

interface UseSegmentOutputsReturn {
  parentGenerations: GenerationRow[];
  selectedParentId: string | null;
  setSelectedParentId: (id: string | null) => void;
  selectedParent: GenerationRow | null;
  hasFinalOutput: boolean;
  segmentSlots: SegmentSlot[];
  segments: GenerationRow[];
  segmentProgress: { completed: number; total: number };
  expectedSegmentData: ExpectedSegmentData | null;
}

function deriveParentGenerations(
  preloadedGenerations?: GenerationRow[],
): GenerationRow[] {
  if (!preloadedGenerations) {
    return [];
  }

  const parentIds = new Set<string>();
  preloadedGenerations.forEach((generation) => {
    if (generation.parent_generation_id) {
      parentIds.add(generation.parent_generation_id);
    }
  });

  const parents = preloadedGenerations.filter((generation) => {
    const isVideo = generation.type?.includes('video');
    const isNotChild = !generation.parent_generation_id;
    const hasOrchestratorDetails = !!(
      generation.params as Record<string, unknown> | undefined
    )?.orchestrator_details;
    const generationId = getGenerationId(generation);
    const hasChildren = typeof generationId === 'string' && parentIds.has(generationId);

    return isVideo && isNotChild && (hasOrchestratorDetails || hasChildren);
  });

  parents.sort(compareByCreatedAtDesc);

  return parents;
}

function deriveChildGenerations(
  preloadedGenerations: GenerationRow[] | undefined,
  selectedParentId: string | null,
  parentGenerations: GenerationRow[],
): GenerationRow[] {
  if (!preloadedGenerations || !selectedParentId) {
    return [];
  }

  const selectedParent = parentGenerations.find(
    (parent) => parent.id === selectedParentId || parent.generation_id === selectedParentId,
  );
  const parentGenerationId = selectedParent?.generation_id || selectedParentId;

  return preloadedGenerations.filter((generation) => {
    const parentId = generation.parent_generation_id;
    return parentId === parentGenerationId || parentId === selectedParentId;
  });
}

function deriveTimelineData(
  preloadedGenerations?: GenerationRow[],
): LiveTimelineRow[] | undefined {
  if (!preloadedGenerations) {
    return undefined;
  }

  return preloadedGenerations
    .flatMap((generation) => {
      const timelineFrame = generation.timeline_frame;
      if (timelineFrame === null || timelineFrame === undefined || timelineFrame < 0) {
        return [];
      }
      return [{
        id: generation.id,
        generation_id: generation.generation_id ?? generation.id,
        timeline_frame: timelineFrame,
      }];
    })
    .sort((a, b) => a.timeline_frame - b.timeline_frame);
}

function buildPositionMap(timelineData: LiveTimelineRow[] | undefined): Map<string, number> {
  const map = new Map<string, number>();
  (timelineData || []).forEach((timelineItem, index) => {
    map.set(timelineItem.id, index);
  });
  return map;
}

export function useSegmentOutputsForShot(
  shotId: string | null,
  localShotGenPositions?: Map<string, number>,
  controlledSelectedParentId?: string | null,
  onSelectedParentChange?: (id: string | null) => void,
  preloadedGenerations?: GenerationRow[],
  trailingShotGenId?: string,
): UseSegmentOutputsReturn {
  const [internalSelectedParentId, setInternalSelectedParentId] = useState<string | null>(null);

  const isControlled = controlledSelectedParentId !== undefined;
  const selectedParentId = isControlled ? controlledSelectedParentId : internalSelectedParentId;
  const setSelectedParentId = useCallback((id: string | null) => {
    if (isControlled && onSelectedParentChange) {
      onSelectedParentChange(id);
      return;
    }
    setInternalSelectedParentId(id);
  }, [isControlled, onSelectedParentChange]);

  const parentGenerations = useMemo(
    () => deriveParentGenerations(preloadedGenerations),
    [preloadedGenerations],
  );

  useEffect(() => {
    if (!shotId || isControlled) {
      return;
    }

    if (parentGenerations.length > 0 && !selectedParentId) {
      setSelectedParentId(parentGenerations[0].id);
      return;
    }

    if (parentGenerations.length > 0 && selectedParentId) {
      const selectionExists = parentGenerations.some((parent) => parent.id === selectedParentId);
      if (!selectionExists) {
        setSelectedParentId(parentGenerations[0].id);
      }
    }
  }, [isControlled, parentGenerations, selectedParentId, setSelectedParentId, shotId]);

  const selectedParent = useMemo(() => {
    if (!selectedParentId) {
      return null;
    }
    return parentGenerations.find((parent) => parent.id === selectedParentId) || null;
  }, [parentGenerations, selectedParentId]);

  const childGenerations = useMemo(
    () => deriveChildGenerations(preloadedGenerations, selectedParentId, parentGenerations),
    [preloadedGenerations, selectedParentId, parentGenerations],
  );

  const segments = useMemo(
    () => childGenerations.filter((child) => isSegmentGeneration(child.params as Record<string, unknown> | null)),
    [childGenerations],
  );

  const effectiveTimelineData = useMemo(
    () => deriveTimelineData(preloadedGenerations),
    [preloadedGenerations],
  );

  const liveShotGenIdToPosition = useMemo(
    () => buildPositionMap(effectiveTimelineData),
    [effectiveTimelineData],
  );

  const expectedSegmentData = useMemo(() => {
    if (!selectedParent) {
      return null;
    }
    return extractExpectedSegmentData(selectedParent.params as Record<string, unknown> | null);
  }, [selectedParent]);

  const segmentSlots = useMemo(() => buildSegmentSlots({
    segments,
    expectedSegmentData,
    effectiveTimelineData,
    liveShotGenIdToPosition,
    localShotGenPositions,
    trailingShotGenId,
  }), [
    effectiveTimelineData,
    expectedSegmentData,
    liveShotGenIdToPosition,
    localShotGenPositions,
    segments,
    trailingShotGenId,
  ]);

  const segmentProgress = useMemo(() => {
    const completed = segmentSlots.filter((slot) => slot.type === 'child' && slot.child.location).length;
    return { completed, total: segmentSlots.length };
  }, [segmentSlots]);

  return {
    parentGenerations,
    selectedParentId,
    setSelectedParentId,
    selectedParent,
    hasFinalOutput: !!selectedParent?.location,
    segmentSlots,
    segments,
    segmentProgress,
    expectedSegmentData,
  };
}
