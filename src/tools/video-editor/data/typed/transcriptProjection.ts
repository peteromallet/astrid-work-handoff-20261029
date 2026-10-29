/** Shared transcript read projection. Source records remain the only document owner. */
import type { PanelVideoAdapter } from '@/sdk/ui.ts';
import { getConfigTimelineClipSourceDuration } from '@/tools/video-editor/lib/timeline-domain.ts';
import { sourceToTimelineTime } from '@/sdk/video/timeline/sourceTime.ts';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import { TRANSCRIPT_SCHEMA_REF } from './adaptTranscript.ts';
import type { SourceFrozenDataItem } from './envelope.ts';
import type { TranscriptOccurrence, TranscriptPlaybackState, TranscriptSelection, TranscriptSourceIdentity, TranscriptSeekResult, TranscriptWordProjection } from '@/sdk/video/transcript.ts';
export type { TranscriptOccurrence, TranscriptSelection, TranscriptSeekResult, TranscriptWordProjection } from '@/sdk/video/transcript.ts';

type Clip = ResolvedTimelineConfig['clips'][number];
const compareStrings = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const compareOccurrences = (a: TranscriptOccurrence, b: TranscriptOccurrence): number =>
  a.timelineStart - b.timelineStart || compareStrings(a.id, b.id);
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
const usableRange = (start: number, end: number): boolean =>
  Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start;

/**
 * Intersect with the clip's authored source window before mapping. No guessed
 * durations: an invalid/empty clip or segment has no playable occurrence.
 * Segment/source/word identities and source extents are never rewritten.
 */
export function projectTranscriptOccurrence(sourceItem: SourceFrozenDataItem, clip: Clip): TranscriptOccurrence | null {
  if (sourceItem.schemaRef !== TRANSCRIPT_SCHEMA_REF || sourceItem.domain !== 'source_seconds'
    || sourceItem.sourceArtifactRef.assetId !== clip.asset) return null;
  const from = clip.from ?? 0;
  const sourceEnd = from + getConfigTimelineClipSourceDuration(clip);
  const start = sourceItem.extent.start;
  const end = sourceItem.extent.end ?? start;
  if (!Number.isFinite(clip.at) || !usableRange(from, sourceEnd) || !usableRange(start, end)) return null;
  const visibleStart = Math.max(start, from);
  const visibleEnd = Math.min(end, sourceEnd);
  if (visibleEnd <= visibleStart) return null;
  const toTimeline = (time: number): number => sourceToTimelineTime(clip, time);
  const payload = record(sourceItem.payload);
  const words = Array.isArray(payload.words) ? payload.words : [];
  return Object.freeze({
    id: `${sourceItem.id}@${clip.id}`,
    sourceItemId: sourceItem.id,
    sourceId: typeof payload.sourceId === 'string' ? payload.sourceId : `transcript:${clip.asset}`,
    assetId: sourceItem.sourceArtifactRef.assetId,
    clipId: clip.id,
    timelineStart: toTimeline(visibleStart),
    timelineEnd: toTimeline(visibleEnd),
    words: Object.freeze(words.flatMap((value): TranscriptWordProjection[] => {
      const word = record(value);
      // Missing identity/text cannot support word selection; segment remains usable.
      if (typeof word.id !== 'string' || typeof word.text !== 'string') return [];
      const wordStart = word.start as number;
      const wordEnd = word.end as number;
      const valid = usableRange(wordStart, wordEnd);
      const intersectionStart = Math.max(wordStart, visibleStart);
      const intersectionEnd = Math.min(wordEnd, visibleEnd);
      // A supplied word outside its own segment is not trusted alignment.
      const inSegment = valid && wordStart < end && wordEnd > start;
      const timing = !inSegment ? 'unusable' : intersectionEnd <= intersectionStart ? 'outside' : 'word';
      return [Object.freeze({
        id: word.id, text: word.text, start: wordStart, end: wordEnd, timing,
        timelineStart: timing === 'word' ? toTimeline(intersectionStart) : null,
        timelineEnd: timing === 'word' ? toTimeline(intersectionEnd) : null,
      })];
    })),
  });
}

