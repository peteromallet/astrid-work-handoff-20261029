/** Transcript-specific video panel contracts. Canonical source times are read-only. */
import type { DisposeHandle } from '../dispose';

export interface TranscriptSourceWordView {
  readonly id: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}
export interface TranscriptSourceRow {
  readonly sourceItemId: string;
  readonly sourceId: string;
  readonly assetId: string;
  readonly documentId?: string;
  readonly documentVersion?: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly speaker?: string | null;
  readonly words?: readonly TranscriptSourceWordView[];
}
export interface TranscriptWordProjection extends TranscriptSourceWordView {
  /** `unusable` seeks honestly to the segment; `outside` cannot seek in this occurrence. */
  readonly timing: 'word' | 'outside' | 'unusable';
  readonly timelineStart: number | null;
  readonly timelineEnd: number | null;
}
export interface TranscriptOccurrence {
  readonly id: string;
  readonly sourceItemId: string;
  readonly sourceId: string;
  readonly assetId: string;
  readonly clipId: string;
  readonly timelineStart: number;
  readonly timelineEnd: number;
  readonly words: readonly TranscriptWordProjection[];
}
export interface TranscriptSourceIdentity {
  readonly sourceId: string;
  readonly assetId: string;
}
export interface TranscriptSelection {
  readonly assetId: string | null;
  readonly sourceId: string | null;
  readonly occurrenceId: string | null;
}
export interface TranscriptPlaybackState {
  readonly playing: readonly TranscriptOccurrence[];
  readonly focused: TranscriptOccurrence | null;
  /** Retains selected media/source pair in a playback gap. */
  readonly assetId: string | null;
  readonly sourceId: string | null;
  readonly playingWordIds: readonly string[];
}
export type TranscriptSeekResult =
  | {
      readonly ok: true;
      readonly seconds: number;
      readonly timing: 'word' | 'segment';
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'unavailable'
        | 'occurrence_not_found'
        | 'word_not_found'
        | 'outside';
    };
export interface TranscriptPanelSnapshot {
  readonly sources: readonly TranscriptSourceRow[];
  readonly occurrences: readonly TranscriptOccurrence[];
}
export interface TranscriptMediaChoice {
  readonly assetId: string;
  readonly label: string;
  readonly kind: 'audio' | 'video';
}
export type TranscriptPanelTextEdit =
  | {
      readonly type: 'word';
      readonly sourceItemId: string;
      readonly assetId?: string;
      readonly documentId?: string;
      readonly baseVersion?: number;
      readonly wordId: string;
      readonly text: string;
    }
  | {
      readonly type: 'segment';
      readonly sourceItemId: string;
      readonly assetId?: string;
      readonly documentId?: string;
      readonly baseVersion?: number;
      readonly text: string;
    };
export type TranscriptPanelTextEditResult =
  | { readonly ok: true; readonly changed: boolean }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly fallback?: {
        readonly type: 'segment';
        readonly sourceItemId: string;
        readonly assetId?: string;
        readonly documentId?: string;
        readonly baseVersion?: number;
        readonly text: string;
      };
    };
export interface TranscriptPanelImportReceipt {
  readonly assetId: string;
  readonly sourceId: string;
  readonly importedSegments: number;
  readonly replacedSegments: number;
  readonly replacedExistingSource: boolean;
  readonly documentId?: string;
  readonly version?: number;
  readonly associationSaved?: boolean;
  readonly message?: string;
}
/** Optional specialized adapter; panels keep drafts, manual source choice and scroll locally. */
export interface TranscriptProjectSourceChoice {
  readonly documentId: string;
  readonly sourceId: string;
  readonly version: number;
}
export interface TranscriptProjectSourceState
  extends TranscriptProjectSourceChoice {
  readonly assetId: string;
  readonly status: 'clean' | 'saving' | 'conflict' | 'error';
  readonly message?: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly hasDraft: boolean;
  readonly draftPreview?: {
    readonly baseVersion: number;
    readonly text: string;
  };
}
export interface TranscriptProjectState {
  readonly inFlight?: boolean;
  readonly supported: boolean;
  readonly reason?: string;
  readonly sources: readonly TranscriptProjectSourceState[];
}
export interface TranscriptPanelAdapter {
  getTimelineLaneVisible?(): boolean;
  setTimelineLaneVisible?(visible: boolean): void;
  /** Record a text draft at the displayed document version without saving it. */
  stageTextDraft?(edit: TranscriptPanelTextEdit): TranscriptPanelTextEditResult;
  /** Source corrections apply wherever the project transcript is used. */
  getProjectState?(): TranscriptProjectState;
  listProjectSources?(
    assetId: string,
  ): Promise<readonly TranscriptProjectSourceChoice[]>;
  selectProjectSource?(input: {
    readonly assetId: string;
    readonly documentId: string;
  }): Promise<TranscriptPanelImportReceipt>;
  promoteSource?(input: {
    readonly assetId: string;
    readonly sourceId: string;
  }): Promise<TranscriptPanelImportReceipt>;
  undoSource?(documentId: string): Promise<TranscriptPanelTextEditResult>;
  redoSource?(documentId: string): Promise<TranscriptPanelTextEditResult>;
  resolveSourceConflict?(
    documentId: string,
    choice: 'discard' | 'reapply',
  ): Promise<TranscriptPanelTextEditResult>;
  refreshSources?(): Promise<void>;

  /** Registered audio/video assets used by clips in the current timeline. */
  getMediaChoices(): readonly TranscriptMediaChoice[];
  /** Host-owned mutations; absent on read-only panel hosts. */
  editText?(
    edit: TranscriptPanelTextEdit,
  ): TranscriptPanelTextEditResult | Promise<TranscriptPanelTextEditResult>;
  /** Throws an actionable host import error with a stable code. */
  importTranscript?(input: {
    readonly document: unknown;
    readonly associationAssetId?: string;
  }): TranscriptPanelImportReceipt | Promise<TranscriptPanelImportReceipt>;
  /** Stable between host document changes, including text-only changes. */
  getSnapshot(): TranscriptPanelSnapshot;
  /** Existing host document observation; dispose when hidden/unmounted. Observe video.view for playhead updates. */
  subscribe(listener: () => void): DisposeHandle;
  /** Resolves existing video.view playback/selection against the latest shared projection. */
  getPlayback(selection: TranscriptSelection): TranscriptPlaybackState;
  selectSource(
    selection: TranscriptSelection,
    source: TranscriptSourceIdentity,
  ): TranscriptSelection;
  /** Explicit occurrence identity disambiguates repeated clips. */
  seek(target: {
    readonly occurrenceId: string;
    readonly wordId?: string;
  }): TranscriptSeekResult;
}
