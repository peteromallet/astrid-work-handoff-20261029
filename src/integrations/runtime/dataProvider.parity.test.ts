/**
 * RuntimeDataProvider contract assertions.
 *
 * Each test here asserts the DataProvider contract against the Runtime: load defaults, registry resolution, single-publish
 * saves, stale-head conflicts, bundle passthrough, identity validation and
 * load freshness. Bridge-only mechanisms (ULID aliases, PUT /registry, File
 * System Access drops, generation materialisation) have no Runtime
 * counterpart and are not tested here.
 *
 * The shared numeric-version suite runs in
 * tools/video-editor/testing/__tests__/providerCompatibility.runtime.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { RuntimeDataProvider } from './dataProvider.ts';
import {
  TimelineBundleParseError,
  type TimelineBundleEnvelope,
} from '@/tools/video-editor/data/typed/timelineBundle.ts';
import {
  TimelineNotFoundError,
  TimelineSchemaIncompatibleError,
  isTimelineVersionConflictError,
} from '@/tools/video-editor/data/DataProvider.ts';
import { uploadAssetWithResolver } from '@/tools/video-editor/data/AssetResolver.ts';
import { InMemoryDataProvider } from '@/tools/video-editor/testing/InMemoryDataProvider.ts';
import {
  expectUnsupportedExtensionPersistenceDiagnostics,
} from '@/tools/video-editor/data/conformance/extensionPersistenceConformance.ts';
import type { AssetRegistry, TimelineConfig } from '@/tools/video-editor/types/index.ts';
import {
  MANAGED_OBJECT_DIGEST,
  MANAGED_OBJECT_ID,
  PROJECT_ID,
  TIMELINE_ID,
  json,
  runtimeFixture,
} from '@/test/fakeWorkspaceRuntime.ts';

const BASE_URL = 'http://runtime.test';
const OTHER_OBJECT_ID = `sha256:${'b'.repeat(64)}`;
const objectUrl = (objectId: string) => `${BASE_URL}/v1/objects/${encodeURIComponent(objectId)}`;

type Fixture = ReturnType<typeof runtimeFixture>;
type FixtureTransport = Fixture['transport'];

function providerFor(fixture: Fixture, transport: FixtureTransport = fixture.transport) {
  return new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: BASE_URL, token: 'fixture-token', transport });
}

const isPublication = (request: Fixture['requests'][number]) =>
  request.method === 'POST' && request.path.endsWith('/composition-revisions');
const publications = (fixture: Fixture) => fixture.requests.filter(isPublication);
const inspections = (fixture: Fixture) =>
  fixture.requests.filter((request) => request.method === 'POST' && request.path.endsWith('/inspect'));

const track = { id: 'V1', kind: 'visual' as const, label: 'V1' };

function composition(
  overrides: { config?: unknown; registry?: AssetRegistry; clips?: unknown[] } = {},
) {
  return {
    config: overrides.config ?? { clips: [], tracks: [track] },
    registry: overrides.registry ?? { assets: {} },
    clips: overrides.clips ?? [],
    occurrences: [],
  };
}

function managedRegistry(assets: Record<string, { file?: string; media_id: string }>): AssetRegistry {
  return {
    assets: Object.fromEntries(Object.entries(assets).map(([key, value]) => [key, {
      type: 'video/mp4',
      ...value,
    }])),
  } as AssetRegistry;
}

/** Rewrites the JSON body of matching fixture responses, simulating a Runtime that answers for the wrong identity. */
function tamper(
  transport: FixtureTransport,
  matches: (method: string, path: string) => boolean,
  mutate: (body: Record<string, unknown>) => void,
): FixtureTransport {
  return async (method, path, headers, body) => {
    const response = await transport(method, path, headers, body);
    if (!matches(method, path)) return response;
    const parsed = JSON.parse(new TextDecoder().decode(response.body)) as Record<string, unknown>;
    mutate(parsed);
    return { ...response, body: json(parsed) };
  };
}

