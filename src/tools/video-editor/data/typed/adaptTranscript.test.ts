import { describe, expect, it } from 'vitest';
import {
  adaptTranscript,
  ADAPT_TRANSCRIPT_ADAPTER_ID,
  normalizeTranscriptSource,
  TRANSCRIPT_SCHEMA_REF,
} from './adaptTranscript.ts';

const SEGMENTS = [
  { start: 1.5, end: 3.25, text: 'hello world' },
  { start: 4, end: 5, text: 'second' },
];

// Type-level gate: the data plane is synchronous — no Promise may appear.
type ReturnsPromise<T> = Promise<unknown> extends T ? true : false;

describe('normalizeTranscriptSource', () => {
  it('uses namespaced logical source and segment IDs, separate from content', () => {
    const source = normalizeTranscriptSource({ assetId: 'asset-a', sourceId: 'capture-7', segments: SEGMENTS });
    expect(source.map((item) => item.id)).toEqual([
      'transcript-source:asset-a:source:capture-7:segment:legacy-index-0',
      'transcript-source:asset-a:source:capture-7:segment:legacy-index-1',
    ]);
    expect(source[0]).toMatchObject({
      id: 'transcript-source:asset-a:source:capture-7:segment:legacy-index-0',
      shape: 'interval',
      domain: 'source_seconds',
      extent: { start: 1.5, end: 3.25 },
      schemaRef: TRANSCRIPT_SCHEMA_REF,
      payload: {
        sourceId: 'capture-7',
        segmentId: 'transcript-source:asset-a:source:capture-7:segment:legacy-index-0',
        text: 'hello world',
      },
      sourceArtifactRef: { assetId: 'asset-a' },
      provenance: { adapterId: ADAPT_TRANSCRIPT_ADAPTER_ID, adapterVersion: '2' },
    });
    expect(source[0].id).not.toMatch(/[0-9a-f]{12,}/);
  });

  it('preserves speaker, explicit IDs, timed words and their text', () => {
    const [item] = normalizeTranscriptSource({
      assetId: 'asset-a',
      sourceId: 'capture-7',
      segments: [{
        id: 'seg-1', start: 2, end: 4, text: 'Well, hello!', speaker: 'Nova',
        words: [
          { id: 'word-1', start: 2, end: 2.5, text: 'Well,' },
          { id: 'word-2', start: 2.6, end: 3, text: 'hello!' },
        ],
      }],
    });
    expect(item.id).toBe('transcript-source:asset-a:source:capture-7:segment:seg-1');
    expect(item.payload).toEqual({
      sourceId: 'capture-7',
      segmentId: 'transcript-source:asset-a:source:capture-7:segment:seg-1',
      text: 'Well, hello!',
      speaker: 'Nova',
      words: [
        { id: 'transcript-source:asset-a:source:capture-7:segment:seg-1:word:word-1', start: 2, end: 2.5, text: 'Well,' },
        { id: 'transcript-source:asset-a:source:capture-7:segment:seg-1:word:word-2', start: 2.6, end: 3, text: 'hello!' },
      ],
    });
  });

  it('preserves explicit null speaker and omits an absent speaker', () => {
    const items = normalizeTranscriptSource({
      assetId: 'a',
      segments: [
        { start: 0, end: 1, text: 'unknown', speaker: null },
        { start: 1, end: 2, text: 'not supplied' },
      ],
    });
    expect(items[0].payload).toHaveProperty('speaker', null);
    expect(items[1].payload).not.toHaveProperty('speaker');
  });

  it('uses the legacy word alias only when canonical text is absent', () => {
    const [item] = normalizeTranscriptSource({
      assetId: 'a',
      segments: [{ start: 0, end: 1, text: 'hi', words: [{ start: 0, end: 0.5, word: 'hi' }] }],
    });
    expect(item.payload).toMatchObject({ words: [{ start: 0, end: 0.5, text: 'hi' }] });
    expect(() => normalizeTranscriptSource({
      assetId: 'a',
      segments: [{ start: 0, end: 1, text: 'hi', words: [{ start: 0, end: 0.5, text: 'hello', word: 'hi' }] }],
    })).toThrow(/conflicting text and legacy word fields/);
  });

  it('keeps explicit logical IDs stable when text or timing changes', () => {
    const before = normalizeTranscriptSource({
      assetId: 'a', sourceId: 'source-a',
      segments: [{ id: 'stable-1', start: 1, end: 2, text: 'before' }],
    });
    const after = normalizeTranscriptSource({
      assetId: 'a', sourceId: 'source-a',
      segments: [{ id: 'stable-1', start: 1.1, end: 2.2, text: 'after' }],
    });
    expect(after[0].id).toBe(before[0].id);
    expect(after[0].payload).toMatchObject({ text: 'after' });
    expect(after[0].extent).toEqual({ start: 1.1, end: 2.2 });
  });

  it('keeps same-media transcript sources distinct by logical sourceId', () => {
    const first = normalizeTranscriptSource({
      assetId: 'a', sourceId: 'take-a', segments: [{ id: 's1', start: 0, end: 1, text: 'hello' }],
    });
    const second = normalizeTranscriptSource({
      assetId: 'a', sourceId: 'take-b', segments: [{ id: 's1', start: 0, end: 1, text: 'hello' }],
    });
    expect(first[0].id).not.toBe(second[0].id);
    expect(first[0].sourceArtifactRef.assetId).toBe(second[0].sourceArtifactRef.assetId);
  });

  it('scopes equal explicit source, segment, and word IDs to their media asset', () => {
    const first = normalizeTranscriptSource({
      assetId: 'asset-a', sourceId: 'capture',
      segments: [{ id: 'seg-1', start: 0, end: 1, text: 'first', words: [
        { id: 'word-1', start: 0, end: 0.5, text: 'first' },
      ] }],
    });
    const second = normalizeTranscriptSource({
      assetId: 'asset-b', sourceId: 'capture',
      segments: [{ id: 'seg-1', start: 0, end: 1, text: 'second', words: [
        { id: 'word-1', start: 0, end: 0.5, text: 'second' },
      ] }],
    });

    expect(first[0].id).toBe('transcript-source:asset-a:source:capture:segment:seg-1');
    expect(second[0].id).toBe('transcript-source:asset-b:source:capture:segment:seg-1');
    expect(first[0].id).not.toBe(second[0].id);
    const firstWords = first[0].payload.words as readonly { id: string }[];
    const secondWords = second[0].payload.words as readonly { id: string }[];
    expect(firstWords[0].id).toBe('transcript-source:asset-a:source:capture:segment:seg-1:word:word-1');
    expect(secondWords[0].id).toBe('transcript-source:asset-b:source:capture:segment:seg-1:word:word-1');
    expect(firstWords[0].id).not.toBe(secondWords[0].id);
  });

  it('creates deterministic unique IDs for legacy records and duplicate upstream IDs', () => {
    const legacy = [
      { start: 0, end: 1, text: 'echo' },
      { start: 0, end: 1, text: 'echo' },
    ];
    const forward = normalizeTranscriptSource({ assetId: 'a', segments: legacy });
    const repeated = normalizeTranscriptSource({ assetId: 'a', segments: legacy });
    expect(forward[0].id).toBe('transcript-source:transcript%3Aa:segment:legacy-index-0');
    expect(forward.map((item) => item.id)).toEqual(repeated.map((item) => item.id));
    expect(new Set(forward.map((item) => item.id)).size).toBe(2);

    const collisions = normalizeTranscriptSource({
      assetId: 'a', sourceId: 's', segments: [
        { id: 'same', start: 0, end: 1, text: 'one' },
        { id: 'same', start: 1, end: 2, text: 'two' },
        { id: 'same~2', start: 2, end: 3, text: 'three' },
      ],
    });
    expect(collisions.map((item) => item.id)).toEqual([
      'transcript-source:a:source:s:segment:same',
      'transcript-source:a:source:s:segment:same~2',
      'transcript-source:a:source:s:segment:same~2~2',
    ]);
  });

  it('assigns stable unique word IDs for legacy and duplicate word IDs', () => {
    const [item] = normalizeTranscriptSource({
      assetId: 'a', sourceId: 's', segments: [{
        id: 'seg', start: 0, end: 3, text: 'one two three', words: [
          { start: 0, end: 1, text: 'one' },
          { id: 'w', start: 1, end: 2, text: 'two' },
          { id: 'w', start: 2, end: 3, text: 'three' },
        ],
      }],
    });
    expect(item.payload).toMatchObject({ words: [
      { id: 'transcript-source:a:source:s:segment:seg:word:legacy-index-0' },
      { id: 'transcript-source:a:source:s:segment:seg:word:w' },
      { id: 'transcript-source:a:source:s:segment:seg:word:w~2' },
    ] });
  });

  it('rejects invalid times, empty explicit source IDs and missing word text', () => {
    expect(() => normalizeTranscriptSource({ assetId: 'a', sourceId: ' ', segments: [] })).toThrow(/sourceId/);
    expect(() => normalizeTranscriptSource({
      assetId: 'a', segments: [{ start: -1, end: 1, text: 'bad' }],
    })).toThrow(/finite non-negative source times/);
    expect(() => normalizeTranscriptSource({
      assetId: 'a', segments: [{ start: 0, end: 1, text: 'bad', words: [{ start: 0, end: 1 }] }],
    })).toThrow(/requires text or the legacy word alias/);
  });

  it('deep-freezes canonical items, payload words, and word entries', () => {
    const [item] = normalizeTranscriptSource({
      assetId: 'a', segments: [{
        start: 0, end: 1, text: 'hi', words: [{ start: 0, end: 1, text: 'hi' }],
      }],
    });
    const payload = item.payload as { words: readonly object[] };
    expect(Object.isFrozen(item)).toBe(true);
    expect(Object.isFrozen(item.extent)).toBe(true);
    expect(Object.isFrozen(item.payload)).toBe(true);
    expect(Object.isFrozen(payload.words)).toBe(true);
    expect(Object.isFrozen(payload.words[0])).toBe(true);
  });
});

