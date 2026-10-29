import { describe, expect, it } from 'vitest';
import type { ResolvedTimelineClip } from '@/tools/video-editor/types/index.ts';
import { timelineNeedsAudioAnalysis } from './audioAnalysisDemand.ts';

const clip = (overrides: Partial<ResolvedTimelineClip> = {}): ResolvedTimelineClip => ({
  id: 'clip',
  clipType: 'image',
  track: 'V1',
  at: 0,
  hold: 2,
  params: {},
  ...overrides,
});

describe('timelineNeedsAudioAnalysis', () => {
  it('stays disabled when there is no audio-reactive visual consumer', () => {
    expect(timelineNeedsAudioAnalysis([clip()], [], [], [])).toBe(false);
  });

  it('enables analysis for the audio-reactive colour effect', () => {
    expect(timelineNeedsAudioAnalysis([clip({ clipType: 'audio-reactive-colour' })], [], [], [])).toBe(true);
  });

  it('enables analysis for a declared audio-binding parameter', () => {
    expect(timelineNeedsAudioAnalysis(
      [clip({ clipType: 'extension:reactive' })],
      [],
      [],
      [{ clipTypeId: 'extension:reactive', schema: [{ type: 'audio-binding' }] }],
    )).toBe(true);
  });

  it('enables analysis for a binding value with an unknown dynamic source', () => {
    expect(timelineNeedsAudioAnalysis(
      [clip({ params: { binding: { source: '{{audio.source}}', min: 0, max: 1 } } })],
      [],
      [],
      [],
    )).toBe(true);
  });

  it('enables analysis when a dynamic effect has no inspectable schema', () => {
    expect(timelineNeedsAudioAnalysis(
      [clip({ clipType: 'custom:effect' })],
      [],
      [{ clipType: 'custom:effect' }],
      [],
    )).toBe(true);
  });
});
