import { describe, expect, it } from 'vitest';
import { normalizeTranscriptSource, TRANSCRIPT_SCHEMA_REF } from './adaptTranscript.ts';
import { editTranscriptText, type TranscriptSourceItems } from './editTranscript.ts';

const makeSources = (text = 'Hello,  world!\n', wordText = 'world'): TranscriptSourceItems => ({
  [TRANSCRIPT_SCHEMA_REF]: normalizeTranscriptSource({
    assetId: 'media-a', sourceId: 'transcript-a',
    segments: [{ id: 's1', start: 2, end: 5, text, speaker: 'Nova', words: [
      { id: 'w1', start: 2, end: 3, text: 'Hello' },
      { id: 'w2', start: 3, end: 4, text: wordText },
    ] }, { id: 's2', start: 5, end: 6, text: 'Untouched.' }],
  }),
});
const segment = (sources: TranscriptSourceItems) => sources[TRANSCRIPT_SCHEMA_REF][0];
const wordId = (sources: TranscriptSourceItems) => (segment(sources).payload as { words: { id: string }[] }).words[1].id;

describe('editTranscriptText', () => {
  it('replaces one literal substring and preserves spacing, punctuation, IDs, times, speaker and all other items', () => {
    const sources = makeSources();
    const before = JSON.stringify(sources);
    const original = segment(sources);
    const result = editTranscriptText(sources, { type: 'word', sourceItemId: original.id, wordId: wordId(sources), text: 'Earth' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.changed).toBe(true);
    const corrected = segment(result.sourceItemsBySchemaRef);
    expect(corrected).toEqual({ ...original, payload: {
      ...(original.payload as object), text: 'Hello,  Earth!\n', words: [
        (original.payload as { words: unknown[] }).words[0],
        { ...(original.payload as { words: object[] }).words[1], text: 'Earth' },
      ],
    } });
    expect(corrected.extent).toBe(original.extent);
    expect(corrected.sourceArtifactRef).toBe(original.sourceArtifactRef);
    expect(result.sourceItemsBySchemaRef[TRANSCRIPT_SCHEMA_REF][1]).toBe(sources[TRANSCRIPT_SCHEMA_REF][1]);
    expect(JSON.stringify(sources)).toBe(before);
    expect(Object.isFrozen(corrected)).toBe(true);
    expect(Object.isFrozen((corrected.payload as { words: unknown[] }).words)).toBe(true);
  });

  it.each([
    ['world world', 'world'], ['banana', 'ana'], ['No matching word.', 'world'], ['Hello world.', ''],
  ])('returns an actionable whole-segment fallback for ambiguous or absent mapping: %s', (text, wordText) => {
    const sources = makeSources(text, wordText);
    const before = JSON.stringify(sources);
    const original = segment(sources);
    const result = editTranscriptText(sources, { type: 'word', sourceItemId: original.id, wordId: wordId(sources), text: 'Earth' });
    expect(result).toMatchObject({ ok: false, code: 'segment_replacement_required', fallback: {
      type: 'segment', sourceItemId: original.id, text,
    } });
    expect(JSON.stringify(sources)).toBe(before);
    expect(segment(sources)).toBe(original);
  });

  it('atomically replaces a segment and removes word alignment while preserving source identity and extent', () => {
    const sources = makeSources('world world');
    const original = segment(sources);
    const failedWord = editTranscriptText(sources, { type: 'word', sourceItemId: original.id, wordId: wordId(sources), text: 'Earth' });
    expect(failedWord.ok).toBe(false);
    const result = editTranscriptText(sources, { type: 'segment', sourceItemId: original.id, text: 'A new, complete sentence.' });
    if (!result.ok) throw new Error(result.message);
    const { words, ...expectedPayload } = original.payload as Record<string, unknown>;
    expect(words).toBeDefined();
    expect(segment(result.sourceItemsBySchemaRef)).toEqual({ ...original, payload: { ...expectedPayload, text: 'A new, complete sentence.' } });
    expect(segment(sources).payload).toHaveProperty('words');
  });

  it('clears alignment even when segment text is identical, and otherwise reports a no-op', () => {
    const sources = makeSources();
    const result = editTranscriptText(sources, { type: 'segment', sourceItemId: segment(sources).id, text: 'Hello,  world!\n' });
    if (!result.ok) throw new Error(result.message);
    expect(result.changed).toBe(true);
    expect(segment(result.sourceItemsBySchemaRef).payload).not.toHaveProperty('words');
    expect(editTranscriptText(result.sourceItemsBySchemaRef, { type: 'segment', sourceItemId: segment(sources).id, text: 'Hello,  world!\n' }))
      .toMatchObject({ ok: true, changed: false, sourceItemsBySchemaRef: result.sourceItemsBySchemaRef });
    expect(editTranscriptText(sources, { type: 'word', sourceItemId: segment(sources).id, wordId: wordId(sources), text: 'world' }))
      .toMatchObject({ ok: true, changed: false, sourceItemsBySchemaRef: sources });
  });

  it('rejects empty or invalid input and stale selections without changing the source document', () => {
    const sources = makeSources();
    const before = JSON.stringify(sources);
    const id = segment(sources).id;
    for (const text of ['', '  \n', null, 42]) {
      expect(editTranscriptText(sources, { type: 'segment', sourceItemId: id, text: text as string }))
        .toMatchObject({ ok: false, code: 'invalid_input' });
    }
    expect(editTranscriptText(sources, { type: 'segment', sourceItemId: 'missing', text: 'Valid' }))
      .toMatchObject({ ok: false, code: 'source_not_found' });
    expect(editTranscriptText(sources, { type: 'word', sourceItemId: id, wordId: 'missing', text: 'Valid' }))
      .toMatchObject({ ok: false, code: 'word_not_found', fallback: { type: 'segment', sourceItemId: id } });
    expect(JSON.stringify(sources)).toBe(before);
  });

  it('does not choose between duplicate source or word IDs', () => {
    const sources = makeSources();
    const original = segment(sources);
    expect(editTranscriptText({ [TRANSCRIPT_SCHEMA_REF]: [original, original] }, { type: 'segment', sourceItemId: original.id, text: 'New' }))
      .toMatchObject({ ok: false, code: 'invalid_source' });
    const payload = original.payload as { words: object[] };
    const duplicateWords = { [TRANSCRIPT_SCHEMA_REF]: [{ ...original, payload: { ...payload, words: [payload.words[1], payload.words[1]] } }] };
    expect(editTranscriptText(duplicateWords, { type: 'word', sourceItemId: original.id, wordId: wordId(sources), text: 'New' }))
      .toMatchObject({ ok: false, code: 'segment_replacement_required' });
  });
});
