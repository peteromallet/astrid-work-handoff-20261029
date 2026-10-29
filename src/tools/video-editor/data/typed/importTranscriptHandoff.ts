import {
  createProjectTranscriptHost,
  type ProjectTranscriptHostInput,
} from '../../lib/project-transcript-host.ts';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import { getPlayableAssetKind } from '@/tools/video-editor/lib/timeline-asset-plans.ts';
import { type TranscriptSourceSegment } from './adaptTranscript.ts';

/** Stable error codes for the transcript panel's actionable import messages. */
export type TranscriptImportErrorCode =
  | 'invalid_json'
  | 'invalid_document'
  | 'invalid_content'
  | 'empty_transcript'
  | 'missing_asset_association'
  | 'invalid_asset_association'
  | 'asset_mismatch'
  | 'asset_not_found'
  | 'asset_not_media'
  | 'timeline_not_loaded';

export class TranscriptImportError extends Error {
  constructor(
    readonly code: TranscriptImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TranscriptImportError';
  }
}

export interface TranscriptImportInput {
  /** JSON text from Astrid's transcript export, or an already parsed value. */
  document: string | unknown;
  /** Explicit association for legacy `{segments}` files without `assetId`. */
  associationAssetId?: string;
}

export interface TranscriptImportReceipt {
  assetId: string;
  sourceId: string;
  importedSegments: number;
  replacedSegments: number;
  replacedExistingSource: boolean;
}

export type TranscriptImportCallback = (
  input: TranscriptImportInput,
) => Promise<import('@/sdk/video/transcript.ts').TranscriptPanelImportReceipt>;

export type TranscriptImportHost = ProjectTranscriptHostInput;

export interface ParsedTranscriptDocument {
  assetId?: string;
  mediaId?: string;
  sourceId?: string;
  segments: readonly TranscriptSourceSegment[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readOptionalId = (value: unknown, label: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TranscriptImportError(
      'invalid_document',
      `${label} must be a non-empty string when provided.`,
    );
  }
  return value.trim();
};

const readTime = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TranscriptImportError(
      'invalid_content',
      `${label} must be a finite, non-negative number of seconds.`,
    );
  }
  return value;
};

const readTranscriptSegment = (
  value: unknown,
  index: number,
): TranscriptSourceSegment => {
  const label = `Segment ${index + 1}`;
  if (!isRecord(value)) {
    throw new TranscriptImportError(
      'invalid_content',
      `${label} must be an object with start, end, and text fields.`,
    );
  }
  const id = readOptionalId(value.id, `${label} id`);
  const start = readTime(value.start, `${label} start`);
  const end = readTime(value.end, `${label} end`);
  if (end < start) {
    throw new TranscriptImportError(
      'invalid_content',
      `${label} end must be at or after its start.`,
    );
  }
  if (typeof value.text !== 'string') {
    throw new TranscriptImportError(
      'invalid_content',
      `${label} text must be a string.`,
    );
  }
  if (
    value.speaker !== undefined &&
    value.speaker !== null &&
    typeof value.speaker !== 'string'
  ) {
    throw new TranscriptImportError(
      'invalid_content',
      `${label} speaker must be a string or null.`,
    );
  }

  let words: TranscriptSourceSegment['words'];
  if (value.words !== undefined) {
    if (!Array.isArray(value.words)) {
      throw new TranscriptImportError(
        'invalid_content',
        `${label} words must be an array when provided.`,
      );
    }
    words = value.words.map((wordValue: unknown, wordIndex) => {
      const wordLabel = `${label}, word ${wordIndex + 1}`;
      if (!isRecord(wordValue)) {
        throw new TranscriptImportError(
          'invalid_content',
          `${wordLabel} must be an object with timing and text fields.`,
        );
      }
      const wordId = readOptionalId(wordValue.id, `${wordLabel} id`);
      const wordStart = readTime(wordValue.start, `${wordLabel} start`);
      const wordEnd = readTime(wordValue.end, `${wordLabel} end`);
      if (wordEnd < wordStart) {
        throw new TranscriptImportError(
          'invalid_content',
          `${wordLabel} end must be at or after its start.`,
        );
      }
      if (wordValue.text !== undefined && typeof wordValue.text !== 'string') {
        throw new TranscriptImportError(
          'invalid_content',
          `${wordLabel} text must be a string.`,
        );
      }
      if (wordValue.word !== undefined && typeof wordValue.word !== 'string') {
        throw new TranscriptImportError(
          'invalid_content',
          `${wordLabel} legacy word field must be a string.`,
        );
      }
      if (wordValue.text === undefined && wordValue.word === undefined) {
        throw new TranscriptImportError(
          'invalid_content',
          `${wordLabel} needs a text field.`,
        );
      }
      if (
        wordValue.text !== undefined &&
        wordValue.word !== undefined &&
        wordValue.text !== wordValue.word
      ) {
        throw new TranscriptImportError(
          'invalid_content',
          `${wordLabel} has conflicting text and word fields.`,
        );
      }
      return {
        ...(wordId !== undefined ? { id: wordId } : {}),
        start: wordStart,
        end: wordEnd,
        ...(wordValue.text !== undefined ? { text: wordValue.text } : {}),
        ...(wordValue.word !== undefined ? { word: wordValue.word } : {}),
      };
    });
  }

  return {
    ...(id !== undefined ? { id } : {}),
    start,
    end,
    text: value.text,
    ...(value.speaker !== undefined
      ? { speaker: value.speaker as string | null }
      : {}),
    ...(words !== undefined ? { words } : {}),
  };
};

