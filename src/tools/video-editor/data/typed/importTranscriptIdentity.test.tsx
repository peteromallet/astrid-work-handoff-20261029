import { describe, it, expect } from 'vitest';
import {
  computeHostFingerprint,
  createHostGeneratedObjectMeta,
} from '@/sdk/video/timeline/sourceMap.ts';
import {
  buildTimelineData,
  type TimelineData,
} from '../../lib/timeline-data.ts';
import { buildDataFromCurrentRegistry } from '../../lib/timeline-save-utils.ts';
import type { AssetRegistry, TimelineConfig } from '../../types/index.ts';
import {
  normalizeTranscriptSource,
  TRANSCRIPT_SCHEMA_REF,
} from './adaptTranscript.ts';
import type { SourceFrozenDataItem } from './envelope.ts';
import {
  mapReplacedTranscriptIdentities,
  reconcileTranscriptReferences,
} from './reconcileTranscriptReferences.ts';
// Persisted-format constants of the transcript extension's saved projects
// (the format `reconcileTranscriptReferences` keeps compatible).
const TRANSCRIPT_LANE_EXTENSION_ID = 'haus.astrid.transcript-lane';
const TRANSCRIPT_CAPTION_TRACK_ID = 'transcript-caption-foundry-track';
const transcriptCaptionClipId = (occurrenceId: string) =>
  `transcript-caption-${computeHostFingerprint(occurrenceId).split(':')[1]}`;
const reviewKey = (id: string) =>
  `transcript-source-review:${encodeURIComponent(id)}`;
const documentFor = (assetId = 'audio-a') => ({
  assetId,
  sourceId: 'capture-1',
  segments: [
    {
      id: 'segment-1',
      start: 0,
      end: 2,
      text: 'Source text',
      words: [{ id: 'word-1', start: 0, end: 1, text: 'Source' }],
    },
  ],
});
const canonicalSource = (assetId = 'audio-a') =>
  normalizeTranscriptSource(documentFor(assetId))[0];
