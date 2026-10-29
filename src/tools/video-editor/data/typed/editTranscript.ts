import { TRANSCRIPT_SCHEMA_REF } from './adaptTranscript.ts';
import { freezeSourceDataItem, type SourceFrozenDataItem } from './envelope.ts';

export type TranscriptTextEdit =
  | { type: 'word'; sourceItemId: string; wordId: string; text: string }
  | { type: 'segment'; sourceItemId: string; text: string };

export type TranscriptSourceItems = Readonly<Record<string, readonly SourceFrozenDataItem[]>>;

export type TranscriptTextEditResult =
  | { ok: true; changed: boolean; sourceItemsBySchemaRef: TranscriptSourceItems }
  | {
      ok: false;
      code: 'invalid_input' | 'source_not_found' | 'invalid_source' | 'word_not_found' | 'segment_replacement_required';
      message: string;
      /** Present when a word cannot be replaced without guessing its location. */
      fallback?: { type: 'segment'; sourceItemId: string; text: string };
    };

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Correct canonical source text without touching timing or occurrence geometry.
 * Every failure returns before creating a replacement; the input remains intact.
 */
export function editTranscriptText(
  sources: TranscriptSourceItems | undefined,
  edit: TranscriptTextEdit,
): TranscriptTextEditResult {
  if (!edit || (edit.type !== 'word' && edit.type !== 'segment')
    || typeof edit.sourceItemId !== 'string' || !edit.sourceItemId.trim()
    || typeof edit.text !== 'string' || !edit.text.trim()
    || (edit.type === 'word' && (typeof edit.wordId !== 'string' || !edit.wordId.trim()))) {
    return { ok: false, code: 'invalid_input', message: 'Enter non-empty replacement text and select a transcript segment or word.' };
  }
  const items = sources?.[TRANSCRIPT_SCHEMA_REF] ?? [];
  const matches = items.filter((item) => item.id === edit.sourceItemId);
  if (matches.length !== 1) {
    return {
      ok: false,
      code: matches.length ? 'invalid_source' : 'source_not_found',
      message: matches.length ? 'This transcript segment has duplicate source IDs. Reimport the transcript before editing.' : 'This transcript segment is no longer available. Select it again.',
    };
  }
  const item = matches[0];
  const payload = item.payload;
  if (item.schemaRef !== TRANSCRIPT_SCHEMA_REF || item.domain !== 'source_seconds'
    || item.shape !== 'interval' || !record(payload) || typeof payload.text !== 'string') {
    return { ok: false, code: 'invalid_source', message: 'This transcript segment is invalid. Reimport the transcript before editing.' };
  }

  let nextPayload: Record<string, unknown>;
  if (edit.type === 'segment') {
    // A whole-segment correction deliberately removes now-stale word alignment.
    nextPayload = { ...payload, text: edit.text };
    delete nextPayload.words;
    if (edit.text === payload.text && !Object.prototype.hasOwnProperty.call(payload, 'words')) {
      return { ok: true, changed: false, sourceItemsBySchemaRef: sources! };
    }
  } else {
    const fallback = { type: 'segment' as const, sourceItemId: item.id, text: payload.text };
    const replaceSegment = (): TranscriptTextEditResult => ({
      ok: false,
      code: 'segment_replacement_required',
      message: 'This word does not have one unique match in the segment text. Replace the whole segment instead; word timing will be cleared.',
      fallback,
    });
    if (!Array.isArray(payload.words)) return replaceSegment();
    const wordMatches = payload.words.filter((word: unknown) => record(word) && word.id === edit.wordId);
    if (wordMatches.length !== 1) {
      return wordMatches.length ? replaceSegment() : {
        ok: false, code: 'word_not_found', message: 'This word is no longer available. Select it again, or replace the whole segment.', fallback,
      };
    }
    const word = wordMatches[0] as Record<string, unknown>;
    if (typeof word.text !== 'string' || !word.text.length) return replaceSegment();
    const start = payload.text.indexOf(word.text);
    // Search at the next character so even overlapping matches are ambiguous.
    if (start < 0 || payload.text.indexOf(word.text, start + 1) !== -1) return replaceSegment();
    if (edit.text === word.text) return { ok: true, changed: false, sourceItemsBySchemaRef: sources! };
    nextPayload = {
      ...payload,
      text: payload.text.slice(0, start) + edit.text + payload.text.slice(start + word.text.length),
      words: Object.freeze(payload.words.map((candidate: unknown) => candidate === word
        ? Object.freeze({ ...word, text: edit.text })
        : candidate)),
    };
  }

  const replacement = freezeSourceDataItem({ ...item, payload: Object.freeze(nextPayload) });
  return {
    ok: true,
    changed: true,
    sourceItemsBySchemaRef: Object.freeze({
      ...sources,
      [TRANSCRIPT_SCHEMA_REF]: Object.freeze(items.map((candidate) => candidate === item ? replacement : candidate)),
    }),
  };
}