describe('adaptTranscript', () => {
  it('stamps stable source IDs and separate occurrence IDs for clips', () => {
    const [onOne] = adaptTranscript(SEGMENTS, { assetId: 'asset-a', sourceId: 'capture-7', clipId: 'clip-1' });
    const [onTwo] = adaptTranscript(SEGMENTS, { assetId: 'asset-a', sourceId: 'capture-7', clipId: 'clip-2' });
    expect(onOne.id).not.toBe(onTwo.id);
    expect(onOne.sourceItemId).toBe(onTwo.sourceItemId);
    expect(onOne.sourceItemId).toBe('transcript-source:asset-a:source:capture-7:segment:legacy-index-0');
    expect(onOne.entityRef).toEqual({ kind: 'clip', id: 'clip-1' });
    expect(onOne.sourceArtifactRef).toEqual({ assetId: 'asset-a' });
  });

  it('returns [] for empty and missing segment input', () => {
    expect(adaptTranscript([], { assetId: 'a' })).toEqual([]);
    expect(adaptTranscript(undefined, { assetId: 'a' })).toEqual([]);
    expect(adaptTranscript(null, { assetId: 'a' })).toEqual([]);
  });

  it('is synchronous at the type level', () => {
    const items = adaptTranscript(SEGMENTS, { assetId: 'a' });
    const returnsPromise: ReturnsPromise<typeof items> = false;
    expect(returnsPromise).toBe(false);
  });
});