const legacySource = (assetId = 'audio-a'): SourceFrozenDataItem => {
  const canonical = canonicalSource(assetId);
  return JSON.parse(
    JSON.stringify(canonical).replaceAll(
      `transcript-source:${assetId}:source:capture-1:segment:`,
      'transcript-source:capture-1:segment:',
    ),
  ) as SourceFrozenDataItem;
};
const review = (sourceItemId: string) => ({
  schemaVersion: 1,
  sourceSchemaRef: TRANSCRIPT_SCHEMA_REF,
  sourceItemId,
  status: 'accepted-for-source-update',
  proposedText: 'Human correction',
  proposedTimelineStart: 0.1,
  proposedTimelineEnd: 2.4,
  sourceFingerprintAtGeneration: 'original-source-fingerprint',
  currentSourceFingerprint: 'reviewed-source-fingerprint',
  generatedOutputFingerprint: 'original-output-fingerprint',
  editedOutputFingerprint: 'human-output-fingerprint',
  generatorVersion: '1.3.0',
  handoffFingerprint: 'accepted-handoff-fingerprint',
  decisionRevision: 12,
});
const registry: AssetRegistry = {
  assets: {
    'audio-a': { file: 'audio-a.wav', type: 'audio/wav', duration: 8 },
    'audio-b': { file: 'audio-b.wav', type: 'audio/wav', duration: 8 },
  },
};
function configFor(oldId: string, withReferences = true): TimelineConfig {
  return {
    output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
    tracks: [
      { id: 'A1', kind: 'audio', label: 'Audio', muted: false },
      {
        id: TRANSCRIPT_CAPTION_TRACK_ID,
        kind: 'visual',
        label: 'Captions',
        muted: false,
      },
    ],
    clips: [
      {
        id: 'media-a',
        asset: 'audio-a',
        track: 'A1',
        clipType: 'audio',
        at: 0,
        from: 0,
        to: 8,
      },
      ...(withReferences
        ? [
            {
              id: transcriptCaptionClipId(`${oldId}@media-a`),
              track: TRANSCRIPT_CAPTION_TRACK_ID,
              clipType: 'text' as const,
              at: 0.1,
              hold: 2.3,
              x: 143,
              y: 620,
              text: {
                content: 'Human correction',
                color: '#cc3377',
                fontSize: 51,
              },
              app: {
                retained: 'custom metadata',
                __generated__: createHostGeneratedObjectMeta({
                  extensionId: TRANSCRIPT_LANE_EXTENSION_ID,
                  contributionId: 'transcript-caption-foundry',
                  extensionVersion: '1.3.0',
                  sourceSchemaRef: TRANSCRIPT_SCHEMA_REF,
                  sourceItemId: oldId,
                  sourceValue: { sourceItemId: oldId },
                  outputValue: 'original text',
                }),
              },
            },
          ]
        : []),
    ],
    ...(withReferences
      ? {
          app: {
            unrelated: { keep: true },
            [TRANSCRIPT_LANE_EXTENSION_ID]: {
              preferences: { color: 'blue' },
              [reviewKey(oldId)]: review(oldId),
            },
          },
        }
      : {}),
  };
}
async function dataFor(sources = [legacySource()], withReferences = true) {
  return buildTimelineData(
    configFor(sources[0].id, withReferences),
    registry,
    (file) => file,
    1,
    { [TRANSCRIPT_SCHEMA_REF]: sources },
  );
}
/** Exercise the bounded legacy reference transition independently of document IO. */
function importer(data: TimelineData) {
  const dataRef = { current: data };
  return {
    dataRef,
    importTranscript: ({
      document,
    }: {
      document: ReturnType<typeof documentFor>;
    }) => {
      const current = dataRef.current,
        incoming = normalizeTranscriptSource(document);
      const previous =
        current.sourceItemsBySchemaRef?.[TRANSCRIPT_SCHEMA_REF] ?? [];
      const kept = previous.filter(
        (i) =>
          !(
            i.sourceArtifactRef.assetId === document.assetId &&
            (i.payload as { sourceId: string }).sourceId ===
              (document.sourceId ?? `transcript:${document.assetId}`)
          ),
      );
      const config = reconcileTranscriptReferences(
        current.config,
        previous,
        incoming,
        document.assetId,
        document.sourceId ?? `transcript:${document.assetId}`,
      );
      dataRef.current = buildDataFromCurrentRegistry(config, current, {
        sourceItemsBySchemaRef: {
          [TRANSCRIPT_SCHEMA_REF]: [...kept, ...incoming],
        },
      });
    },
  };
}