describe('capability flags', () => {
  it('declares the Runtime capabilities the editor reads, with no extension persistence and no cloud sync', () => {
    const provider = providerFor(runtimeFixture());

    expect(provider.supportsDirectAssetUpload).toBe(true);
    expect(provider.persistenceEnabled).toBe(true);
    expect('syncTimeline' in provider).toBe(false);
    expect('createExtensionPersistenceService' in provider).toBe(false);
    expectUnsupportedExtensionPersistenceDiagnostics(provider, [], 'Workspace Runtime');
  });

  it('declares no direct asset upload for InMemoryDataProvider', () => {
    const provider = new InMemoryDataProvider();
    expect(provider.supportsDirectAssetUpload).toBe(false);
  });
});

describe('load and registry', () => {
  it('loads a config-only head, defaulting version, output and registry', async () => {
    const fixture = runtimeFixture({ parentComposition: { config: { clips: [], tracks: [track] }, occurrences: [] } });
    const provider = providerFor(fixture);

    const loaded = await provider.loadTimeline(TIMELINE_ID);

    expect(loaded.configVersion).toBe(1);
    expect(loaded.config.tracks).toEqual([track]);
    expect(loaded.config.output).toEqual(expect.objectContaining({ resolution: '1280x720', fps: 30, file: 'output.mp4' }));
    await expect(provider.loadAssetRegistry(TIMELINE_ID)).resolves.toEqual({ assets: {} });
  });

  it('preserves unknown keys on clips, tracks and registry entries through load and save', async () => {
    const clips = [{ id: 'c1', track: 'V1', at: 0, hold: 1, extensionAuthored: { keep: true } }];
    const fixture = runtimeFixture({ parentComposition: composition({
      config: { clips, tracks: [{ ...track, vendorField: 7 }] },
      clips,
      registry: { assets: { 'asset-video': { file: 'clips/demo.mp4', media_id: MANAGED_OBJECT_ID, vendorField: 'kept' } } } as unknown as AssetRegistry,
    }) });
    const provider = providerFor(fixture);

    const loaded = await provider.loadTimeline(TIMELINE_ID);
    const registry = await provider.loadAssetRegistry(TIMELINE_ID);
    expect(loaded.config.clips[0]).toMatchObject({ extensionAuthored: { keep: true } });
    expect(loaded.config.tracks?.[0]).toMatchObject({ vendorField: 7 });
    expect(registry.assets['asset-video']).toMatchObject({ vendorField: 'kept' });

    await provider.saveTimelineAtHead(TIMELINE_ID, loaded.config, loaded.head!, registry);
    const reloaded = await providerFor(fixture).loadTimeline(TIMELINE_ID);
    expect(reloaded.config.clips[0]).toMatchObject({ extensionAuthored: { keep: true } });
    expect(reloaded.config.tracks?.[0]).toMatchObject({ vendorField: 7 });
    expect((await providerFor(fixture).loadAssetRegistry(TIMELINE_ID)).assets['asset-video']).toMatchObject({ vendorField: 'kept' });
  });

  it('rejects a non-object config instead of coercing it', async () => {
    const fixture = runtimeFixture({ parentComposition: composition({ config: 'garbage-string' }) });

    await expect(providerFor(fixture).loadTimeline(TIMELINE_ID)).rejects.toBeInstanceOf(TimelineSchemaIncompatibleError);
  });

  it('reports a transport timeout as an unavailable Runtime', async () => {
    const provider = providerFor(runtimeFixture(), async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });

    await expect(provider.loadTimeline(TIMELINE_ID)).rejects.toMatchObject({ code: 'runtime_unavailable' });
  });

  it('reports an unreadable non-2xx body as an unavailable Runtime, not a missing timeline', async () => {
    const fixture = runtimeFixture();
    const provider = providerFor(fixture, async (method, path, headers, body) => (
      path.endsWith('/inspect')
        ? { status: 502, headers: {}, body: new TextEncoder().encode('{not-json') }
        : fixture.transport(method, path, headers, body)
    ));

    const error = await provider.loadTimeline(TIMELINE_ID).catch((thrown: unknown) => thrown);

    expect(error).toMatchObject({ code: 'runtime_unavailable', status: 502 });
    expect(error).not.toBeInstanceOf(TimelineNotFoundError);
  });

  it('fails a malformed 2xx body closed instead of loading it', async () => {
    const fixture = runtimeFixture();
    const provider = providerFor(fixture, async (method, path, headers, body) => (
      path.endsWith('/inspect')
        ? { status: 200, headers: {}, body: new TextEncoder().encode('{not-json') }
        : fixture.transport(method, path, headers, body)
    ));

    await expect(provider.loadTimeline(TIMELINE_ID)).rejects.toThrow();
    expect(fixture.requests.some((request) => request.path.includes('/composition-revisions/'))).toBe(false);
  });

  it('passes an opaque timeline id into the request path exactly as given', async () => {
    const legacyId = '01KYPVKMW5STB4W6FE05ED8242';
    const fixture = runtimeFixture();
    const paths: string[] = [];
    const provider = providerFor(fixture, async (method, path, headers, body) => {
      if (!path.includes('/timelines/')) return fixture.transport(method, path, headers, body);
      paths.push(path);
      return { status: 404, headers: {}, body: json({ code: 'not_found', message: 'unknown timeline' }) };
    });

    await expect(provider.loadTimeline(legacyId)).rejects.toBeInstanceOf(TimelineNotFoundError);
    expect(paths).toEqual([`/v1/projects/${PROJECT_ID}/timelines/${legacyId}/inspect`]);
  });
});

