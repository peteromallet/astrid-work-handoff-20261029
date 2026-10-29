import type { PreviewSegment } from '../PreviewTogetherTypes';

export interface UsePreviewTogetherPlaybackParams {
  isOpen: boolean;
  previewableSegments: PreviewSegment[];
  audioUrl?: string | null;
  initialPairIndex?: number | null;
}

export type VideoSlot = 'A' | 'B';

export interface VideoHandlers {
  onClick: () => void;
  onPlay: () => void;
  onPause: () => void;
  onTimeUpdate: () => void;
  onSeeked: () => void;
  onLoadedMetadata: () => void;
  onEnded: () => void;
}

export const NOOP_VIDEO_HANDLERS: VideoHandlers = {
  onClick: () => undefined,
  onPlay: () => undefined,
  onPause: () => undefined,
  onTimeUpdate: () => undefined,
  onSeeked: () => undefined,
  onLoadedMetadata: () => undefined,
  onEnded: () => undefined,
};
