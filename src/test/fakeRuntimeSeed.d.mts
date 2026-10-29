// The fake Runtime's UI-facing seed (see fakeRuntimeSeed.mjs).

export interface BridgeTimelineFixtures {
  readonly timelineSummary: Record<string, unknown> & { timeline_id: string };
  readonly registry: { assets: Record<string, Record<string, unknown> & { file: string; type: string }> };
  readonly config: Record<string, unknown> & { clips: Array<Record<string, unknown>> };
}

/** The canonical (schema-backed) shot composition the audio-reactive timelines carry beside their parent config. */
export interface BridgeShotComposition {
  readonly schema_version: number;
  readonly project: { readonly project_id: string; readonly document_id: string; readonly role: string };
  readonly primary_timeline: { readonly document_id: string; readonly role: string; readonly head: { readonly revision_id: string; readonly content_digest: string } };
  readonly shot_revisions: ReadonlyArray<Record<string, unknown> & {
    readonly assets: ReadonlyArray<{ readonly asset_id: string; readonly object_id: string; readonly digest: string }>;
    readonly audio: { readonly object_id: string; readonly digest: string };
  }>;
  readonly occurrences: ReadonlyArray<Record<string, unknown> & { readonly at_ms: number }>;
  readonly cases: Record<string, unknown>;
}

export function fixtureUlid(suffix: string): string;

export const FIXTURE_PROJECT: { readonly slug: string; readonly name: string };
export const FIXTURE_TIMELINE_ID: string;
export const AUDIO_REACTIVE_FIXTURE_TIMELINE_ID: string;
export const AUDIO_REACTIVE_OFFSET_FIXTURE_TIMELINE_ID: string;
export const AUDIO_REACTIVE_OFFSET_START_FRAME: number;
export const AUDIO_REACTIVE_OFFSET_INITIAL_COLOR: string;

export function createTimelineFixtures(options?: { assetSrcBaseUrl?: string }): BridgeTimelineFixtures;
/** The demo timeline's identity with a new timeline's content: V1 and A1, no clips, no assets. */
export function createEmptyTimelineFixtures(): BridgeTimelineFixtures;
export function createAudioReactiveColourFixtures(options?: { assetSrcBaseUrl?: string }): BridgeTimelineFixtures & { readonly shotComposition: BridgeShotComposition };
export function createOffsetAudioReactiveColourFixtures(options?: { assetSrcBaseUrl?: string }): BridgeTimelineFixtures & { readonly shotComposition: BridgeShotComposition };
export function createGalleryFixtures(): {
  readonly media: Array<{ media_id: string; mime: string; bytes: Uint8Array }>;
  readonly details: Array<Record<string, unknown>>;
  readonly pageRows: Array<Record<string, unknown>>;
};