/** Same mapping entry point for the panel and optional lane, independent of visibility/kind registration. */
export function projectTranscriptOccurrences(input: {
  readonly sourceItems: readonly SourceFrozenDataItem[];
  readonly clips: ResolvedTimelineConfig['clips'];
}): readonly TranscriptOccurrence[] {
  const uniqueSources = new Map<string, SourceFrozenDataItem>();
  for (const item of input.sourceItems) {
    const key = JSON.stringify([item.sourceArtifactRef.assetId, item.id]);
    if (!uniqueSources.has(key)) uniqueSources.set(key, item);
  }
  return Object.freeze(input.clips.flatMap((clip) => [...uniqueSources.values()].flatMap((item) => {
    const occurrence = projectTranscriptOccurrence(item, clip);
    return occurrence ? [occurrence] : [];
  })).sort(compareOccurrences));
}

/** A source switch clears an occurrence belonging to a different source. */
export function selectTranscriptSource(
  occurrences: readonly TranscriptOccurrence[], selection: TranscriptSelection, source: TranscriptSourceIdentity,
): TranscriptSelection {
  return {
    sourceId: source.sourceId,
    assetId: source.assetId,
    occurrenceId: occurrences.some((item) => item.id === selection.occurrenceId && item.sourceId === source.sourceId && item.assetId === source.assetId)
      ? selection.occurrenceId : null,
  };
}

/**
 * All simultaneous playing rows are retained. Focus: selected occurrence/clip,
 * selected source, then stable time/ID order. Gaps retain the user's source.
 */
export function getTranscriptPlaybackState(input: {
  readonly occurrences: readonly TranscriptOccurrence[];
  readonly time: number;
  readonly selection: TranscriptSelection;
  readonly selectedClipIds?: ReadonlySet<string>;
}): TranscriptPlaybackState {
  const playing = input.occurrences.filter((item) => input.time >= item.timelineStart && input.time < item.timelineEnd)
    .sort(compareOccurrences);
  const focused = playing.find((item) => item.id === input.selection.occurrenceId)
    ?? playing.find((item) => input.selectedClipIds?.has(item.clipId))
    ?? playing.find((item) => item.sourceId === input.selection.sourceId && item.assetId === input.selection.assetId)
    ?? playing[0] ?? null;
  return {
    playing: Object.freeze(playing), focused,
    sourceId: focused?.sourceId ?? input.selection.sourceId,
    assetId: focused?.assetId ?? input.selection.assetId,
    playingWordIds: Object.freeze(focused?.words.filter((word) => word.timing === 'word'
      && input.time >= word.timelineStart! && input.time < word.timelineEnd!).map((word) => word.id) ?? []),
  };
}

/** Resolve against the latest projection; never seek using stale per-occurrence overrides. */
export function seekTranscriptTarget(
  video: Pick<PanelVideoAdapter, 'seek'> | null | undefined,
  occurrences: readonly TranscriptOccurrence[],
  target: { readonly occurrenceId: string; readonly wordId?: string },
): TranscriptSeekResult {
  if (!video) return { ok: false, reason: 'unavailable' };
  const occurrence = occurrences.find((item) => item.id === target.occurrenceId);
  if (!occurrence) return { ok: false, reason: 'occurrence_not_found' };
  const word = target.wordId === undefined ? undefined : occurrence.words.find((item) => item.id === target.wordId);
  if (target.wordId !== undefined && !word) return { ok: false, reason: 'word_not_found' };
  if (word?.timing === 'outside') return { ok: false, reason: 'outside' };
  const seconds = word?.timing === 'word' ? word.timelineStart! : occurrence.timelineStart;
  video.seek(seconds);
  return { ok: true, seconds, timing: word?.timing === 'word' ? 'word' : 'segment' };
}
