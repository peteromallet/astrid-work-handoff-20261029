import { describe, expect, it, vi } from 'vitest';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import { normalizeTranscriptSource, TRANSCRIPT_SCHEMA_REF } from './adaptTranscript.ts';
import { assembleDataLanes } from './assembleDataLanes.ts';
import { getTranscriptPlaybackState, projectTranscriptOccurrences, seekTranscriptTarget, selectTranscriptSource } from './transcriptProjection.ts';
import type { TranscriptOccurrence } from './transcriptProjection.ts';

const clips = (values: unknown[]) => values as ResolvedTimelineConfig['clips'];
const clip = (id = 'c1', overrides = {}) => ({ id, asset: 'a', track: 'v1', at: 10, from: 2, to: 6, speed: 2, ...overrides });
const source = () => normalizeTranscriptSource({ assetId: 'a', sourceId: 'doc-a', segments: [{
  id: 's1', start: 1, end: 7, text: 'before straddle middle end after zero', speaker: 'Nova', words: [
    { id: 'before', start: 1, end: 2, text: 'before' },
    { id: 'straddle', start: 1.5, end: 3, text: 'straddle' },
    { id: 'middle', start: 3, end: 4, text: 'middle' },
    { id: 'end', start: 5, end: 7, text: 'end' },
    { id: 'after', start: 6, end: 7, text: 'after' },
    { id: 'zero', start: 4, end: 4, text: 'zero' },
  ],
}] });
const project = (values: unknown[] = [clip()]) => projectTranscriptOccurrences({ sourceItems: source(), clips: clips(values) });

describe('shared transcript source projection', () => {
  it('bounds straddling segment and words to trim/speed without rewriting canonical source times or IDs', () => {
    const items = source();
    const before = JSON.stringify(items);
    const [occurrence] = projectTranscriptOccurrences({ sourceItems: items, clips: clips([clip()]) });
    expect(occurrence).toMatchObject({ id: `${items[0].id}@c1`, sourceItemId: items[0].id, sourceId: 'doc-a', assetId: 'a', timelineStart: 10, timelineEnd: 12 });
    expect(occurrence.words.map((word) => [word.timing, word.timelineStart, word.timelineEnd])).toEqual([
      ['outside', null, null], ['word', 10, 10.5], ['word', 10.5, 11], ['word', 11.5, 12], ['outside', null, null], ['unusable', null, null],
    ]);
    expect(occurrence.words[1]).toMatchObject({ id: `${items[0].id}:word:straddle`, start: 1.5, end: 3 });
    expect(JSON.stringify(items)).toBe(before);
  });

  it('agrees with the optional lane for repeated/overlapping occurrences and omits outside rows', () => {
    const sourceItems = source();
    const repeated = clips([clip('z'), clip('a', { at: 11, speed: 1 }), clip('outside', { from: 8, to: 9 }), clip('wrong-media', { asset: 'b' })]);
    const occurrences = projectTranscriptOccurrences({ sourceItems, clips: repeated });
    const lanes = assembleDataLanes({ kinds: [], clips: repeated, segmentsByAsset: {}, sourceItemsBySchemaRef: { [TRANSCRIPT_SCHEMA_REF]: sourceItems } });
    expect(occurrences.map(({ id, timelineStart, timelineEnd }) => ({ id, timelineStart, timelineEnd }))).toEqual(
      lanes[0].items.map(({ item, timelineStart, timelineEnd }) => ({ id: item.id, timelineStart, timelineEnd })),
    );
    expect(occurrences.map((item) => item.clipId)).toEqual(['z', 'a']);
    expect(lanes[0].items[0].item.extent).toEqual({ start: 1, end: 7 });
  });

  it.each([undefined, 0, -2, Number.NaN, Number.POSITIVE_INFINITY])('uses established finite-positive speed fallback for %s', (speed) => {
    expect(project([clip('c', { speed })])[0]).toMatchObject({ timelineStart: 10, timelineEnd: 14 });
  });

  it('rejects empty/invalid clip and segment extents without inventing intervals', () => {
    expect(project([clip('empty', { to: 2 }), clip('reversed', { to: 1 }), clip('missing', { to: undefined }), clip('bad-at', { at: Number.NaN })])).toEqual([]);
    const zero = normalizeTranscriptSource({ assetId: 'a', segments: [{ start: 3, end: 3, text: 'zero' }] });
    expect(projectTranscriptOccurrences({ sourceItems: zero, clips: clips([clip()]) })).toEqual([]);
  });

  it('falls back honestly for malformed or absent word alignment, without guessed word intervals', () => {
    const [item] = source();
    const malformed = { ...item, payload: { sourceId: 'doc-a', text: 'bad', words: [
      { id: 'nan', text: 'bad', start: Number.NaN, end: 4 },
      { id: 'reverse', text: 'bad', start: 4, end: 3 },
      { id: 'off-segment', text: 'bad', start: 20, end: 21 },
    ] } };
    const [occurrence] = projectTranscriptOccurrences({ sourceItems: [malformed], clips: clips([clip()]) });
    expect(occurrence.words.every((word) => word.timing === 'unusable' && word.timelineStart === null)).toBe(true);
    const seek = vi.fn();
    expect(seekTranscriptTarget({ seek }, [occurrence], { occurrenceId: occurrence.id, wordId: 'nan' })).toEqual({ ok: true, seconds: 10, timing: 'segment' });
    const withoutWords = projectTranscriptOccurrences({ sourceItems: [{ ...item, payload: { text: 'segment only' } }], clips: clips([clip()]) });
    expect(withoutWords[0].words).toEqual([]);
  });
});