describe('transcript legacy reference reconciliation', () => {
  it('maps segment/word identities only within the exact replaced asset and source', () => {
    const old = legacySource();
    const next = canonicalSource();
    const mapping = mapReplacedTranscriptIdentities(
      [old, legacySource('audio-b')],
      [next],
      'audio-a',
      'capture-1',
    );
    expect([...mapping.segments]).toEqual([[old.id, next.id]]);
    expect([...mapping.words]).toEqual([
      [`${old.id}:word:word-1`, `${next.id}:word:word-1`],
    ]);
    expect(
      mapReplacedTranscriptIdentities([old], [next], 'audio-b', 'capture-1')
        .segments.size,
    ).toBe(0);
    expect(
      mapReplacedTranscriptIdentities([old], [next], 'audio-a', 'other-source')
        .segments.size,
    ).toBe(0);
  });

  it('reconciles legacy caption and review references while retaining human edits and review state', async () => {
    const data = await dataFor();
    const original = structuredClone(data.config);
    const host = importer(data);
    host.importTranscript({ document: documentFor() });
    const next = host.dataRef.current;
    const old = legacySource().id;
    const canonical = canonicalSource().id;
    expect(next.config.clips[1]).toEqual({
      ...original.clips[1],
      id: transcriptCaptionClipId(`${canonical}@media-a`),
      app: {
        ...original.clips[1].app,
        __generated__: {
          ...(original.clips[1].app!.__generated__ as object),
          provenance: {
            ...(original.clips[1].app!.__generated__ as { provenance: object })
              .provenance,
            sourceItemId: canonical,
          },
        },
      },
    });
    expect(next.config.app?.[TRANSCRIPT_LANE_EXTENSION_ID]).toEqual({
      preferences: { color: 'blue' },
      [reviewKey(canonical)]: { ...review(old), sourceItemId: canonical },
    });
    expect(next.sourceItemsBySchemaRef?.[TRANSCRIPT_SCHEMA_REF]).toEqual([
      canonicalSource(),
    ]);
    expect(data.config).toEqual(original);
  });

  it('repeated import keeps one edited caption under the canonical occurrence id and one review', async () => {
    const host = importer(await dataFor());
    host.importTranscript({ document: documentFor() });
    const first = structuredClone(host.dataRef.current.config);
    host.importTranscript({ document: documentFor() });
    expect(host.dataRef.current.config).toEqual(first);
    const source = canonicalSource();
    const caption = host.dataRef.current.config.clips[1];
    // The reconciled caption keeps the id a preserve-mode materialization of
    // the canonical occurrence derives, so no second caption is ever created.
    expect(caption.id).toBe(transcriptCaptionClipId(`${source.id}@media-a`));
    expect(
      host.dataRef.current.config.clips.filter(
        (clip) => clip.track === TRANSCRIPT_CAPTION_TRACK_ID,
      ),
    ).toHaveLength(1);
    expect(host.dataRef.current.config.clips[1].text?.content).toBe(
      'Human correction',
    );
    expect(
      Object.keys(
        host.dataRef.current.config.app![
          TRANSCRIPT_LANE_EXTENSION_ID
        ] as object,
      ),
    ).toHaveLength(2);
  });

  it('leaves ambiguous shared reviews and asset-level captions unresolved through sequential imports', async () => {
    const data = await dataFor([legacySource(), legacySource('audio-b')]);
    const old = legacySource().id;
    data.config.clips[1].id = transcriptCaptionClipId(`${old}@source`);
    const config = structuredClone(data.config);
    const host = importer(data);
    host.importTranscript({ document: documentFor() });
    host.importTranscript({ document: documentFor('audio-b') });
    host.importTranscript({ document: documentFor() });
    expect(host.dataRef.current.config).toEqual(config);
    expect(
      host.dataRef.current.sourceItemsBySchemaRef?.[TRANSCRIPT_SCHEMA_REF],
    ).toEqual([canonicalSource('audio-b'), canonicalSource()]);
    expect(
      host.dataRef.current.config.app?.[TRANSCRIPT_LANE_EXTENSION_ID],
    ).toHaveProperty(reviewKey(old));
    expect(
      host.dataRef.current.config.app?.[TRANSCRIPT_LANE_EXTENSION_ID],
    ).not.toHaveProperty(reviewKey(canonicalSource().id));
  });

  it('uses a media occurrence to resolve a shared caption without assigning the ambiguous review', async () => {
    const host = importer(
      await dataFor([legacySource(), legacySource('audio-b')]),
    );
    host.importTranscript({ document: documentFor('audio-b') });
    expect(host.dataRef.current.config.clips[1].id).toBe(
      transcriptCaptionClipId(`${legacySource().id}@media-a`),
    );
    host.importTranscript({ document: documentFor() });
    expect(host.dataRef.current.config.clips[1].id).toBe(
      transcriptCaptionClipId(`${canonicalSource().id}@media-a`),
    );
    expect(
      host.dataRef.current.config.app?.[TRANSCRIPT_LANE_EXTENSION_ID],
    ).toHaveProperty(reviewKey(legacySource().id));
  });

  it('preserves omitted-source fallback identities and references', async () => {
    const { assetId, segments } = documentFor();
    const document = { assetId, segments };
    const fallback = normalizeTranscriptSource(document)[0];
    const data = await buildTimelineData(
      configFor(fallback.id),
      registry,
      (file) => file,
      1,
      { [TRANSCRIPT_SCHEMA_REF]: [fallback] },
    );
    const host = importer(data);
    host.importTranscript({ document });
    expect(host.dataRef.current.config).toEqual(data.config);
    expect(
      host.dataRef.current.sourceItemsBySchemaRef?.[TRANSCRIPT_SCHEMA_REF],
    ).toEqual([fallback]);
  });
});
