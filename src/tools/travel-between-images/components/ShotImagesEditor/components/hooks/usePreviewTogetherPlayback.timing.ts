import type { PreviewSegment } from '../PreviewTogetherTypes';

const THUMBNAIL_WIDTH = 64;
const THUMBNAIL_GAP = 8;

export function computeSegmentTiming(segments: PreviewSegment[]): {
  durations: number[];
  offsets: number[];
} {
  const durations = segments.map((segment) => segment.durationFromFrames || 2);
  const offsets: number[] = [0];
  for (let idx = 0; idx < durations.length - 1; idx += 1) {
    offsets.push(offsets[idx] + durations[idx]);
  }
  return { durations, offsets };
}

export function scrollCurrentThumbnailIntoView(
  container: HTMLDivElement,
  currentPreviewIndex: number,
  totalSegments: number,
): void {
  if (totalSegments <= 0) {
    return;
  }

  const itemTotalWidth = THUMBNAIL_WIDTH + THUMBNAIL_GAP;
  const containerWidth = container.offsetWidth;
  const totalContentWidth = (totalSegments * THUMBNAIL_WIDTH) + ((totalSegments - 1) * THUMBNAIL_GAP);

  if (totalContentWidth <= containerWidth) {
    return;
  }

  const thumbnailCenter = (currentPreviewIndex * itemTotalWidth) + (THUMBNAIL_WIDTH / 2);
  const idealScrollLeft = thumbnailCenter - (containerWidth / 2);
  const maxScroll = totalContentWidth - containerWidth;
  const clampedScrollLeft = Math.max(0, Math.min(maxScroll, idealScrollLeft));

  container.scrollTo({
    left: clampedScrollLeft,
    behavior: 'smooth',
  });
}