describe('asset resolve', () => {
  it('resolves media_id-only entries by registry key, media_id and onResolve, and fails closed for unknown ids', async () => {
    const fixture = runtimeFixture({ parentComposition: composition({
      registry: { assets: { source_audio: { media_id: MANAGED_OBJECT_ID, type: 'audio/mpeg' } } } as unknown as AssetRegistry,
    }) });
    const provider = providerFor(fixture);
    await provider.loadAssetRegistry(TIMELINE_ID);

    await expect(provider.resolveAssetUrl('source_audio')).resolves.toBe(objectUrl(MANAGED_OBJECT_ID));
    await expect(provider.resolveAssetUrl(MANAGED_OBJECT_ID)).resolves.toBe(objectUrl(MANAGED_OBJECT_ID));
    await expect(provider.onResolve({
      file: MANAGED_OBJECT_ID,
      assetId: 'source_audio',
      entry: { media_id: MANAGED_OBJECT_ID, type: 'audio/mpeg' },
    })).resolves.toBe(objectUrl(MANAGED_OBJECT_ID));
    await expect(provider.resolveAssetUrl('unregistered-media-id')).rejects.toThrow('has no managed object for asset unregistered-media-id');
  });

  it('does not fall back to a shared file locator when the asset key is unknown', async () => {
    const fixture = runtimeFixture({ parentComposition: composition({
      registry: managedRegistry({
        stale_file_asset: { file: 'shared/file.wav', media_id: OTHER_OBJECT_ID },
        source_audio: { file: 'shared/file.wav', media_id: MANAGED_OBJECT_ID },
      }),
    }) });
    const provider = providerFor(fixture);
    await provider.loadAssetRegistry(TIMELINE_ID);

    await expect(provider.onResolve({ file: 'shared/file.wav', assetId: 'unknown_asset' }))
      .rejects.toThrow('has no managed object for asset unknown_asset');
  });

  it('prefers the explicit asset key during onResolve when files overlap', async () => {
    const fixture = runtimeFixture({ parentComposition: composition({
      registry: managedRegistry({
        'asset-a': { file: 'shared/file.mp4', media_id: OTHER_OBJECT_ID },
        'asset-b': { file: 'shared/file.mp4', media_id: MANAGED_OBJECT_ID },
      }),
    }) });
    const provider = providerFor(fixture);
    await provider.loadAssetRegistry(TIMELINE_ID);

    await expect(provider.onResolve({ file: 'shared/file.mp4', assetId: 'asset-b' })).resolves.toBe(objectUrl(MANAGED_OBJECT_ID));
    await expect(provider.onResolve({ file: 'shared/file.mp4', assetId: 'asset-a' })).resolves.toBe(objectUrl(OTHER_OBJECT_ID));
  });

  it('rejects an unregistered relative path, and passes an absolute URL through, before any registry is loaded', async () => {
    const provider = providerFor(runtimeFixture());

    await expect(provider.resolveAssetUrl('relative.mp4')).rejects.toThrow('has no managed object for asset relative.mp4');
    await expect(provider.resolveAssetUrl('https://example.test/a.mp4')).resolves.toBe('https://example.test/a.mp4');
  });

  it('persists registry metadata (integrity, provenance, enrichment, extensions) across a fresh provider read', async () => {
    const metadata = {
      integrity: { algorithm: 'sha256', hash: 'parser-hash', size: 5 },
      provenance: { source: 'parser-test' },
      enrichment: {
        pending: 1,
        failed: 0,
        claims: [{ claimId: 'claim-1', parserId: 'com.example.parser', field: 'description' }],
      },
      extensions: { 'com.example.parser': { parsed: true } },
    };
    const fixture = runtimeFixture();
    const provider = providerFor(fixture);

    await provider.registerAsset(TIMELINE_ID, 'asset-enriched', {
      file: objectUrl(MANAGED_OBJECT_ID),
      type: 'video/mp4',
      duration: 4,
      media_id: MANAGED_OBJECT_ID,
      content_sha256: MANAGED_OBJECT_DIGEST,
      metadata,
    } as AssetRegistry['assets'][string]);

    const fresh = await providerFor(fixture).loadAssetRegistry(TIMELINE_ID);
    expect(fresh.assets['asset-enriched'].metadata).toEqual(metadata);
  });
});

