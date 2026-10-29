import type { CSSProperties } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import { TIMELINE_PADDING_OFFSET } from './constants';
import { getAspectRatioStyle as getProjectAspectRatioStyle } from '@/shared/components/ShotImageManager/utils/image-utils';

interface TimelineItemPositionInput {
  timelineWidth: number;
  fullMinFrames: number;
  fullRange: number;
  framePosition: number;
  isDragging: boolean;
  dragOffset: { x: number; y: number } | null;
  originalFramePos: number;
  currentDragFrame: number | null;
}

export function getTimelineItemAspectRatioStyle(
  image: GenerationRow,
  projectAspectRatio?: string,
): CSSProperties {
  let width = image.metadata?.width as number | undefined;
  let height = image.metadata?.height as number | undefined;

  if (!width || !height) {
    const originalParams = image.metadata?.originalParams as Record<string, unknown> | undefined;
    const orchestratorDetails = originalParams?.orchestrator_details as Record<string, unknown> | undefined;
    const resolution = orchestratorDetails?.resolution as string | undefined;
    if (resolution && resolution.includes('x')) {
      const [w, h] = resolution.split('x').map(Number);
      if (!Number.isNaN(w) && !Number.isNaN(h)) {
        width = w;
        height = h;
      }
    }
  }

  if (width && height) {
    return { aspectRatio: `${width / height}` };
  }

  return getProjectAspectRatioStyle(projectAspectRatio);
}

export function getTimelineItemPosition({
  timelineWidth,
  fullMinFrames,
  fullRange,
  framePosition,
  isDragging,
  dragOffset,
  originalFramePos,
  currentDragFrame,
}: TimelineItemPositionInput): { leftPercent: number; displayFrame: number } {
  const effectiveWidth = timelineWidth - (TIMELINE_PADDING_OFFSET * 2);
  const pixelPosition = TIMELINE_PADDING_OFFSET + ((framePosition - fullMinFrames) / fullRange) * effectiveWidth;

  let finalX = pixelPosition;
  if (isDragging && dragOffset) {
    const originalPixel = TIMELINE_PADDING_OFFSET + ((originalFramePos - fullMinFrames) / fullRange) * effectiveWidth;
    finalX = originalPixel + dragOffset.x;
  }

  const displayFrame = isDragging && currentDragFrame !== null ? currentDragFrame : framePosition;
  const leftPercent = (finalX / timelineWidth) * 100;

  return { leftPercent, displayFrame };
}
