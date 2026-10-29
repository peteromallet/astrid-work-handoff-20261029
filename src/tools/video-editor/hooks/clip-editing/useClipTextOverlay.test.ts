// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClipEditingContext } from './types.ts';
import { useClipTextOverlay } from './useClipTextOverlay.ts';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';

function contextFor(tracks: TimelineData['tracks'], rows: TimelineData['rows'], playhead: number) {
  const data = {
    tracks,
    rows,
    meta: {},
    clipOrder: Object.fromEntries(tracks.map((track) => [track.id, []])),
    resolvedConfig: { tracks, clips: [] },
  } as unknown as TimelineData;
  const applyRowsEdit = vi.fn();
  const ctx = {
    dataRef: { current: data },
    currentTimeRef: { current: playhead },
    applyRowsEdit,
    selectClip: vi.fn(),
    setSelectedTrackId: vi.fn(),
  } as unknown as ClipEditingContext;
  return { ctx, applyRowsEdit, data: ctx.dataRef };
}

const video = (id: string) => ({ id, kind: 'visual' as const, label: id });
const audio = (id: string) => ({ id, kind: 'audio' as const, label: id });

describe('handleAddText (the touch editor\'s Text button)', () => {
  it('puts the words on the front video track when it is free at the playhead', () => {
    const { ctx, applyRowsEdit } = contextFor(
      [video('V2'), video('V1'), audio('A1')],
      [{ id: 'V2', actions: [] }, { id: 'V1', actions: [{ id: 'clip-0', start: 0, end: 10, effectId: 'e' }] }, { id: 'A1', actions: [] }],
      2,
    );
    renderHook(() => useClipTextOverlay(ctx)).result.current.handleAddText();

    const rows = applyRowsEdit.mock.calls[0][0] as TimelineData['rows'];
    expect(rows.find((row) => row.id === 'V2')?.actions).toEqual([expect.objectContaining({ start: 2, end: 7 })]);
    expect(ctx.setSelectedTrackId).toHaveBeenCalledWith('V2');
  });

  it('puts them on a new track in front when the front track is busy there, never behind the picture', () => {
    const { ctx, applyRowsEdit, data } = contextFor(
      [video('V1'), audio('A1'), video('V2')],
      [{ id: 'V1', actions: [{ id: 'clip-0', start: 0, end: 10, effectId: 'e' }] }, { id: 'A1', actions: [] }, { id: 'V2', actions: [] }],
      3,
    );
    renderHook(() => useClipTextOverlay(ctx)).result.current.handleAddText();

    expect(data.current?.tracks[0]).toEqual(expect.objectContaining({ id: 'V3', kind: 'visual' }));
    const rows = applyRowsEdit.mock.calls[0][0] as TimelineData['rows'];
    expect(rows[0]).toEqual(expect.objectContaining({ id: 'V3', actions: [expect.objectContaining({ start: 3, end: 8 })] }));
    expect(rows.find((row) => row.id === 'V1')?.actions).toHaveLength(1);
  });
});