describe('save and CAS', () => {
  it('publishes config, registry and the expected head in one request and resolves assets from the saved registry', async () => {
    const fixture = runtimeFixture({ parentComposition: composition() });
    const provider = providerFor(fixture);
    const loaded = await provider.loadTimeline(TIMELINE_ID);
    const savedRegistry = managedRegistry({ 'asset-save': { file: 'clips/saved.mp4', media_id: MANAGED_OBJECT_ID } });
    const edited: TimelineConfig = {
      ...loaded.config,
      output: { resolution: '1280x720', fps: 30, file: 'output.mp4' },
      tracks: [{ ...track, label: 'Saved V1' }],
    };

    const receipt = await provider.saveTimelineAtHead(TIMELINE_ID, edited, loaded.head!, savedRegistry);

    const writes = fixture.requests.filter((request) => request.method !== 'GET' && !request.path.endsWith('/inspect')
      && request.path !== '/v1/handshake');
    expect(writes.map((request) => `${request.method} ${request.path}`)).toEqual([
      `POST /v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/composition-revisions`,
    ]);
    const body = publications(fixture)[0].body as {
      expected_head: string;
      parent_composition: { config: Record<string, unknown>; registry: AssetRegistry };
    };
    expect(body.expected_head).toBe('parent-r1');
    expect(body.parent_composition.config.tracks).toEqual([{ ...track, label: 'Saved V1' }]);
    expect(body.parent_composition.config).not.toHaveProperty('output');
    expect(body.parent_composition.registry).toEqual(savedRegistry);
    expect(receipt.configVersion).toBe(2);
    await expect(provider.resolveAssetUrl('clips/saved.mp4')).resolves.toBe(objectUrl(MANAGED_OBJECT_ID));
  });

  it('keeps the loaded registry when a save passes none, from one cached base read', async () => {
    const registry = managedRegistry({ 'asset-kept': { file: 'clips/kept.mp4', media_id: MANAGED_OBJECT_ID } });
    const fixture = runtimeFixture({ parentComposition: composition({ registry }) });
    const provider = providerFor(fixture);
    const loaded = await provider.loadTimeline(TIMELINE_ID);

    await provider.saveTimelineAtHead(TIMELINE_ID, { ...loaded.config, tracks: [{ ...track, label: 'Edited' }] }, loaded.head!);

    expect(publications(fixture)).toHaveLength(1);
    expect((publications(fixture)[0].body as { parent_composition: { registry: AssetRegistry } }).parent_composition.registry).toEqual(registry);
    const revisionReads = fixture.requests.filter((request) => request.method === 'GET'
      && request.path.endsWith('/composition-revisions/parent-r1'));
    expect(revisionReads).toHaveLength(1);
  });

  it('registers assets by publishing the merged registry once per call and chains each publication on the advanced head', async () => {
    const seeded = managedRegistry({
      'asset-video': { file: 'clips/demo.mp4', media_id: MANAGED_OBJECT_ID },
      'asset-image': { file: 'stills/cover.png', media_id: OTHER_OBJECT_ID },
    });
    const fixture = runtimeFixture({ parentComposition: composition({ registry: seeded }) });
    const provider = providerFor(fixture);
    const entry = { file: 'audio/voice.wav', type: 'audio/wav', duration: 2.5 } as AssetRegistry['assets'][string];

    await provider.registerAsset(TIMELINE_ID, 'asset-audio', entry);
    await provider.registerAsset(TIMELINE_ID, 'asset-audio', entry);

    const posts = publications(fixture);
    expect(posts).toHaveLength(2);
    const registryOf = (index: number) => (posts[index].body as { parent_composition: { registry: AssetRegistry } }).parent_composition.registry;
    expect(Object.keys(registryOf(0).assets)).toEqual(['asset-video', 'asset-image', 'asset-audio']);
    expect(registryOf(1).assets['asset-audio']).toEqual(entry);
    // The second publication must be based on the head the first one created,
    // never on the stale loaded head, or Runtime would answer 409.
    expect((posts[1].body as { expected_head: string }).expected_head)
      .toBe((posts[0].body as { parent_revision_id: string }).parent_revision_id);
    expect(fixture.read().documentVersion).toBe(3);
    expect(fixture.requests.some((request) => request.path.includes('/registry'))).toBe(false);
  });

  it('rejects a save based on a stale head with the expected version, then accepts it once reloaded', async () => {
    const fixture = runtimeFixture({ parentComposition: composition() });
    const editor = providerFor(fixture);
    const otherTab = providerFor(fixture);
    const base = await editor.loadTimeline(TIMELINE_ID);
    const otherBase = await otherTab.loadTimeline(TIMELINE_ID);
    await otherTab.saveTimelineAtHead(TIMELINE_ID, { ...otherBase.config, tracks: [{ ...track, label: 'Other tab' }] }, otherBase.head!);
    const mine = { ...base.config, tracks: [{ ...track, label: 'Mine' }] };
    const registry = managedRegistry({ a: { file: 'f.mp4', media_id: MANAGED_OBJECT_ID } });

    const conflict = await editor.saveTimelineAtHead(TIMELINE_ID, mine, base.head!, registry).catch((thrown: unknown) => thrown);

    expect(isTimelineVersionConflictError(conflict)).toBe(true);
    expect(conflict).toMatchObject({ code: 'timeline_version_conflict', expectedVersion: base.configVersion });
    expect(fixture.read().documentVersion).toBe(2);
    expect(fixture.read().config.tracks[0]?.label).toBe('Other tab');

    const reloaded = await editor.loadTimeline(TIMELINE_ID);
    expect(reloaded.config.tracks?.[0]?.label).toBe('Other tab');
    const retried = await editor.saveTimelineAtHead(TIMELINE_ID, mine, reloaded.head!, registry);
    expect(retried.configVersion).toBe(reloaded.configVersion + 1);
    expect(fixture.read().config.tracks[0]?.label).toBe('Mine');
  });

  it('fails a rejected save terminally with the Runtime message and no retry', async () => {
    const fixture = runtimeFixture();
    let attempts = 0;
    const provider = providerFor(fixture, async (method, path, headers, body) => {
      if (method === 'POST' && path.endsWith('/composition-revisions')) {
        attempts += 1;
        return { status: 400, headers: {}, body: json({ code: 'invalid_registry', message: 'registry body must contain an assets object' }) };
      }
      return fixture.transport(method, path, headers, body);
    });
    const loaded = await provider.loadTimeline(TIMELINE_ID);

    const error = await provider.saveTimelineAtHead(TIMELINE_ID, loaded.config, loaded.head!).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TimelineSchemaIncompatibleError);
    expect((error as Error).message).toContain('registry body must contain an assets object');
    expect(attempts).toBe(1);
  });

  it('maps a missing timeline on publish to TimelineNotFoundError', async () => {
    const fixture = runtimeFixture();
    const provider = providerFor(fixture, async (method, path, headers, body) => (
      method === 'POST' && path.endsWith('/composition-revisions')
        ? { status: 404, headers: {}, body: json({ code: 'not_found', message: 'timeline missing' }) }
        : fixture.transport(method, path, headers, body)
    ));
    const loaded = await provider.loadTimeline(TIMELINE_ID);

    await expect(provider.saveTimelineAtHead(TIMELINE_ID, loaded.config, loaded.head!)).rejects.toBeInstanceOf(TimelineNotFoundError);
  });
});

