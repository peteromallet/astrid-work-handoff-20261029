import { describe, expect, it, vi } from 'vitest';
import { footageVolume } from '@astrid/packs/astrid_motion/rendering/elements/effects/am-footage/volume.ts';
import { getEffectiveClipVolume } from '@/tools/video-editor/lib/clip-volume';
import { getClipVolume, isClipMuted } from '@/tools/video-editor/lib/editor-utils';
import { buildAudioMixRequest } from '@/tools/video-editor/compositions/audio-analysis/audioAnalysisClient';
import { resolveWaveformAudioSrc } from '@/tools/video-editor/components/TimelineEditor/TimelineEditorCore';
import type { ResolvedTimelineClip, TrackDefinition } from '@/tools/video-editor/types';

const asset = { file: 'webcam.mp4', src: 'https://m/webcam.mp4', type: 'video/mp4', duration: 10 };
const clip = (patch: Partial<ResolvedTimelineClip>): ResolvedTimelineClip => ({
  id: 'c', at: 0, track: 'V1', asset: 'a', assetEntry: asset, ...patch,
} as ResolvedTimelineClip);
const visual = { id: 'V1', kind: 'visual', label: 'V1' } as TrackDefinition;

// The render plays am-footage at footageVolume(clip.volume, params.volume).
const renderVolume = (c: ResolvedTimelineClip) => footageVolume(c.volume, c.params?.volume);

describe('effective clip volume: editor preview equals render', () => {
  for (const volume of [undefined, 0, 0.5]) {
    const label = volume === undefined ? 'unset' : String(volume);
    const footage = clip({ clipType: 'am-footage', volume });
    const footageRef = clip({ volume, elementRef: { id: 'am-footage', kind: 'effect', revision: '1' } });

    it(`am-footage with ${label} volume plays what the render plays`, () => {
      expect(getEffectiveClipVolume(footage)).toBe(renderVolume(footage));
      expect(getEffectiveClipVolume(footageRef)).toBe(renderVolume(footageRef));
      // and every editor consumer reads the same value
      expect(getClipVolume(footage)).toBe(renderVolume(footage));
      expect(buildAudioMixRequest([footage], 30).spec.clips[0].volume).toBe(renderVolume(footage));
      expect(Boolean(resolveWaveformAudioSrc(footage, visual))).toBe(renderVolume(footage) > 0);
    });
  }

  it('unset am-footage is silent in the editor, as in the render', () => {
    const c = clip({ clipType: 'am-footage' });
    expect(getEffectiveClipVolume(c)).toBe(0);
    expect(isClipMuted(c)).toBe(true);
    expect(resolveWaveformAudioSrc(c, visual)).toBeUndefined();
  });

  it('plain media clips default to 1 and honour explicit values', () => {
    expect(getEffectiveClipVolume(clip({ clipType: 'media' }))).toBe(1);
    expect(getEffectiveClipVolume(clip({}))).toBe(1);
    expect(getEffectiveClipVolume(clip({ volume: 0 }))).toBe(0);
    expect(getEffectiveClipVolume(clip({ volume: 0.5 }))).toBe(0.5);
  });

  it('an invalid explicit volume falls back to the element default, like the render', () => {
    const bad = clip({ clipType: 'am-footage', volume: -1 });
    expect(getEffectiveClipVolume(bad)).toBe(renderVolume(bad));
  });

  it('the legacy volume param wins over the manifest default only when clip.volume is unset', () => {
    const legacy = clip({ clipType: 'am-footage', params: { volume: 0.25 } });
    expect(getEffectiveClipVolume(legacy)).toBe(renderVolume(legacy));
    const explicit = clip({ clipType: 'am-footage', volume: 0.75, params: { volume: 0.25 } });
    expect(getEffectiveClipVolume(explicit)).toBe(renderVolume(explicit));
  });
});

describe('clamp to the element-declared max', () => {
  it('am-footage never exceeds 1, like footageVolume', () => {
    const c = clip({ clipType: 'am-footage', volume: 1.5 });
    expect(getEffectiveClipVolume(c)).toBe(renderVolume(c));
  });
  it('plain media is not capped', () => {
    expect(getEffectiveClipVolume(clip({ clipType: 'media', volume: 1.5 }))).toBe(1.5);
  });
});

describe('runtime-admitted elements', () => {
  it('feed their manifest default and max into the same rule', async () => {
    const admitted = await import('@/tools/video-editor/runtime/admitted-elements');
    const spy = vi.spyOn(admitted, 'getAdmittedElementSelection').mockReturnValue({
      elements: [{ descriptor: { id: 'proj-footage', packId: 'proj', defaults: { volume: 0.25 }, parameters: [{ name: 'volume', max: 0.5 }] } }],
    } as never);
    try {
      const c = clip({ elementRef: { id: 'proj-footage', packId: 'proj', kind: 'effect', revision: '1' } });
      expect(getEffectiveClipVolume(c)).toBe(0.25);
      expect(getEffectiveClipVolume({ ...c, volume: 0.9 })).toBe(0.5);
      expect(getEffectiveClipVolume({ ...c, volume: 0 })).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
});
