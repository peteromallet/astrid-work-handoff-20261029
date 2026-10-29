import { describe, expect, it } from 'vitest';
import { deriveTimelineClipDisplayNames } from './clipDisplayNames';
import type { AssetRegistryEntry, TimelineClip, TrackDefinition } from '@/tools/video-editor/types/index.ts';

const tracks: TrackDefinition[] = [
  { id: 'V1', kind: 'visual', label: 'Video' },
  { id: 'A1', kind: 'audio', label: 'Audio' },
];

describe('deriveTimelineClipDisplayNames', () => {
  it('uses source names, then falls back to a kind ordinal in timeline order', () => {
    const clips: TimelineClip[] = [
      { id: 'clip-1', at: 0, track: 'V1', clipType: 'media', asset: 'asset-1', label: 'asset-1' },
      { id: 'clip-2', at: 3, track: 'V1', clipType: 'media', asset: 'asset-2', label: '6afeb951-f663-4710-9876-123456789abc' },
      { id: 'clip-3', at: 5, track: 'A1', clipType: 'audio', asset: 'asset-3' },
      { id: 'clip-4', at: 7, track: 'V1', clipType: 'media', asset: 'asset-4' },
    ];
    const registry: Record<string, AssetRegistryEntry> = {
      'asset-1': { type: 'video/mp4', original_filename: 'camera/first take.mp4' },
      'asset-2': { type: 'video/mp4', file: '/media/6afeb951-f663-4710-9876-123456789abc.mp4' },
      'asset-3': { type: 'audio/mpeg', prompt: 'A quiet room tone' },
      'asset-4': { type: 'video/mp4', title: 'Mountain pass' },
    };

    expect(deriveTimelineClipDisplayNames(clips, registry, tracks)).toEqual(new Map([
      ['clip-1', 'first take.mp4'],
      ['clip-2', 'Video 2'],
      ['clip-3', 'A quiet room tone'],
      ['clip-4', 'Mountain pass'],
    ]));
  });

  it('prefers original names over other generation metadata and refreshes generated ordinals', () => {
    const clips: TimelineClip[] = [
      { id: 'clip-1', at: 0, track: 'V1', clipType: 'media', asset: 'asset-1', label: 'Video 9' },
    ];

    expect(deriveTimelineClipDisplayNames(clips, {
      'asset-1': {
        type: 'video/mp4',
        original_name: 'Capture.mp4',
        prompt: 'An establishing shot',
      },
    }, tracks).get('clip-1')).toBe('Capture.mp4');
  });
});