describe('uploads', () => {
  const file = () => new File(['managed creative'], 'managed-creative.mp4', { type: 'video/mp4' });

  it('routes resolver uploads through media import and one registry publication', async () => {
    const fixture = runtimeFixture();
    const provider = providerFor(fixture);

    const result = await uploadAssetWithResolver(provider, {
      file: file(),
      options: { timelineId: TIMELINE_ID, userId: 'user-1' },
    });

    expect(result.assetId).toBe(MANAGED_OBJECT_ID);
    expect(fixture.requests.filter((request) => request.method === 'POST' && request.path.endsWith('/media-imports'))).toHaveLength(1);
    const posts = publications(fixture);
    expect(posts).toHaveLength(1);
    expect((posts[0].body as { parent_composition: { registry: AssetRegistry } }).parent_composition.registry.assets[result.assetId])
      // The wire carries the object's route, never the absolute URL it was first seen at: the Runtime refuses any other locator when it freezes a render.
      .toMatchObject({ media_id: MANAGED_OBJECT_ID, file: `/v1/objects/${encodeURIComponent(MANAGED_OBJECT_ID)}`, type: 'video/mp4' });
  });

  it('leaves the registry and the timeline untouched when the media import is refused', async () => {
    const fixture = runtimeFixture();
    const provider = providerFor(fixture, async (method, path, headers, body) => (
      method === 'POST' && path.endsWith('/media-imports')
        ? { status: 403, headers: {}, body: json({ code: 'forbidden', message: 'project folder is read-only' }) }
        : fixture.transport(method, path, headers, body)
    ));

    await expect(provider.uploadAsset(file(), { timelineId: TIMELINE_ID, userId: 'user-1' })).rejects.toThrow('project folder is read-only');

    expect(publications(fixture)).toHaveLength(0);
    expect(fixture.read().documentVersion).toBe(1);
    await expect(providerFor(fixture).loadAssetRegistry(TIMELINE_ID)).resolves.toEqual({ assets: {} });
  });
});

