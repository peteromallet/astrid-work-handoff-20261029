import { describe, expect, it, vi } from 'vitest';
import type { TimelineViewSnapshot } from '@/sdk/video/timeline/viewState.ts';
import { normalizeTranscriptSource, TRANSCRIPT_SCHEMA_REF } from '../data/typed/adaptTranscript.ts';
import { editTranscriptText } from '../data/typed/editTranscript.ts';
import { createTranscriptPanelAdapter } from './transcript-panel-adapter.ts';
import type { TimelineData } from './timeline-data.ts';

function setup() {
  const items = normalizeTranscriptSource({ assetId: 'a', sourceId: 'doc', segments: [{
    id: 's', start: 1, end: 5, text: 'Hello, world!', speaker: 'Nova', words: [
      { id: 'hello', start: 1, end: 2, text: 'Hello' }, { id: 'world', start: 3, end: 4, text: 'world' },
    ],
  }] });
  const originalClips = [{ id: 'first', asset: 'a', at: 0, track: 'v', from: 1, to: 5, speed: 1 },
    { id: 'repeat', asset: 'a', at: 1, track: 'v', from: 1, to: 5, speed: 2 }];
  let data: TimelineData | null = { resolvedConfig: { clips: originalClips }, sourceItemsBySchemaRef: { [TRANSCRIPT_SCHEMA_REF]: items } } as unknown as TimelineData;
  let view = { playhead: { time: 1.25, playing: true }, selection: { selectedClipIds: new Set(['repeat']) } } as unknown as TimelineViewSnapshot;
  const listeners = new Set<() => void>();
  const subscribe = vi.fn((listener: () => void) => { listeners.add(listener); return { dispose: () => { listeners.delete(listener); } }; });
  const seek = vi.fn();
  const video = { view: { getSnapshot: () => view, subscribe }, seek };
  const adapter = createTranscriptPanelAdapter({ getData: () => data, subscribe, video });
  return { adapter, seek, listeners, items, originalClips,
    getData: () => data!,
    publish: (next: TimelineData | null) => { data = next; listeners.forEach((listener) => listener()); },
    setView: (next: TimelineViewSnapshot) => { view = next; },
  };
}

