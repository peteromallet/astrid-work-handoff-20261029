import { describe, expect, it } from 'vitest';
import { getSelectionDefaultClipTab, getTrackMoveTargets } from './clip-inspector.ts';
import type { ResolvedTimelineClip, TrackDefinition } from '@/tools/video-editor/types/index.ts';

const visual: TrackDefinition = { id: 'V1', kind: 'visual', label: 'V1' };
const media = { id: 'clip-1', at: 0, track: 'V1', clipType: 'media', asset: 'a' } as unknown as ResolvedTimelineClip;
const text = { id: 'clip-2', at: 0, track: 'V1', clipType: 'text', hold: 5, text: { content: 'Hi' } } as unknown as ResolvedTimelineClip;

describe('getSelectionDefaultClipTab', () => {
  it('opens a text clip on its words everywhere', () => {
    expect(getSelectionDefaultClipTab(text, visual)).toBe('text');
    expect(getSelectionDefaultClipTab(text, visual, true)).toBe('text');
  });

  it('opens other clips on Effects at a desk and on Timing on touch', () => {
    expect(getSelectionDefaultClipTab(media, visual)).toBe('effects');
    expect(getSelectionDefaultClipTab(media, visual, true)).toBe('timing');
  });
});

describe('getTrackMoveTargets', () => {
  const tracks: TrackDefinition[] = [
    { id: 'V2', kind: 'visual', label: 'V2' },
    { id: 'V1', kind: 'visual', label: 'V1' },
    { id: 'A1', kind: 'audio', label: 'A1' },
  ];

  it('finds a track of the same kind above or below, skipping other kinds', () => {
    expect(getTrackMoveTargets(tracks, 'V2')).toEqual({ up: false, down: true });
    expect(getTrackMoveTargets(tracks, 'V1')).toEqual({ up: true, down: false });
    expect(getTrackMoveTargets(tracks, 'A1')).toEqual({ up: false, down: false });
  });

  it('has nowhere to go for an unknown track', () => {
    expect(getTrackMoveTargets(tracks, undefined)).toEqual({ up: false, down: false });
    expect(getTrackMoveTargets(tracks, 'V9')).toEqual({ up: false, down: false });
  });
});