describe('bundle passthrough', () => {
  const bundle = (text: string): TimelineBundleEnvelope => ({
    schema_version: 1,
    itemsBySchemaRef: {
      'astrid.transcript_segment/v1': [{
        id: 'assetA:src:9a03b4c1d2e4',
        shape: 'interval',
        domain: 'source_seconds',
        extent: { start: 0, end: 1.5 },
        schemaRef: 'astrid.transcript_segment/v1',
        payload: { text },
        sourceArtifactRef: { assetId: 'assetA' },
        provenance: { adapterId: 'astrid.adaptTranscript', adapterVersion: '1' },
      }],
    },
  }) as TimelineBundleEnvelope;

  it('reports no bundle key when the head carries none, and null only after an explicit clear', async () => {
    const fixture = runtimeFixture({ parentComposition: composition() });
    const provider = providerFor(fixture);
    const initial = await provider.loadTimeline(TIMELINE_ID);
    expect(initial).not.toHaveProperty('bundle');

    const withBundle = await provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!, undefined, bundle('hello'));
    const cleared = await provider.saveTimelineAtHead(TIMELINE_ID, initial.config, withBundle.head, undefined, null);

    expect((publications(fixture)[1].body as { parent_composition: { config: Record<string, unknown> } }).parent_composition.config.bundle).toBeNull();
    const reloaded = await providerFor(fixture).loadTimeline(TIMELINE_ID);
    expect(reloaded.head).toEqual(cleared.head);
    expect(reloaded.bundle).toBeNull();
  });

  it('fails the whole load closed when the head declares an unparsable bundle', async () => {
    const invalid = { ...bundle('x'), schema_version: 99 };
    const fixture = runtimeFixture({ parentComposition: composition({ config: { clips: [], tracks: [track], bundle: invalid } }) });

    await expect(providerFor(fixture).loadTimeline(TIMELINE_ID)).rejects.toBeInstanceOf(TimelineBundleParseError);
  });

  it('rejects an invalid bundle before any publication request', async () => {
    const fixture = runtimeFixture({ parentComposition: composition() });
    const provider = providerFor(fixture);
    const loaded = await provider.loadTimeline(TIMELINE_ID);
    const invalid = { ...bundle('x'), schema_version: 99 } as unknown as TimelineBundleEnvelope;

    await expect(provider.saveTimelineAtHead(TIMELINE_ID, loaded.config, loaded.head!, undefined, invalid))
      .rejects.toBeInstanceOf(TimelineBundleParseError);

    expect(publications(fixture)).toHaveLength(0);
    expect(fixture.read().documentVersion).toBe(1);
  });
});

