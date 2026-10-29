import type { VideoClip } from '../../clipTypes';

/** Clear a clip's video content but keep the slot. */
export function clearClipVideo(clip: VideoClip): VideoClip {
  return {
    ...clip,
    url: '',
    posterUrl: undefined,
    finalFrameUrl: undefined,
    file: undefined,
    loaded: false,
    playing: false,
  };
}