describe('transcript playback, selection and public seek', () => {
  const occurrences = project([clip('b'), clip('a'), clip('later', { at: 20 })]);
  const other = { ...occurrences[0], id: 'other@c', sourceId: 'doc-other', clipId: 'other' };
  const state = (extra = {}) => getTranscriptPlaybackState({ occurrences: [...occurrences, other].reverse(), time: 10.25, selection: { assetId: 'a', sourceId: 'doc-a', occurrenceId: null }, ...extra });

  it('retains all overlaps, uses selected occurrence then clip then source then stable time/ID order', () => {
    expect(state().playing).toHaveLength(3);
    expect(state().focused?.clipId).toBe('a');
    expect(state({ selectedClipIds: new Set(['b']) }).focused?.clipId).toBe('b');
    expect(state({ selection: { assetId: 'a', sourceId: 'doc-other', occurrenceId: occurrences[1].id }, selectedClipIds: new Set(['other']) }).focused?.id).toBe(occurrences[1].id);
    expect(state({ selection: { assetId: 'a', sourceId: 'doc-other', occurrenceId: null } }).focused?.id).toBe(other.id);
    expect(state({ selection: { assetId: 'a', sourceId: 'missing', occurrenceId: null } }).focused?.clipId).toBe('other');
  });

  it('uses half-open word/segment intervals, leaves gaps empty and retains selected source', () => {
    expect(state().playingWordIds).toEqual([`${source()[0].id}:word:straddle`]);
    expect(state({ time: 10.5 }).playingWordIds).toEqual([`${source()[0].id}:word:middle`]);
    expect(state({ time: 11.25 }).playingWordIds).toEqual([]);
    expect(state({ time: 12 })).toMatchObject({ playing: [], focused: null, sourceId: 'doc-a', playingWordIds: [] });
    expect(state({ time: Number.NaN }).focused).toBeNull();
    expect(state({ time: 20.25 }).focused?.clipId).toBe('later');
  });

  it('clears an incompatible occurrence on source switch and preserves same-source selection', () => {
    const selection = { assetId: 'a', sourceId: 'doc-a', occurrenceId: occurrences[0].id };
    expect(selectTranscriptSource(occurrences, selection, { assetId: 'a', sourceId: 'doc-other' })).toEqual({ assetId: 'a', sourceId: 'doc-other', occurrenceId: null });
    expect(selectTranscriptSource(occurrences, selection, { assetId: 'a', sourceId: 'doc-a' })).toEqual(selection);
  });

  it('seeks explicit repeated occurrences via adapter and refuses missing/outside selections', () => {
    const seek = vi.fn();
    const later = occurrences.find((item) => item.clipId === 'later') as TranscriptOccurrence;
    expect(seekTranscriptTarget({ seek }, occurrences, { occurrenceId: later.id, wordId: later.words[2].id })).toEqual({ ok: true, seconds: 20.5, timing: 'word' });
    expect(seekTranscriptTarget({ seek }, occurrences, { occurrenceId: later.id, wordId: later.words[5].id })).toEqual({ ok: true, seconds: 20, timing: 'segment' });
    expect(seekTranscriptTarget({ seek }, occurrences, { occurrenceId: later.id, wordId: later.words[0].id })).toEqual({ ok: false, reason: 'outside' });
    expect(seekTranscriptTarget({ seek }, occurrences, { occurrenceId: 'stale' })).toEqual({ ok: false, reason: 'occurrence_not_found' });
    expect(seekTranscriptTarget({ seek }, occurrences, { occurrenceId: later.id, wordId: 'stale' })).toEqual({ ok: false, reason: 'word_not_found' });
    expect(seekTranscriptTarget(null, occurrences, { occurrenceId: later.id })).toEqual({ ok: false, reason: 'unavailable' });
    expect(seek.mock.calls).toEqual([[20.5], [20]]);
  });
});
