import { getClipDurationInFrames } from '@/tools/video-editor/lib/config-utils.ts';
import type { TimelineClip } from '@/tools/video-editor/types/index.ts';

/**
 * Audio fades exactly as Astrid's renderer applies them.
 *
 * `@banodoco/timeline-composition` (>= 0.0.6, `AudioTrack.tsx`) reads
 * `params.fadeIn` / `params.fadeOut` in seconds, rounds each to whole frames,
 * and multiplies the clip's gain by a linear per-frame ramp over the clip's own
 * frames: up from 0 at frame 0, and down to 0 at `durationFrames`. Overlapping
 * ramps multiply. The renderer keeps a plain number when there is no fade.
 *
 * The renderer's ramp is an inline closure, so it cannot be imported.
 * `audioFade.test.tsx` runs the vendored renderer component and pins this
 * module to it frame by frame.
 */
export type AudioFade = Readonly<{
  fadeInFrames: number;
  fadeOutFrames: number;
  /** The clip's length in frames; the fade-out ends here. */
  durationFrames: number;
}>;

export type AudioVolumeProp = number | ((frame: number) => number);

const toFiniteSeconds = (value: unknown): number => (
  typeof value !== 'number' || !Number.isFinite(value) || value <= 0 ? 0 : value
);

export function getAudioFade(clip: TimelineClip, fps: number): AudioFade | null {
  const params = clip.params ?? {};
  const fadeInFrames = Math.round(toFiniteSeconds(params.fadeIn) * fps);
  const fadeOutFrames = Math.round(toFiniteSeconds(params.fadeOut) * fps);
  if (fadeInFrames <= 0 && fadeOutFrames <= 0) return null;
  return { fadeInFrames, fadeOutFrames, durationFrames: getClipDurationInFrames(clip, fps) };
}

/** Gain multiplier in [0, 1] at `frame`, counted from the clip's first frame. */
export function audioFadeGain(fade: AudioFade, frame: number): number {
  let multiplier = 1;
  if (fade.fadeInFrames > 0 && frame < fade.fadeInFrames) {
    multiplier *= Math.max(0, frame / fade.fadeInFrames);
  }
  if (fade.fadeOutFrames > 0 && frame > fade.durationFrames - fade.fadeOutFrames) {
    multiplier *= Math.max(0, (fade.durationFrames - frame) / fade.fadeOutFrames);
  }
  return multiplier;
}

/**
 * Remotion `volume` prop with the renderer's semantics: the plain gain when
 * the clip has no fade, otherwise a per-frame ramp.
 *
 * Remotion calls a volume function with the frame counted from the enclosing
 * Sequence's start. The editor can start that Sequence later than the clip
 * itself (a canonical clip bounded to its shot occurrence); `frameOffset` is
 * that difference, so the ramp stays anchored to the clip, as in the render.
 */
export function getAudioVolumeProp(
  baseVolume: number,
  fade: AudioFade | null,
  frameOffset = 0,
): AudioVolumeProp {
  if (!fade) return baseVolume;
  return (frame: number) => baseVolume * audioFadeGain(fade, frame + frameOffset);
}
