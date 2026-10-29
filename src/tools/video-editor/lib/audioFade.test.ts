import { describe, expect, it } from 'vitest';
import { audioFadeGain, getAudioFade, getAudioVolumeProp, type AudioFade } from '@/tools/video-editor/lib/audioFade';
import type { TimelineClip } from '@/tools/video-editor/types';

const FPS = 30;

// The film's music bed (project almost-ready): two crossfades, at 28.5 s and 84.4 s.
const chip: TimelineClip = { id: 'music-chip', track: 'music', at: 0, from: 0, to: 31.5, volume: 0.5129, params: { fadeOut: 3 } };
const piano: TimelineClip = { id: 'music-piano', track: 'music', at: 28.5, from: 28.5, to: 88.4, volume: 0.7674, params: { fadeIn: 3, fadeOut: 4 } };
const orch: TimelineClip = { id: 'music-orch', track: 'music', at: 84.4, from: 123.46, to: 199.393331, volume: 0.263, params: { fadeIn: 4, fadeOut: 3 } };

function gainAt(clip: TimelineClip, compositionSecond: number): number {
  const fade = getAudioFade(clip, FPS);
  const frame = Math.round(compositionSecond * FPS) - Math.round(clip.at * FPS);
  return fade ? audioFadeGain(fade, frame) : 1;
}

describe('audio fades (renderer semantics)', () => {
  it('rounds fade lengths to whole frames and ends the fade-out at the clip end', () => {
    expect(getAudioFade(chip, FPS)).toEqual({ fadeInFrames: 0, fadeOutFrames: 90, durationFrames: 945 });
    expect(getAudioFade(piano, FPS)).toEqual({ fadeInFrames: 90, fadeOutFrames: 120, durationFrames: 1797 });
    expect(getAudioFade(orch, FPS)).toEqual({ fadeInFrames: 120, fadeOutFrames: 90, durationFrames: 2278 });
  });

  it('crossfades the chiptune into the piano over 28.5–31.5 s instead of overlapping at full level', () => {
    expect(gainAt(chip, 28.5)).toBe(1);
    expect(gainAt(piano, 28.5)).toBe(0);
    expect(gainAt(chip, 30)).toBeCloseTo(0.5, 10);
    expect(gainAt(piano, 30)).toBeCloseTo(0.5, 10);
    expect(gainAt(chip, 31.5)).toBe(0);
    expect(gainAt(piano, 31.5)).toBe(1);
  });

  it('crossfades the piano into the orchestra over 84.4–88.4 s and fades the orchestra out at the end', () => {
    expect(gainAt(piano, 84.4)).toBe(1);
    expect(gainAt(orch, 84.4)).toBe(0);
    expect(gainAt(piano, 86.4)).toBeCloseTo(0.5, 10);
    expect(gainAt(orch, 86.4)).toBeCloseTo(0.5, 10);
    expect(gainAt(piano, 88.4)).toBe(0);
    expect(gainAt(orch, 88.4)).toBe(1);
    expect(gainAt(orch, 158.8)).toBeCloseTo(0.5, 1);
  });

  it('multiplies overlapping fade-in and fade-out ramps', () => {
    const fade: AudioFade = { fadeInFrames: 20, fadeOutFrames: 20, durationFrames: 30 };
    expect(audioFadeGain(fade, 15)).toBeCloseTo((15 / 20) * (15 / 20), 12);
  });

  it('keeps a plain gain without a valid fade, as the renderer does', () => {
    for (const params of [undefined, {}, { fadeIn: 0 }, { fadeIn: -1, fadeOut: Number.NaN }, { fadeIn: '2' }, { fadeOut: Infinity }]) {
      const clip: TimelineClip = { ...chip, params: params as TimelineClip['params'] };
      expect(getAudioFade(clip, FPS)).toBeNull();
      expect(getAudioVolumeProp(0.4, getAudioFade(clip, FPS))).toBe(0.4);
    }
  });

  it('anchors the ramp to the authored clip when playback starts later', () => {
    const fade = getAudioFade(piano, FPS)!;
    const volume = getAudioVolumeProp(1, fade, 30) as (frame: number) => number;
    // One second into the played Sequence is two seconds into the clip.
    expect(volume(30)).toBeCloseTo(audioFadeGain(fade, 60), 12);
  });
});