describe('identity validation', () => {
  const inspectPath = (method: string, path: string) => method === 'POST' && path.endsWith('/inspect');
  const revisionPath = (method: string, path: string) => method === 'GET' && path.includes('/composition-revisions/');

  it('accepts a head whose project and timeline match the request', async () => {
    const fixture = runtimeFixture({ parentComposition: composition() });

    await expect(providerFor(fixture).loadTimeline(TIMELINE_ID)).resolves.toMatchObject({
      head: { projectId: PROJECT_ID, timelineId: TIMELINE_ID, headRevisionId: 'parent-r1' },
    });
  });

  it('rejects an inspection that answers for another timeline', async () => {
    const fixture = runtimeFixture({ parentComposition: composition() });
    const provider = providerFor(fixture, tamper(fixture.transport, inspectPath, (body) => { body.timeline_id = 'timeline-other'; }));

    await expect(provider.loadTimeline(TIMELINE_ID)).rejects.toThrow('belongs to timeline timeline-other, not timeline-r1');
  });

  it('rejects an inspection that answers for another project', async () => {
    const fixture = runtimeFixture({ parentComposition: composition() });
    const provider = providerFor(fixture, tamper(fixture.transport, inspectPath, (body) => { body.project_id = 'project-other'; }));

    await expect(provider.loadTimeline(TIMELINE_ID)).rejects.toThrow('belongs to project project-other, not project-r1');
  });

  it('rejects a revision payload that belongs to another project or carries another revision id', async () => {
    const fixture = runtimeFixture({ parentComposition: composition() });
    const wrongProject = providerFor(fixture, tamper(fixture.transport, revisionPath, (body) => { body.project_id = 'project-other'; }));
    const wrongRevision = providerFor(fixture, tamper(fixture.transport, revisionPath, (body) => { body.revision_id = 'parent-other'; }));

    await expect(wrongProject.loadTimeline(TIMELINE_ID)).rejects.toThrow('belongs to project project-other, not project-r1');
    await expect(wrongRevision.loadTimeline(TIMELINE_ID)).rejects.toThrow('identity mismatch: requested parent-r1, got parent-other');
  });
});

describe('load freshness', () => {
  const externalHead = () => ({
    ...composition({
      config: { clips: [], tracks: [{ ...track, label: 'External' }] },
      registry: managedRegistry({ 'asset-external': { file: 'clips/external.mp4', media_id: OTHER_OBJECT_ID } }),
    }),
  });

  it('re-reads the head on every load so polling consumers observe external changes', async () => {
    const fixture = runtimeFixture({ parentComposition: composition() });
    const provider = providerFor(fixture);

    const first = await provider.loadTimeline(TIMELINE_ID);
    expect(first.configVersion).toBe(1);

    fixture.setHead('parent-external', externalHead());
    const second = await provider.loadTimeline(TIMELINE_ID);
    expect(second.configVersion).toBe(2);
    expect(second.config.tracks?.[0]?.label).toBe('External');
    expect(second.head?.headRevisionId).toBe('parent-external');

    const registry = await provider.loadAssetRegistry(TIMELINE_ID);
    expect(Object.keys(registry.assets)).toEqual(['asset-external']);
    expect(inspections(fixture)).toHaveLength(3);
  });

  it('reads the immutable revision once when the timeline and registry load together', async () => {
    const fixture = runtimeFixture({ parentComposition: composition() });
    const provider = providerFor(fixture);

    const [loaded, registry] = await Promise.all([
      provider.loadTimeline(TIMELINE_ID),
      provider.loadAssetRegistry(TIMELINE_ID),
    ]);

    expect(loaded.head?.headRevisionId).toBe('parent-r1');
    expect(registry).toEqual({ assets: {} });
    expect(fixture.requests.filter((request) => request.method === 'GET'
      && request.path.endsWith('/composition-revisions/parent-r1'))).toHaveLength(1);
  });
});
