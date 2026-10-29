import { GenerationRow } from '@/domains/generation/types';
import { getPairIdentifiers } from './segmentDataTransforms';
import { ExpectedSegmentData, LiveTimelineRow, SegmentSlot } from './segmentOutputTypes';

interface BuildSegmentSlotsArgs {
  segments: GenerationRow[];
  expectedSegmentData: ExpectedSegmentData | null;
  effectiveTimelineData: LiveTimelineRow[] | undefined;
  liveShotGenIdToPosition: Map<string, number>;
  localShotGenPositions?: Map<string, number>;
  trailingShotGenId?: string;
}

export function buildSegmentSlots({
  segments,
  expectedSegmentData,
  effectiveTimelineData,
  liveShotGenIdToPosition,
  localShotGenPositions,
  trailingShotGenId,
}: BuildSegmentSlotsArgs): SegmentSlot[] {
  const hasLocalPositions = !!localShotGenPositions && localShotGenPositions.size > 0;
  const localPositionCount = localShotGenPositions?.size ?? 0;
  const useLocalPositions = hasLocalPositions;
  const positionMap = useLocalPositions ? localShotGenPositions : liveShotGenIdToPosition;
  const baseSlotCount = useLocalPositions
    ? localPositionCount - 1
    : (effectiveTimelineData?.length ? effectiveTimelineData.length - 1 : 0);
  const slotCount = trailingShotGenId ? baseSlotCount + 1 : baseSlotCount;

  if (slotCount === 0) {
    if (!effectiveTimelineData) {
      return [];
    }

    return segments.map((child, index) => ({
      type: 'child' as const,
      child,
      index: child.child_order ?? index,
    }));
  }

  const slots: SegmentSlot[] = [];
  const childrenBySlot = new Map<number, GenerationRow>();
  // Segments whose start image is at the last position — no valid gap exists
  // after them, but they should still be discoverable by pairShotGenerationId.
  const orphanedAtEnd: GenerationRow[] = [];

  segments.forEach((child) => {
    const childParams = child.params as Record<string, unknown> | null;
    const { pairShotGenId } = getPairIdentifiers(child, childParams);
    const childOrder = child.child_order;
    let derivedSlot: number | undefined;
    let isAtEnd = false;
    let pairShotGenPosition: number | undefined;

    if (pairShotGenId && positionMap.has(pairShotGenId)) {
      pairShotGenPosition = positionMap.get(pairShotGenId)!;
      const isTrailingSegment = trailingShotGenId && pairShotGenId === trailingShotGenId;

      if (pairShotGenPosition < slotCount || isTrailingSegment) {
        derivedSlot = pairShotGenPosition;
      } else {
        isAtEnd = true;
      }
    }

    if (derivedSlot === undefined && typeof childOrder === 'number' && childOrder >= 0 && childOrder < slotCount) {
      derivedSlot = childOrder;
    }

    if (isAtEnd) {
      orphanedAtEnd.push(child);
      return;
    }

    if (derivedSlot !== undefined && !childrenBySlot.has(derivedSlot)) {
      childrenBySlot.set(derivedSlot, child);
    } else if (derivedSlot !== undefined && childrenBySlot.has(derivedSlot)) {
      const existing = childrenBySlot.get(derivedSlot)!;
      if (!existing.location && child.location) {
        childrenBySlot.set(derivedSlot, child);
      }
    }
  });

  for (let i = 0; i < slotCount; i++) {
    const child = childrenBySlot.get(i);
    const liveStartImage = effectiveTimelineData?.[i];
    const liveEndImage = effectiveTimelineData?.[i + 1];
    const pairShotGenerationId = liveStartImage?.id || expectedSegmentData?.pairShotGenIds?.[i];

    if (child) {
      const childPsgId = getPairIdentifiers(
        child,
        child.params as Record<string, unknown> | null,
      ).pairShotGenId;
      slots.push({
        type: 'child',
        child,
        index: i,
        pairShotGenerationId: childPsgId || pairShotGenerationId,
      });
    } else {
      slots.push({
        type: 'placeholder',
        index: i,
        expectedFrames: expectedSegmentData?.frames[i],
        expectedPrompt: expectedSegmentData?.prompts[i],
        startImage: liveStartImage?.generation_id || expectedSegmentData?.inputImages[i],
        endImage: liveEndImage?.generation_id || expectedSegmentData?.inputImages[i + 1],
        pairShotGenerationId,
      });
    }
  }

  // Append segments whose start image is at the last position. They have no
  // valid gap to render in, but must be in the output so ImageGrid can find
  // them via pairShotGenerationId (image-based lookup).
  for (const child of orphanedAtEnd) {
    const childPsgId = getPairIdentifiers(
      child,
      child.params as Record<string, unknown> | null,
    ).pairShotGenId;
    if (childPsgId) {
      slots.push({
        type: 'child',
        child,
        index: -1,
        pairShotGenerationId: childPsgId,
      });
    }
  }

  return slots;
}
