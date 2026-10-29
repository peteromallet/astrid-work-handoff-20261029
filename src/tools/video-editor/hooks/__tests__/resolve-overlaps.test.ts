import { describe, expect, it } from 'vitest';
import { applyMultiDragMoves } from '@/tools/video-editor/lib/multi-drag-utils';
import { findBestGroupStart, resolveOverlaps } from '@/tools/video-editor/lib/resolve-overlaps';
import type { ClipMeta, TimelineData } from '@/tools/video-editor/lib/timeline-data';
import type { TrackDefinition } from '@/tools/video-editor/types';
import type { TimelineRow } from '@/tools/video-editor/types/timeline-canvas';

const makeTrack = (id: string): TrackDefinition => ({
  id,
  kind: 'visual',
  label: id,
  scale: 1,
  fit: 'manual',
  opacity: 1,
  blendMode: 'normal',
});

const makeAction = (id: string, start: number, end: number) => ({
  id,
  start,
  end,
  effectId: `effect-${id}`,
});

describe('resolve-overlaps utilities', () => {
  it('returns overlap adjustments and timed meta patches for single-clip overlap resolution', () => {
    const rows: TimelineRow[] = [{
      id: 'V1',
      actions: [
        makeAction('sibling', 0, 2),
        makeAction('clip-1', 1, 4),
      ],
    }];
    const meta: Record<string, ClipMeta> = {
      'clip-1': { track: 'V1', clipType: 'media', from: 0, to: 3, speed: 1 },
    };

    const result = resolveOverlaps(rows, 'V1', 'clip-1', meta);

    expect(result.rows[0]?.actions.find((action) => action.id === 'clip-1')).toMatchObject({
      start: 2,
      end: 5,
    });
    expect(result.metaPatches['clip-1']).toEqual({ from: 1, to: 4 });
    expect(result.adjustments).toEqual([
      { clipId: 'clip-1', requestedStart: 1, actualStart: 2 },
    ]);
  });

  it('finds the nearest valid start for a moved clip extent', () => {
    const siblings = [
      makeAction('sibling-a', 0, 2),
      makeAction('sibling-b', 8, 10),
    ];

    expect(findBestGroupStart({ start: 1, end: 5 }, siblings)).toBe(2);
    expect(findBestGroupStart({ start: -3, end: 1 }, siblings)).toBe(2);
  });

  it('accumulates cross-track and overlap meta patches across multiple target rows', () => {
    const tracks = ['V1', 'V2', 'V3', 'V4'].map(makeTrack);
    const rows: TimelineRow[] = [
      { id: 'V1', actions: [makeAction('clip-a', 0, 2)] },
      { id: 'V2', actions: [makeAction('blocker-a', 0, 1)] },
      { id: 'V3', actions: [makeAction('clip-b', 0, 2)] },
      { id: 'V4', actions: [makeAction('blocker-b', 0, 1)] },
    ];
    const meta: Record<string, ClipMeta> = {
      'clip-a': { track: 'V1', clipType: 'media', from: 0, to: 2, speed: 1 },
      'clip-b': { track: 'V3', clipType: 'media', from: 0, to: 2, speed: 1 },
      'blocker-a': { track: 'V2', clipType: 'hold', hold: 1 },
      'blocker-b': { track: 'V4', clipType: 'hold', hold: 1 },
    };
    const data: TimelineData = {
      config: { output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' }, tracks, clips: [] },
      configVersion: 1,
      registry: { assets: {} },
      resolvedConfig: {
        output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
        tracks,
        clips: [],
        registry: {},
      },
      rows,
      meta,
      effects: {},
      assetMap: {},
      output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
      tracks,
      clipOrder: {
        V1: ['clip-a'],
        V2: ['blocker-a'],
        V3: ['clip-b'],
        V4: ['blocker-b'],
      },
      signature: 'sig-1',
      stableSignature: 'stable-1',
    };

    const result = applyMultiDragMoves(data, [
      { kind: 'clip', clipId: 'clip-a', sourceRowId: 'V1', targetRowId: 'V2', newStart: 0 },
      { kind: 'clip', clipId: 'clip-b', sourceRowId: 'V3', targetRowId: 'V4', newStart: 0 },
    ]);

    expect(result.metaUpdates).toEqual({
      'clip-a': { track: 'V2', from: 1, to: 3 },
      'clip-b': { track: 'V4', from: 1, to: 3 },
    });
    expect(result.nextRows.find((row) => row.id === 'V2')?.actions.find((action) => action.id === 'clip-a')).toMatchObject({
      start: 1,
      end: 3,
    });
    expect(result.nextRows.find((row) => row.id === 'V4')?.actions.find((action) => action.id === 'clip-b')).toMatchObject({
      start: 1,
      end: 3,
    });
  });
});