export const parseTranscriptDocument = (
  input: string | unknown,
): ParsedTranscriptDocument => {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Unknown JSON parse error';
      throw new TranscriptImportError(
        'invalid_json',
        `Transcript file is not valid JSON (${detail}). Choose an Astrid transcript.json export.`,
      );
    }
  }
  if (!isRecord(value)) {
    throw new TranscriptImportError(
      'invalid_document',
      'Transcript JSON must be an object containing a segments array.',
    );
  }
  const assetId = readOptionalId(value.assetId, 'Transcript assetId');
  const sourceId = readOptionalId(
    value.sourceId ?? value.source_id,
    'Transcript sourceId',
  );
  const mediaId = readOptionalId(
    value.mediaId ?? value.media_id,
    'Transcript media_id',
  );
  if (mediaId && !/^sha256:[0-9a-f]{64}$/.test(mediaId))
    throw new TranscriptImportError(
      'invalid_document',
      'Transcript media_id must be the Runtime source media digest.',
    );
  if (!Array.isArray(value.segments)) {
    throw new TranscriptImportError(
      'invalid_document',
      'Transcript JSON must contain a segments array.',
    );
  }
  if (value.segments.length === 0) {
    throw new TranscriptImportError(
      'empty_transcript',
      'This transcript contains no segments, so nothing was imported. Check the source export before replacing a transcript.',
    );
  }
  return {
    ...(assetId !== undefined ? { assetId } : {}),
    ...(sourceId !== undefined ? { sourceId } : {}),
    ...(mediaId !== undefined ? { mediaId } : {}),
    segments: value.segments.map(readTranscriptSegment),
  };
};

export const resolveAssociatedAssetId = (
  documentAssetId: string | undefined,
  associationAssetId: string | undefined,
): string => {
  let association: string | undefined;
  if (associationAssetId !== undefined) {
    if (
      typeof associationAssetId !== 'string' ||
      associationAssetId.trim().length === 0
    ) {
      throw new TranscriptImportError(
        'invalid_asset_association',
        'The selected media association is empty. Choose a source audio or video asset in the editor and try again.',
      );
    }
    association = associationAssetId.trim();
  }
  if (documentAssetId && association && documentAssetId !== association) {
    throw new TranscriptImportError(
      'asset_mismatch',
      `This transcript names media asset “${documentAssetId}”, but the selected editor asset is “${association}”. Select the matching media or import a transcript for the selected asset.`,
    );
  }
  const assetId = documentAssetId ?? association;
  if (!assetId) {
    throw new TranscriptImportError(
      'missing_asset_association',
      'This transcript has no assetId. Select the source media in the editor and associate the transcript with that asset before importing.',
    );
  }
  return assetId;
};

export const assertRegisteredTranscriptMedia = (
  data: TimelineData,
  assetId: string,
): void => {
  const entry = data.registry.assets?.[assetId];
  if (!entry) {
    throw new TranscriptImportError(
      'asset_not_found',
      `Media asset “${assetId}” is not registered in this timeline. Select an asset from this editor or add it before importing.`,
    );
  }
  const kind = getPlayableAssetKind(entry);
  const declaredKind = entry.type?.toLowerCase();
  if (
    kind !== 'audio' &&
    kind !== 'video' &&
    declaredKind !== 'audio' &&
    declaredKind !== 'video'
  ) {
    throw new TranscriptImportError(
      'asset_not_media',
      `Asset “${assetId}” is not registered as audio or video media. Choose the source audio or video asset for this transcript.`,
    );
  }
};

/** Project imports always await the document receipt before timeline association. */
export function createTranscriptImportCallback(
  input: TranscriptImportHost,
): TranscriptImportCallback {
  const host = createProjectTranscriptHost(input);
  return async (document) => host.importTranscript(document);
}