describe('transcript panel adapter', () => {
  it('provides a stable canonical source snapshot and the shared occurrence projection', () => {
    const { adapter } = setup();
    const first = adapter.getSnapshot();
    expect(adapter.getSnapshot()).toBe(first);
    expect(first.sources[0]).toMatchObject({ sourceId: 'doc', start: 1, end: 5, text: 'Hello, world!', speaker: 'Nova' });
    expect(first.sources[0].words).toHaveLength(2);
    expect(first.occurrences.map((item) => [item.clipId, item.timelineStart, item.timelineEnd])).toEqual([['first', 0, 4], ['repeat', 1, 3]]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.occurrences)).toBe(true);
    expect(first.occurrences[0]).not.toHaveProperty('sourceItem');
  });

  it('observes the existing host document subscription and disposes independently', () => {
    const { adapter, publish, listeners, getData } = setup();
    const listener = vi.fn();
    const otherListener = vi.fn();
    const handle = adapter.subscribe(listener);
    const other = adapter.subscribe(otherListener);
    publish({ ...getData() });
    expect(listener).toHaveBeenCalledOnce();
    handle.dispose();
    handle.dispose();
    expect(listeners.size).toBe(1);
    publish({ ...getData() });
    expect(listener).toHaveBeenCalledOnce();
    expect(otherListener).toHaveBeenCalledTimes(2);
    other.dispose();
    expect(listeners.size).toBe(0);
  });

  it('refreshes all repeated occurrences atomically after correction and clears stale word alignment after segment replacement', () => {
    const { adapter, items, publish, getData, originalClips, seek } = setup();
    const old = adapter.getSnapshot();
    const wordId = old.sources[0].words![0].id;
    const edit = editTranscriptText(getData().sourceItemsBySchemaRef!, { type: 'word', sourceItemId: items[0].id, wordId, text: 'Hi' });
    expect(edit.ok).toBe(true);
    if (!edit.ok) throw new Error(edit.message);
    publish({ ...getData(), sourceItemsBySchemaRef: edit.sourceItemsBySchemaRef });
    const corrected = adapter.getSnapshot();
    expect(corrected).not.toBe(old);
    expect(corrected.sources[0].text).toBe('Hi, world!');
    expect(corrected.occurrences.every((item) => item.words[0].text === 'Hi')).toBe(true);
    expect(corrected.occurrences.map((item) => [item.timelineStart, item.timelineEnd])).toEqual(old.occurrences.map((item) => [item.timelineStart, item.timelineEnd]));
    expect(getData().resolvedConfig.clips).toBe(originalClips);
    const segment = editTranscriptText(getData().sourceItemsBySchemaRef!, { type: 'segment', sourceItemId: items[0].id, text: 'Replacement segment.' });
    if (!segment.ok) throw new Error(segment.message);
    publish({ ...getData(), sourceItemsBySchemaRef: segment.sourceItemsBySchemaRef });
    expect(adapter.getSnapshot().sources[0].words).toBeUndefined();
    expect(adapter.getSnapshot().occurrences.every((item) => item.words.length === 0)).toBe(true);
    expect(adapter.seek({ occurrenceId: old.occurrences[0].id, wordId })).toEqual({ ok: false, reason: 'word_not_found' });
    expect(seek).not.toHaveBeenCalled();
    expect(adapter.seek({ occurrenceId: old.occurrences[0].id })).toEqual({ ok: true, seconds: 0, timing: 'segment' });
  });

  it('keeps equal source IDs on different assets distinct in reads, selection and playback gaps', () => {
    const { adapter, items, publish, getData, setView } = setup();
    const second = { ...items[0], sourceArtifactRef: { assetId: 'b' } };
    publish({ ...getData(), sourceItemsBySchemaRef: { [TRANSCRIPT_SCHEMA_REF]: [items[0], second] },
      resolvedConfig: { ...getData().resolvedConfig, clips: [...getData().resolvedConfig.clips,
        { ...getData().resolvedConfig.clips[0], id: 'other-media', asset: 'b' }] } });
    expect(adapter.getSnapshot().sources.map((row) => row.assetId)).toEqual(['a', 'b']);
    expect(adapter.getSnapshot().occurrences.map((item) => item.assetId)).toContain('b');
    const firstOccurrence = adapter.getSnapshot().occurrences.find((item) => item.assetId === 'a')!;
    const selection = adapter.selectSource({ assetId: 'a', sourceId: 'doc', occurrenceId: firstOccurrence.id }, { assetId: 'b', sourceId: 'doc' });
    expect(selection).toEqual({ assetId: 'b', sourceId: 'doc', occurrenceId: null });
    setView({ playhead: { time: 1 }, selection: { selectedClipIds: new Set() } } as unknown as TimelineViewSnapshot);
    expect(adapter.getPlayback(selection).focused?.assetId).toBe('b');
    setView({ playhead: { time: 99 }, selection: { selectedClipIds: new Set() } } as unknown as TimelineViewSnapshot);
    expect(adapter.getPlayback(selection)).toMatchObject({ assetId: 'b', sourceId: 'doc', focused: null });
  });
  it('reads latest public view playback and selection and seeks through the provided public adapter', () => {
    const { adapter, seek, setView } = setup();
    const selection = { assetId: 'a', sourceId: 'doc', occurrenceId: null };
    expect(adapter.getPlayback(selection).focused?.clipId).toBe('repeat');
    expect(adapter.getPlayback(selection).playing).toHaveLength(2);
    const repeat = adapter.getSnapshot().occurrences[1];
    expect(adapter.seek({ occurrenceId: repeat.id, wordId: repeat.words[1].id })).toEqual({ ok: true, seconds: 2, timing: 'word' });
    expect(seek).toHaveBeenCalledExactlyOnceWith(2);
    setView({ playhead: { time: 5 }, selection: { selectedClipIds: new Set() } } as unknown as TimelineViewSnapshot);
    expect(adapter.getPlayback(selection)).toMatchObject({ focused: null, sourceId: 'doc', playing: [] });
    expect(adapter.selectSource({ assetId: 'a', sourceId: 'doc', occurrenceId: repeat.id }, { assetId: 'a', sourceId: 'another' })).toEqual({ assetId: 'a', sourceId: 'another', occurrenceId: null });
  });

  it('removes stale source/occurrence data on timeline unload and isolates two adapter instances', () => {
    const first = setup();
    const second = setup();
    const before = second.adapter.getSnapshot();
    first.publish(null);
    expect(first.adapter.getSnapshot()).toEqual({ sources: [], occurrences: [] });
    expect(first.adapter.getPlayback({ assetId: 'a', sourceId: 'doc', occurrenceId: null })).toMatchObject({ sourceId: 'doc', focused: null });
    expect(second.adapter.getSnapshot()).toBe(before);
    expect(second.adapter.getSnapshot().occurrences).toHaveLength(2);
  });
});
