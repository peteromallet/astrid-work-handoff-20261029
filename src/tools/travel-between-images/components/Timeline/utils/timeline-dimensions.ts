import { TRAILING_ENDPOINT_KEY } from './timeline-constants';

const MINIMUM_TIMELINE_MAX = 30;

export const getTimelineDimensions = (
  framePositions: Map<string, number>,
  pendingFrames?: (number | null)[]
) => {
  const positions = Array.from(framePositions.values());
  const validPendingFrames = (pendingFrames || []).filter((f): f is number => f !== null && f !== undefined);
  const allPositions = [...positions, ...validPendingFrames];

  if (allPositions.length === 0) {
    return { fullMin: 0, fullMax: MINIMUM_TIMELINE_MAX, fullRange: MINIMUM_TIMELINE_MAX };
  }

  const staticMax = Math.max(...allPositions, 0);
  const staticMin = Math.min(...allPositions, 0);
  const fullMax = Math.max(staticMax, MINIMUM_TIMELINE_MAX);
  const fullMin = Math.min(0, staticMin);
  const fullRange = Math.max(fullMax - fullMin, 1);

  return { fullMin, fullMax, fullRange };
};

interface TrailingEffectiveEndInput {
  framePositions: Map<string, number>;
  imagesCount: number;
  hasExistingTrailingVideo: boolean;
  singleImageOffset?: number;
  multiImageOffset?: number;
}

export function getTrailingEffectiveEnd({
  framePositions,
  imagesCount,
  hasExistingTrailingVideo,
  singleImageOffset = 49,
  multiImageOffset = 17,
}: TrailingEffectiveEndInput): number | null {
  if (imagesCount === 0) {
    return null;
  }

  const isMultiImage = imagesCount > 1;
  if (isMultiImage && !hasExistingTrailingVideo) {
    return null;
  }

  const trailingDefaultOffset = isMultiImage ? multiImageOffset : singleImageOffset;
  const imageValues = [...framePositions.entries()]
    .filter(([id]) => id !== TRAILING_ENDPOINT_KEY)
    .map(([, value]) => value);
  if (imageValues.length === 0) {
    return null;
  }
  return Math.max(...imageValues) + trailingDefaultOffset;
}
