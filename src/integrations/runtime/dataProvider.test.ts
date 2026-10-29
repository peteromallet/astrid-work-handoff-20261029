import { describe, expect, it, vi } from 'vitest';
import { AstridRuntimeClient, RuntimeAuthenticationError, RUNTIME_CLIENT_SCOPES } from './client.ts';
import { RuntimeDataProvider, toRuntimePublication } from './dataProvider.ts';
import { TimelineSchemaIncompatibleError, TimelineVersionConflictError, isOwnUnacknowledgedSaveError } from '@/tools/video-editor/data/DataProvider.ts';
import { createTimelineReader } from '@/tools/video-editor/lib/timeline-reader.ts';
import { buildTimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import {
  RUNTIME_SCHEMA_DIGEST,
  RUNTIME_TARGETED_EXECUTION_CAPABILITY,
} from './contract-metadata.ts';
import { sanitizeTimelineClipSnapshot } from '@/tools/video-editor/lib/timeline-domain.ts';
import { createDefaultTimelineConfig } from '@/tools/video-editor/lib/defaults.ts';
import type { ProjectObjectMetadata } from '@astrid/editor-sdk';
import { MANAGED_OBJECT_DIGEST, MANAGED_OBJECT_ID, PROJECT_ID, TIMELINE_ID, json, runtimeFixture, sha256Digest } from '@/test/fakeWorkspaceRuntime.ts';

const MANAGED_OBJECT_URL = `http://runtime.test/v1/objects/${encodeURIComponent(MANAGED_OBJECT_ID)}`;
/** What a published registry entry's `file` is: the object's route, the only locator the Runtime accepts when it freezes a render. */
const MANAGED_OBJECT_ROUTE = `/v1/objects/${encodeURIComponent(MANAGED_OBJECT_ID)}`;


function packageBodyBytes(
  manifest: Record<string, unknown>,
  entry: unknown,
  assets: readonly unknown[] = [],
): Uint8Array {
  return json({ manifest, entry, assets });
}

// Saved compact composition: 320x180/30 fps, three ordinary parent clips,
// no child occurrences.
function compactParentComposition() {
  const config = {
    ...createDefaultTimelineConfig(),
    output: { ...createDefaultTimelineConfig().output, resolution: '320x180', fps: 30 },
    tracks: [...createDefaultTimelineConfig().tracks!, { id: 'Overlay', kind: 'visual' as const, label: 'Overlay' }],
    app: { extensionSentinel: { enabled: true } },
    customConfig: { sentinel: 'keep-config' },
  };
  const clips = [
    {
      id: 'l3-scene', track: 'V1', at: 0, from: 63, to: 65, speed: 1,
      clipType: 'haus.astrid.liveScene',
      app: { liveScene: { revision: 'sha256:7c036c46ba2c4fedbf911a72b694c8c6ab2f5dd3211d4023857809a4bbc7fe6b', html: '<html>scene fixture</html>' } },
    },
    { id: 'l3-label', track: 'Overlay', at: 0.5, hold: 1, text: 'Maple Hollow' },
    { id: 'l3-tone', track: 'A1', at: 0.4, from: 0, to: 0.6, volume: 0.8, asset: 'tone' },
  ];
  const registry = {
    assets: { tone: {
      file: 'tone.wav', type: 'audio' as const, duration: 0.6,
      media_id: 'sha256:fa17b6d0dc1e6ca7aed9833b0ceded944644f12b22964f081d7a982427f8ac29',
      content_sha256: 'sha256:fa17b6d0dc1e6ca7aed9833b0ceded944644f12b22964f081d7a982427f8ac29',
      metadata: { provenance: { sourceProvider: 'runtime-fixture' } },
    } },
    customRegistry: { sentinel: 'keep-registry' },
  };
  return { config, registry, clips, occurrences: [], tracks: config.tracks, provenance: { sentinel: 'keep-parent' } };
}



describe('RuntimeDataProvider', () => {
  it('reads placements from the parent payload already used by timeline rows', async () => {
    const fixture = runtimeFixture({ parentComposition: {
      ...compactParentComposition(),
      occurrences: [{
        occurrence_id: 'occ-opening', shot_id: 'chapter-opening',
        shot_revision_id: 'shot-revision-1', ordinal: 0,
        at_ms: 1_000, placement: { start_ms: 1_250, track: 'old-track' },
        duration_ms: 2_000, track: 'picture',
      }],
    } });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    await provider.loadTimeline(TIMELINE_ID);
    const placements = await provider.shotComposition.loadPlacements!({
      projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID, poll: true,
    });

    expect(placements).toEqual([{
      occurrenceId: 'occ-opening', shotId: 'chapter-opening', ordinal: 0,
      atMs: 1_250, durationMs: 2_000, trackId: 'picture',
    }]);
    expect(fixture.requests.filter((request) => request.method === 'GET'
      && request.path.endsWith(`/composition-revisions/parent-r1`))).toHaveLength(1);
  });

  it('shares the in-flight parent revision between placements and the graph', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const request = { projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID, poll: true };

    await Promise.all([
      provider.shotComposition.loadPlacements!(request),
      provider.shotComposition.load(request),
    ]);

    expect(fixture.requests.filter((item) => item.method === 'GET'
      && item.path.endsWith('/composition-revisions/parent-r1'))).toHaveLength(1);
  });


  it('shares near-simultaneous idle head checks and checks immediately after a local save', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });
    let now = 0;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const inspections = () => fixture.requests.filter((request) => request.method === 'POST' && request.path.endsWith('/inspect')).length;
    try {
      for (now = 0; now < 60_000; now += 2_000) {
        await provider.loadTimeline(TIMELINE_ID, { poll: true });
        await provider.loadAssetRegistry(TIMELINE_ID, { poll: true });
        await provider.shotComposition.load({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID, poll: true });
      }
      expect(inspections()).toBeLessThanOrEqual(30);
      const loaded = await provider.loadTimeline(TIMELINE_ID);
      const beforeSave = inspections();
      await provider.saveTimelineAtHead(TIMELINE_ID, loaded.config, loaded.head!);
      await provider.loadTimeline(TIMELINE_ID, { poll: true });
      expect(inspections()).toBe(beforeSave + 1);
    } finally {
      clock.mockRestore();
    }
  });

  it('lets both polling readers observe an external head within one poll interval', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    let now = 0;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const inspections = () => fixture.requests.filter((request) => request.method === 'POST' && request.path.endsWith('/inspect')).length;
    try {
      await provider.loadTimeline(TIMELINE_ID, { poll: true });
      await provider.shotComposition.load({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID, poll: true });
      expect(inspections()).toBe(1);

      fixture.setHead('parent-external', {
        ...compactParentComposition(),
        config: { ...createDefaultTimelineConfig(), customConfig: { external: true } },
      });
      now = 2_000;
      const timeline = await provider.loadTimeline(TIMELINE_ID, { poll: true });
      const composition = await provider.shotComposition.load({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID, poll: true });

      expect(timeline.config.customConfig).toEqual({ external: true });
      expect(composition).toMatchObject({ primary_timeline: { head: { revision_id: 'parent-external' } } });
      expect(inspections()).toBe(2);
    } finally {
      clock.mockRestore();
    }
  });

  it('fetches each pinned shot and internal timeline revision once across repeated loads', async () => {
    const shotId = 'shot-cache';
    const shotRevisionId = 'shot-revision-cache';
    const internalRevisionId = 'timeline-revision-cache';
    const parentComposition = {
      ...compactParentComposition(),
      occurrences: [{
        occurrence_id: 'occ-cache',
        shot_id: shotId,
        shot_revision_id: shotRevisionId,
        at_ms: 0,
        duration_ms: 2000,
      }],
    };
    const fixture = runtimeFixture({ parentComposition });
    const revisionReads: string[] = [];
    const provider = new RuntimeDataProvider({
      projectId: PROJECT_ID,
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      transport: async (method, path, headers, body) => {
        if (method === 'GET' && path === `/v1/projects/${PROJECT_ID}/shots/${shotId}/revisions/${shotRevisionId}`) {
          revisionReads.push(path);
          return { status: 200, headers: {}, body: json({
            project_id: PROJECT_ID,
            shot_id: shotId,
            revision_id: shotRevisionId,
            timeline_id: TIMELINE_ID,
            internal_timeline_revision_id: internalRevisionId,
            content_digest: 'sha256:shot-cache',
            payload: { timing: { duration_ms: 2000 } },
          }) };
        }
        if (method === 'GET' && path === `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/revisions/${internalRevisionId}`) {
          revisionReads.push(path);
          return { status: 200, headers: {}, body: json({
            project_id: PROJECT_ID,
            timeline_id: TIMELINE_ID,
            revision_id: internalRevisionId,
            content_digest: 'sha256:timeline-cache',
            payload: { timeline: { clips: [] } },
          }) };
        }
        return fixture.transport(method, path, headers, body);
      },
    });

    await Promise.all(Array.from({ length: 3 }, () => provider.shotComposition.loadAtHead!({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID, headRevisionId: 'parent-r1' })));
    await provider.shotComposition.loadAtHead!({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID, headRevisionId: 'parent-r1' });

    expect(revisionReads).toEqual([
      `/v1/projects/${PROJECT_ID}/shots/${shotId}/revisions/${shotRevisionId}`,
      `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/revisions/${internalRevisionId}`,
    ]);
  });

  it('reuses an unchanged parent revision payload and fetches a changed head', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });
    const revisionPath = `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/composition-revisions/`;
    const revisionReads = (revisionId: string) => fixture.requests.filter((request) => (
      request.method === 'GET' && request.path === `${revisionPath}${revisionId}`
    )).length;

    await provider.loadTimeline(TIMELINE_ID);
    await provider.loadTimeline(TIMELINE_ID);
    expect(revisionReads('parent-r1')).toBe(1);

    fixture.setHead('parent-r2', {
      ...compactParentComposition(),
      config: { ...createDefaultTimelineConfig(), customConfig: { revision: 2 } },
    });
    await provider.loadTimeline(TIMELINE_ID);
    expect(revisionReads('parent-r2')).toBe(1);
    expect((await provider.loadTimeline(TIMELINE_ID)).config.customConfig).toEqual({ revision: 2 });
    // A fresh explicit read must also move the shared poll head forward.
    expect((await provider.loadTimeline(TIMELINE_ID, { poll: true })).config.customConfig).toEqual({ revision: 2 });
    expect(revisionReads('parent-r2')).toBe(1);
  });

  it('retries an immutable revision read after the in-flight request is rejected', async () => {
    const shotId = 'shot-retry';
    const shotRevisionId = 'shot-revision-retry';
    const internalRevisionId = 'timeline-revision-retry';
    const parentComposition = {
      ...compactParentComposition(),
      occurrences: [{ occurrence_id: 'occ-retry', shot_id: shotId, shot_revision_id: shotRevisionId, at_ms: 0, duration_ms: 2000 }],
    };
    const fixture = runtimeFixture({ parentComposition });
    let shotReads = 0;
    const provider = new RuntimeDataProvider({
      projectId: PROJECT_ID,
      transport: async (method, path, headers, body) => {
        if (method === 'GET' && path.endsWith(`/shots/${shotId}/revisions/${shotRevisionId}`)) {
          shotReads += 1;
          if (shotReads === 1) return { status: 503, headers: {}, body: json({ code: 'unavailable', message: 'try again' }) };
          return { status: 200, headers: {}, body: json({
            project_id: PROJECT_ID, shot_id: shotId, revision_id: shotRevisionId, timeline_id: TIMELINE_ID,
            internal_timeline_revision_id: internalRevisionId, content_digest: 'sha256:retry', payload: { timing: { duration_ms: 2000 } },
          }) };
        }
        if (method === 'GET' && path.endsWith(`/timelines/${TIMELINE_ID}/revisions/${internalRevisionId}`)) {
          return { status: 200, headers: {}, body: json({
            project_id: PROJECT_ID, timeline_id: TIMELINE_ID, revision_id: internalRevisionId,
            content_digest: 'sha256:internal-retry', payload: { timeline: { clips: [] } },
          }) };
        }
        return fixture.transport(method, path, headers, body);
      },
    });

    await expect(provider.shotComposition.loadAtHead!({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID, headRevisionId: 'parent-r1' })).rejects.toThrow();
    await expect(provider.shotComposition.loadAtHead!({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID, headRevisionId: 'parent-r1' })).resolves.toBeDefined();
    expect(shotReads).toBe(2);
  });

  it.each(['empty', 'absent'] as const)('projects top-level compact parent clips with %s config clips through direct and referenced reads', async (shape) => {
    const parent = compactParentComposition();
    const { clips: _clips, ...withoutClips } = parent.config;
    const fixture = runtimeFixture({ parentComposition: { ...parent, config: shape === 'absent' ? withoutClips : parent.config } });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    const loaded = await provider.loadTimeline(TIMELINE_ID);
    const referenced = await provider.loadReferencedTimeline(TIMELINE_ID);
    expect(loaded.config.clips).toEqual(parent.clips);
    expect(referenced.timeline.config).toEqual(loaded.config);
    expect(loaded.config).toMatchObject({ ...withoutClips, clips: parent.clips });
    expect(referenced.registry).toEqual(parent.registry);
    expect(await referenced.resolveAssetUrl('tone.wav')).toContain(encodeURIComponent(parent.registry.assets.tone.media_id));
    expect(fixture.read().parentComposition).toEqual({ ...parent, config: shape === 'absent' ? withoutClips : parent.config });
    expect(fixture.read().parentComposition.occurrences).toEqual([]);
  });

  it.each(['absent', 'empty', 'equal'] as const)('preserves legacy config clips with %s top-level clips', async (shape) => {
    const parent = compactParentComposition();
    const { clips: _clips, ...withoutClips } = parent;
    // Equal dicts remain equal when their JSON member insertion order differs.
    const reversedKeys = parent.clips.map((clip) => Object.fromEntries(Object.entries(clip).reverse()));
    const fixture = runtimeFixture({ parentComposition: {
      ...withoutClips,
      clips: shape === 'absent' ? undefined : shape === 'empty' ? [] : reversedKeys,
      config: { ...parent.config, clips: parent.clips },
    } });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });
    expect((await provider.loadTimeline(TIMELINE_ID)).config.clips).toEqual(parent.clips);
    expect((await provider.loadReferencedTimeline(TIMELINE_ID)).timeline.config.clips).toEqual(parent.clips);
  });

  it('preserves empty legacy timelines', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });
    expect((await provider.loadTimeline(TIMELINE_ID)).config).toEqual(createDefaultTimelineConfig());
  });

  it.each(['edit', 'reorder'] as const)('rejects conflicting non-empty clip lists on %s without publishing', async (conflict) => {
    const parent = compactParentComposition();
    const clips = conflict === 'edit'
      ? parent.clips.map((clip, index) => index === 0 ? { ...clip, at: 1 } : clip)
      : [...parent.clips].reverse();
    const fixture = runtimeFixture({ parentComposition: { ...parent, config: { ...parent.config, clips } } });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });
    await expect(provider.loadTimeline(TIMELINE_ID)).rejects.toThrow('clips disagree');
    await expect(provider.loadReferencedTimeline(TIMELINE_ID)).rejects.toBeInstanceOf(TimelineSchemaIncompatibleError);
    await expect(provider.saveTimelineAtHead(TIMELINE_ID, createDefaultTimelineConfig(), { projectId: PROJECT_ID, timelineId: TIMELINE_ID, headRevisionId: 'parent-r1' })).rejects.toBeInstanceOf(TimelineSchemaIncompatibleError);
    expect(fixture.requests.some((request) => request.path.endsWith('/composition-revisions'))).toBe(false);
  });

  it.each([
    { location: 'parent', value: null }, { location: 'parent', value: {} },
    { location: 'config', value: null }, { location: 'config', value: 'clips' },
  ])('rejects malformed $location clips ($value)', async ({ location, value }) => {
    const parent = compactParentComposition();
    const fixture = runtimeFixture({ parentComposition: location === 'parent'
      ? { ...parent, clips: value }
      : { ...parent, config: { ...parent.config, clips: value } } });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });
    await expect(provider.loadTimeline(TIMELINE_ID)).rejects.toBeInstanceOf(TimelineSchemaIncompatibleError);
    await expect(provider.loadReferencedTimeline(TIMELINE_ID)).rejects.toThrow('clips are invalid');
  });

  it.each(['canonical', 'legacy'] as const)('keeps %s parent clips coherent through edit, partial deletion, complete deletion, and reload', async (shape) => {
    const parent = compactParentComposition();
    const fixture = runtimeFixture({ parentComposition: shape === 'canonical'
      ? parent
      : { ...parent, clips: [], config: { ...parent.config, clips: parent.clips } } });
    const options = { projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport };
    let provider = new RuntimeDataProvider(options);
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const clips = initial.config.clips.map((clip) => clip.id === 'l3-scene' ? { ...clip, at: 0.1, from: 63.1 } : clip);
    for (const nextClips of [clips, clips.filter((clip) => clip.id !== 'l3-label'), []]) {
      const before = await provider.loadTimeline(TIMELINE_ID);
      const savedVersion = await provider.saveTimelineAtHead(TIMELINE_ID, { ...before.config, clips: nextClips }, before.head!, await provider.loadAssetRegistry(TIMELINE_ID));
      const persisted = fixture.read().parentComposition;
      expect(persisted.clips).toEqual(nextClips);
      expect(persisted.config.clips).toEqual(nextClips);
      expect(persisted).toMatchObject({ tracks: parent.tracks, occurrences: [], provenance: parent.provenance, registry: parent.registry });
      const { output: _output, clips: _storedClips, ...otherConfig } = parent.config;
      expect(persisted.config).toMatchObject(otherConfig);
      expect((await provider.loadTimeline(TIMELINE_ID)).configVersion).toBe(savedVersion.configVersion);
      provider = new RuntimeDataProvider(options);
      const reopened = await provider.loadTimeline(TIMELINE_ID);
      expect(reopened.config.clips).toEqual(nextClips);
      // saveTimeline deliberately excludes read-derived output from the wire.
      expect(persisted.config).not.toHaveProperty('output');
      expect((await provider.loadReferencedTimeline(TIMELINE_ID)).timeline.config.clips).toEqual(nextClips);
      expect(await provider.loadAssetRegistry(TIMELINE_ID)).toEqual(parent.registry);
    }
    expect(fixture.read().parentComposition.clips).toEqual([]);
    expect(fixture.read().config.clips).toEqual([]);
    expect(fixture.requests.filter((request) => request.path.endsWith('/composition-revisions'))).toHaveLength(3);
  });

  it('preserves the local draft and performs no writes after a same-realm Runtime restart', async () => {
    vi.stubEnv('VITE_WORKSPACE_RUNTIME_EXPECTED_ACTOR_ID', 'astrid-product-connector');
    vi.stubEnv('VITE_WORKSPACE_RUNTIME_EXPECTED_REALM_ID', 'realm-r1');
    vi.stubEnv('VITE_WORKSPACE_RUNTIME_EXPECTED_INSTANCE_ID', 'runtime-instance-r1');
    try {
      const options = { runtimeInstanceId: 'runtime-instance-r1' };
      const fixture = runtimeFixture(options);
      const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
      const initial = await provider.loadTimeline(TIMELINE_ID);
      const draft = { ...initial.config, clips: [{ id: 'unsaved-local', track: 'track-frame', clipType: 'hold', at: 0, hold: 2 }] };
      const preserved = structuredClone(draft);
      const stored = structuredClone(fixture.read());
      const restartRequestOffset = fixture.requests.length;
      options.runtimeInstanceId = 'replacement-runtime-same-realm';
      await expect(provider.reconnect()).rejects.toThrow('Runtime restarted—relaunch workspace');
      await expect(provider.saveTimelineAtHead(TIMELINE_ID, draft, initial.head!))
        .rejects.toThrow('Runtime restarted—relaunch workspace');
      expect(draft).toEqual(preserved);
      expect(fixture.read()).toEqual(stored);
      expect(fixture.requests.slice(restartRequestOffset).filter(({ method, path }) => method !== 'GET' && path !== '/v1/handshake'))
        .toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('saves the same immutable head after provider recreation with a different numeric counter', async () => {
    const fixture = runtimeFixture();
    const original = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const first = await original.loadTimeline(TIMELINE_ID);
    await original.saveTimelineAtHead(TIMELINE_ID, first.config, first.head!);
    const base = await original.loadTimeline(TIMELINE_ID);
    const restarted = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const fresh = await restarted.loadTimeline(TIMELINE_ID);
    expect(base.configVersion).toBe(2);
    expect(fresh.configVersion).toBe(1);
    expect(fresh.head).toEqual(base.head);
    const edited = { ...base.config, clips: [{ id: 'ordinary-drag', track: 'track-frame', clipType: 'hold', at: 0, hold: 2 }] };
    await expect(restarted.saveTimelineAtHead(TIMELINE_ID, edited, base.head!)).resolves.toMatchObject({ configVersion: 2 });
    expect(fixture.read().config.clips[0]?.track).toBe('track-frame');
  });

  it('atomically publishes edited transcript sources with the expected parent head and reloads them', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const bundle = { schema_version: 1 as const, itemsBySchemaRef: {
      'astrid.transcript_segment/v1': [{
        id: 'source:segment', shape: 'interval' as const, domain: 'source_seconds' as const,
        extent: { start: 1, end: 2 }, schemaRef: 'astrid.transcript_segment/v1',
        sourceArtifactRef: { assetId: 'asset-1', artifactHash: 'content-v2' },
        provenance: { adapterId: 'transcript', adapterVersion: '1' },
        payload: { sourceId: 'source', segmentId: 'segment', text: 'Corrected', speaker: 'Alice', words: [{ id: 'word-1', start: 1, end: 2, text: 'Corrected' }] },
      }],
    } };
    const receipt = await provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!, undefined, bundle);
    const publication = fixture.requests.find((request) => request.method === 'POST' && request.path.endsWith('/composition-revisions'));
    expect(publication?.body).toMatchObject({ expected_head: initial.head!.headRevisionId, parent_composition: { config: { bundle } } });
    const reopened = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const loaded = await reopened.loadTimeline(TIMELINE_ID);
    expect(loaded.head).toEqual(receipt.head);
    expect(loaded.bundle).toEqual(bundle);
  });

  it('preserves the stored bundle when an editor save omits bundle updates', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const bundle = { schema_version: 1 as const, itemsBySchemaRef: {} };
    const first = await provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!, undefined, bundle);
    const next = { ...initial.config, tracks: initial.config.tracks.map((track, index) => index === 0 ? { ...track, label: 'Preserve bundle' } : track) };
    await provider.saveTimelineAtHead(TIMELINE_ID, next, first.head);
    const publications = fixture.requests.filter((request) => request.method === 'POST' && request.path.endsWith('/composition-revisions'));
    const lastPublication = publications[publications.length - 1]?.body as { parent_composition?: { config?: { bundle?: unknown } } } | undefined;
    expect(lastPublication?.parent_composition?.config?.bundle).toEqual(bundle);
  });

  it('publishes one reconciled parent clip list while preserving authored edits and metadata', async () => {
    const initialClips = [
      {
        id: 'frame',
        at: 0,
        track: 'frame',
        clipType: 'media' as const,
        app: { extensionOwned: { keep: true } },
      },
      {
        id: 'fx',
        at: 1,
        track: 'fx',
        clipType: 'effect' as const,
        params: { amount: 0.5 },
      },
    ];
    const fixture = runtimeFixture({ initialClips });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const edited = {
      ...initial.config,
      // This order/content is the editor-authored candidate. The canonical
      // top-level list remains in its original order in the base revision.
      clips: [
        { ...initial.config.clips[1]!, label: 'Edited FX' },
        { ...initial.config.clips[0]!, track: 'frame-top' },
      ],
    };

    await provider.saveTimelineAtHead(TIMELINE_ID, edited, initial.head!);

    const publication = fixture.requests.find((request) => (
      request.method === 'POST' && request.path.endsWith('/composition-revisions')
    ));
    const parent = publication?.body as {
      parent_composition?: { clips?: unknown; config?: { clips?: unknown } };
    } | undefined;
    expect(parent?.parent_composition?.clips).toEqual(parent?.parent_composition?.config?.clips);
    expect(parent?.parent_composition?.clips).toEqual(edited.clips);
    expect((parent?.parent_composition?.clips as Array<{ app?: unknown }>)[1]?.app).toEqual({
      extensionOwned: { keep: true },
    });
  });

  it('fails closed when the canonical base has contradictory clip copies', async () => {
    const fixture = runtimeFixture({
      initialClips: [{ id: 'canonical', at: 0, track: 'V1', clipType: 'media' }],
    });
    const transport: typeof fixture.transport = async (...args) => {
      const response = await fixture.transport(...args);
      if (args[0] === 'GET' && args[1].endsWith('/composition-revisions/parent-r1')) {
        const payload = JSON.parse(new TextDecoder().decode(response.body)) as { payload: { config: { clips: unknown[] } } };
        payload.payload.config.clips = [{ id: 'different', at: 0, track: 'V1', clipType: 'media' }];
        return { ...response, body: json(payload) };
      }
      return response;
    };
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    // A corrupt immutable base is refused at read as well as at publication.
    // No successful load/head can be obtained from contradictory authorities.
    await expect(provider.loadTimeline(TIMELINE_ID)).rejects.toMatchObject({
      code: 'schema_incompatible',
    });
    await expect(provider.saveTimelineAtHead(TIMELINE_ID, createDefaultTimelineConfig(), {
      projectId: PROJECT_ID, timelineId: TIMELINE_ID, headRevisionId: 'parent-r1',
    })).rejects.toMatchObject({
      code: 'schema_incompatible',
    });
    expect(fixture.requests.filter((request) => (
      request.method === 'POST' && request.path.endsWith('/composition-revisions')
    ))).toHaveLength(0);
  });

  it('classifies the Runtime canonical payload conflict as terminal instead of retryable', async () => {
    const fixture = runtimeFixture();
    const transport: typeof fixture.transport = async (...args) => {
      if (args[0] === 'POST' && args[1].endsWith('/composition-revisions')) {
        return {
          status: 409,
          headers: {},
          body: json({ code: 'conflict', message: 'canonical parent clips and config.clips disagree', request_id: 'req-canonical', details: { reason: 'canonical_payload_mismatch' } }),
        };
      }
      return fixture.transport(...args);
    };
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);

    await expect(provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!)).rejects.toMatchObject({
      code: 'schema_incompatible',
      issues: [expect.objectContaining({ code: 'canonical_duplicate_mismatch' })],
    });
  });

  it('classifies deterministic Runtime validation rejections as terminal instead of transport retries', async () => {
    const fixture = runtimeFixture();
    const transport: typeof fixture.transport = async (...args) => {
      if (args[0] === 'POST' && args[1].endsWith('/composition-revisions')) {
        return {
          status: 422,
          headers: {},
          body: json({ code: 'validation_error', message: 'visual seam admission blocked' }),
        };
      }
      return fixture.transport(...args);
    };
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);

    await expect(provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!)).rejects.toMatchObject({
      code: 'schema_incompatible',
      issues: [expect.objectContaining({ code: 'validation_error', message: expect.stringContaining('visual seam admission blocked') })],
    });
  });

  it('rejects different heads with equal numeric counters even after polling a newer head', async () => {
    const fixture = runtimeFixture();
    const stale = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const base = await stale.loadTimeline(TIMELINE_ID);
    await stale.saveTimelineAtHead(TIMELINE_ID, base.config, base.head!);
    const restarted = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const fresh = await restarted.loadTimeline(TIMELINE_ID);
    expect(fresh.configVersion).toBe(base.configVersion);
    expect(fresh.head).not.toEqual(base.head);
    const edited = { ...base.config, clips: [{ id: 'stale', track: 'V1', clipType: 'hold', at: 0, hold: 2 }] };
    await expect(restarted.saveTimelineAtHead(TIMELINE_ID, edited, base.head!)).rejects.toMatchObject({ code: 'timeline_version_conflict' });
    expect(fixture.read().config.clips).toEqual([]);
    expect(fixture.read().documentVersion).toBe(2);
  });

  it('protects a concurrent publication between the editor read and Runtime CAS', async () => {
    const fixture = runtimeFixture();
    const remote = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    let intervene = true;
    const transport: typeof fixture.transport = async (...args) => {
      if (intervene && args[0] === 'POST' && args[1].endsWith('/composition-revisions')) {
        intervene = false;
        const base = await remote.loadTimeline(TIMELINE_ID);
        await remote.saveTimelineAtHead(TIMELINE_ID, { ...base.config, clips: [{ id: 'remote', track: 'V1', clipType: 'hold', at: 0, hold: 1 }] }, base.head!);
      }
      return fixture.transport(...args);
    };
    const local = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const base = await local.loadTimeline(TIMELINE_ID);
    await expect(local.saveTimelineAtHead(TIMELINE_ID, base.config, base.head!)).rejects.toMatchObject({ code: 'timeline_version_conflict' });
    expect(fixture.read().config.clips[0]?.id).toBe('remote');
    expect(fixture.read().documentVersion).toBe(2);
  });

  it('fails closed for numeric-only saves and heads from another project or timeline', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const base = await provider.loadTimeline(TIMELINE_ID);
    await expect(provider.saveTimeline(TIMELINE_ID, base.config, base.configVersion)).rejects.toMatchObject({ code: 'timeline_version_conflict' });
    for (const head of [{ ...base.head!, projectId: 'another' }, { ...base.head!, timelineId: 'another' }]) {
      await expect(provider.saveTimelineAtHead(TIMELINE_ID, base.config, head)).rejects.toMatchObject({ code: 'timeline_version_conflict' });
    }
    expect(fixture.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/composition-revisions'))).toHaveLength(0);
  });

  it('replays a lost acknowledgement after provider restart with the original head, payload and key', async () => {
    const fixture = runtimeFixture();
    let loseAck = true;
    const transport: typeof fixture.transport = async (...args) => {
      const response = await fixture.transport(...args);
      if (loseAck && args[0] === 'POST' && args[1].endsWith('/composition-revisions')) {
        loseAck = false;
        throw new Error('lost acknowledgement');
      }
      return response;
    };
    const original = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const base = await original.loadTimeline(TIMELINE_ID);
    await expect(original.saveTimelineAtHead(TIMELINE_ID, base.config, base.head!)).rejects.toThrow('lost acknowledgement');
    const restarted = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    await expect(restarted.saveTimelineAtHead(TIMELINE_ID, base.config, base.head!)).resolves.toHaveProperty('head');
    const publications = fixture.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/composition-revisions'));
    expect(publications).toHaveLength(2);
    expect(publications[1].body).toEqual(publications[0].body);
    expect(publications[1].headers['Idempotency-Key']).toBe(publications[0].headers['Idempotency-Key']);
    expect(fixture.read().documentVersion).toBe(2);
  });

  it('loads project-scoped canonical revisions and restores through a current-head CAS', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });

    const history = await provider.shotComposition.listHistory!({
      projectId: PROJECT_ID,
      parentDocumentId: TIMELINE_ID,
    });
    expect(history.map((entry) => entry.revisionId)).toEqual(['parent-r1', 'parent-old']);

    const restored = await provider.shotComposition.restoreHistory!({
      projectId: PROJECT_ID,
      parentDocumentId: TIMELINE_ID,
      revisionId: 'parent-old',
    });
    expect(restored.newHead).toBe('restore-parent-old');
    expect(fixture.requests.some((request) => request.method === 'POST'
      && request.path.endsWith('/composition-revisions/parent-old/restore')
      && request.body?.expected_head === 'parent-r1')).toBe(true);
    expect(fixture.requests.some((request) => request.method === 'GET'
      && request.path.endsWith('/composition-revisions/restore-parent-old'))).toBe(true);
  });

  it('serializes canonical placement start after stale nested placement metadata', async () => {
    const publication = await toRuntimePublication({
      primary_timeline: { head: { revision_id: 'head-1' } },
      shot_revisions: [{
        shot_id: 'shot-placement',
        revision_id: 'revision-placement',
        publish: true,
        internal_timeline_revision: {
          timeline_id: TIMELINE_ID,
          revision_id: 'timeline-placement',
          publish: true,
          timeline: { tracks: [{ id: 'video', kind: 'visual' }], clips: [{ id: 'clip', at_ms: 0, duration_ms: 2000 }] },
        },
      }],
      occurrences: [{
        occurrence_id: 'occ-placement',
        shot_id: 'shot-placement',
        revision_id: 'revision-placement',
        at_ms: 1500,
        duration_ms: 2000,
        placement: { start_ms: 0, track: 'video' },
      }],
      parent_composition: { config: {}, registry: {}, clips: [] },
    }, PROJECT_ID, TIMELINE_ID, 'head-1');

    expect((publication.parent_composition as Record<string, unknown>).occurrences).toEqual([
      expect.objectContaining({
        occurrence_id: 'occ-placement',
        placement: { start_ms: 1500, track: 'video' },
      }),
    ]);
  });

  it('loads the lightbox primary from the complete paginated variant set', async () => {
    const requests: string[] = [];
    const transport = async (method: string, path: string) => {
      requests.push(`${method} ${path}`);
      if (path === '/v1/health') {
        return { status: 200, headers: {}, body: json({ status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, runtime_epoch: 1, runtime_instance_id: 'runtime-instance-lightbox' }) };
      }
      if (path === '/v1/handshake') {
        return { status: 200, headers: {}, body: json({ protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, session_id: 'session-lightbox', actor_id: 'astrid-product-connector', realm_id: 'realm-r1', scopes: RUNTIME_CLIENT_SCOPES, capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY] }) };
      }
      if (path === '/v1/realm') {
        return { status: 200, headers: {}, body: json({ realm_id: 'realm-r1', display_name: 'R1 fixture', version: 1, created_at: '2026-09-11T00:00:00Z' }) };
      }
      if (path === '/v1/generations/generation-lightbox') {
        return {
          status: 200,
          headers: {},
          body: json({
            generation_id: 'generation-lightbox',
            project_id: PROJECT_ID,
            type: 'image',
            status: 'succeeded',
            metadata: {},
            version: 1,
            created_at: '2026-09-11T00:00:00Z',
            updated_at: '2026-09-11T00:00:00Z',
          }),
        };
      }
      if (path === '/v1/generations/generation-lightbox/variants?limit=200') {
        return {
          status: 200,
          headers: {},
          body: json({
            items: [{
              variant_id: 'variant-first',
              generation_id: 'generation-lightbox',
              object_id: `sha256:${'a'.repeat(64)}`,
              variant_type: 'original',
              metadata: {},
              created_at: '2026-09-11T00:00:00Z',
            }],
            next_cursor: 'variants-page-2',
          }),
        };
      }
      if (path === '/v1/generations/generation-lightbox/variants?limit=200&cursor=variants-page-2') {
        return {
          status: 200,
          headers: {},
          body: json({
            items: [{
              variant_id: 'variant-primary',
              generation_id: 'generation-lightbox',
              object_id: `sha256:${'b'.repeat(64)}`,
              variant_type: 'edit',
              metadata: { is_primary: true, media_type: 'image/jpeg' },
              created_at: '2026-09-11T00:00:00Z',
            }],
            next_cursor: null,
          }),
        };
      }
      throw new Error(`unexpected ${method} ${path}`);
    };

    const provider = new RuntimeDataProvider({
      projectId: PROJECT_ID,
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      transport,
    });

    const loaded = await provider.loadGenerationForLightbox('generation-lightbox');
    expect(loaded).toMatchObject({
      primary_variant_id: 'variant-primary',
      media_id: `sha256:${'b'.repeat(64)}`,
      type: 'image/jpeg',
    });
    expect(loaded).not.toHaveProperty('thumbUrl');
    expect(requests).toContain('GET /v1/generations/generation-lightbox/variants?limit=200&cursor=variants-page-2');
  });

  it('uses the authenticated generated client for canonical read/save/readback/reload', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    expect(provider.refreshIntervalMs).toBe(6_000);
    const initial = await provider.loadTimeline(TIMELINE_ID);
    expect(initial.configVersion).toBe(1);
    const edited = { ...initial.config, tracks: initial.config.tracks.map((track, index) => index === 0 ? { ...track, label: 'Edited V1' } : track) };
    const savedVersion = await provider.saveTimelineAtHead(TIMELINE_ID, edited, initial.head!, await provider.loadAssetRegistry(TIMELINE_ID));
    const readback = await provider.loadTimeline(TIMELINE_ID);
    const reloaded = await provider.loadTimeline(TIMELINE_ID);

    expect(savedVersion.configVersion).toBe(2);
    expect(readback.config.tracks[0]?.label).toBe('Edited V1');
    expect(reloaded.config.tracks[0]?.label).toBe('Edited V1');
    expect(reloaded.configVersion).toBe(2);
    expect(fixture.read().documentVersion).toBe(2);
    expect(fixture.read().config.tracks[0]?.label).toBe('Edited V1');
    expect(fixture.requests.filter((request) => request.path !== '/v1/health').every((request) => request.headers.Authorization === 'Bearer fixture-token')).toBe(true);
  });

  it('does not let a delayed registry read overwrite a later save receipt', async () => {
    const fixture = runtimeFixture();
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let delayRead = false;
    const transport: typeof fixture.transport = async (...args) => {
      const response = await fixture.transport(...args);
      if (delayRead && args[0] === 'GET' && args[1].includes('/composition-revisions/')) {
        delayRead = false;
        entered();
        await held;
      }
      return response;
    };
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    // Move the head so the registry load fetches a revision instead of reusing the cached one.
    const movedHead = { ...initial.head!, headRevisionId: 'parent-r2' };
    fixture.setHead(movedHead.headRevisionId, fixture.read().parentComposition);
    delayRead = true;
    const registryRead = provider.loadAssetRegistry(TIMELINE_ID);
    await started;
    const save = provider.saveTimelineAtHead(TIMELINE_ID, initial.config, movedHead);
    // Give an unguarded save time to commit while the old read is suspended.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The old immutable response must finish before publication can advance state.
    release();
    await registryRead;
    const version = await save;
    expect(version.configVersion).toBe(3);
    expect((await provider.saveTimelineAtHead(TIMELINE_ID, initial.config, version.head)).configVersion).toBe(4);
    expect((await provider.loadTimeline(TIMELINE_ID)).configVersion).toBe(4);
  });

  it('keeps polling own publications behind their acknowledgement without inventing a version', async () => {
    const fixture = runtimeFixture();
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const transport: typeof fixture.transport = async (...args) => {
      const response = await fixture.transport(...args);
      if (args[0] === 'POST' && args[1].endsWith('/composition-revisions')) {
        entered();
        await held;
      }
      return response;
    };
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const save = provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!);
    await started;
    const readsBefore = fixture.requests.filter((r) => r.path.endsWith('/inspect')).length;
    const poll = provider.loadTimeline(TIMELINE_ID);
    const registryPoll = provider.loadAssetRegistry(TIMELINE_ID);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fixture.requests.filter((r) => r.path.endsWith('/inspect'))).toHaveLength(readsBefore);
    release();
    expect((await save).configVersion).toBe(2);
    expect((await poll).configVersion).toBe(2);
    await registryPoll;
    expect((await provider.loadTimeline(TIMELINE_ID)).configVersion).toBe(2);
  });

  it('rejects overlapping stale saves and releases the queue after a rejection', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const first = provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!);
    const second = provider.saveTimelineAtHead(TIMELINE_ID, { ...initial.config, clips: [{ id: 'stale', track: 'V1', clipType: 'hold', at: 0, hold: 1 }] }, initial.head!);
    const rejected = expect(second).rejects.toMatchObject({ code: 'timeline_version_conflict' });
    expect((await first).configVersion).toBe(2);
    await rejected;
    expect(fixture.requests.filter((r) => r.path.endsWith('/composition-revisions'))).toHaveLength(2);
    const reloaded = await provider.loadTimeline(TIMELINE_ID);
    expect(reloaded.configVersion).toBe(2);
    expect((await provider.saveTimelineAtHead(TIMELINE_ID, initial.config, reloaded.head!)).configVersion).toBe(3);
  });

  it('still rejects a genuine external publication without overwriting it', async () => {
    const fixture = runtimeFixture();
    const local = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const remote = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const initial = await local.loadTimeline(TIMELINE_ID);
    const other = await remote.loadTimeline(TIMELINE_ID);
    const remoteConfig = { ...other.config, tracks: other.config.tracks.map((t) => ({ ...t, label: 'Remote edit' })) };
    await remote.saveTimelineAtHead(TIMELINE_ID, remoteConfig, other.head!);
    await expect(local.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!))
      .rejects.toMatchObject({ code: 'timeline_version_conflict' });
    expect(fixture.read().config.tracks[0]?.label).toBe('Remote edit');
    expect((await local.loadTimeline(TIMELINE_ID)).configVersion).toBe(2);
  });

  it('recovers a lost save acknowledgement after polling through the original idempotency receipt', async () => {
    const fixture = runtimeFixture();
    let loseAck = true;
    const transport: typeof fixture.transport = async (...args) => {
      const response = await fixture.transport(...args);
      if (loseAck && args[0] === 'POST' && args[1].endsWith('/composition-revisions')) {
        loseAck = false;
        throw new Error('response lost after commit');
      }
      return response;
    };
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    await expect(provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!)).rejects.toThrow('response lost');
    expect((await provider.loadTimeline(TIMELINE_ID)).configVersion).toBe(2);
    const changed = { ...initial.config, tracks: initial.config.tracks.map((t) => ({ ...t, label: 'Unsent edit' })) };
    await expect(provider.saveTimelineAtHead(TIMELINE_ID, changed, initial.head!)).rejects.toMatchObject({ code: 'timeline_version_conflict' });
    const replay = await provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!);
    expect(replay.configVersion).toBe(2);
    const requests = fixture.requests.filter((r) => r.path.endsWith('/composition-revisions'));
    expect(requests).toHaveLength(2);
    expect(requests[1].body).toEqual(requests[0].body);
    expect(requests[1].headers['Idempotency-Key']).toBe(requests[0].headers['Idempotency-Key']);
    expect(fixture.read().documentVersion).toBe(2);
    expect((await provider.saveTimelineAtHead(TIMELINE_ID, changed, replay.head)).configVersion).toBe(3);
  });

  it('allows a fresh edit based on an explicitly reloaded head after an ambiguous save', async () => {
    const fixture = runtimeFixture();
    let loseAck = true;
    const transport: typeof fixture.transport = async (...args) => {
      const response = await fixture.transport(...args);
      if (loseAck && args[0] === 'POST' && args[1].endsWith('/composition-revisions')) {
        loseAck = false;
        throw new Error('response lost after commit');
      }
      return response;
    };
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    await expect(provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!)).rejects.toThrow('response lost');
    const reloaded = await provider.loadTimeline(TIMELINE_ID);
    const changed = { ...reloaded.config, tracks: reloaded.config.tracks.map((t) => ({ ...t, label: 'After reload' })) };
    expect((await provider.saveTimelineAtHead(TIMELINE_ID, changed, reloaded.head!)).configVersion).toBe(3);
    expect(fixture.read().config.tracks[0]?.label).toBe('After reload');
  });

  it('does not use an old receipt to overwrite a newer remote head', async () => {
    const fixture = runtimeFixture();
    let loseAck = true;
    const transport: typeof fixture.transport = async (...args) => {
      const response = await fixture.transport(...args);
      if (loseAck && args[0] === 'POST' && args[1].endsWith('/composition-revisions')) {
        loseAck = false;
        throw new Error('response lost after commit');
      }
      return response;
    };
    const local = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const initial = await local.loadTimeline(TIMELINE_ID);
    await expect(local.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!)).rejects.toThrow('response lost');
    const remote = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const other = await remote.loadTimeline(TIMELINE_ID);
    const config = { ...other.config, tracks: other.config.tracks.map((t) => ({ ...t, label: 'Remote after lost ack' })) };
    await remote.saveTimelineAtHead(TIMELINE_ID, config, other.head!);
    const latest = await local.loadTimeline(TIMELINE_ID);
    await expect(local.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!)).rejects.toMatchObject({ code: 'timeline_version_conflict' });
    expect(fixture.read().documentVersion).toBe(3);
    expect((await local.loadTimeline(TIMELINE_ID)).configVersion).toBe(latest.configVersion);
    expect(fixture.read().config.tracks[0]?.label).toBe('Remote after lost ack');
  });

  it('registers simultaneous assets atomically without losing either registry entry', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    await Promise.all([
      provider.registerAsset(TIMELINE_ID, 'one', { type: 'image', file: 'one.png' }),
      provider.registerAsset(TIMELINE_ID, 'two', { type: 'image', file: 'two.png' }),
    ]);
    expect(Object.keys((await provider.loadAssetRegistry(TIMELINE_ID)).assets)).toEqual(['one', 'two']);
    expect(fixture.read().documentVersion).toBe(3);
  });

  it('retains a managed object identity/provenance through upload and explicit timeline placement', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    const uploaded = await provider.uploadAsset(
      new File(['managed creative'], 'managed-creative.mp4', { type: 'video/mp4' }),
      { timelineId: TIMELINE_ID, userId: 'owner-r3' },
    );
    expect(uploaded).toMatchObject({
      assetId: MANAGED_OBJECT_ID,
      entry: {
        file: MANAGED_OBJECT_URL,
        type: 'video/mp4',
        media_id: MANAGED_OBJECT_ID,
        content_sha256: MANAGED_OBJECT_DIGEST,
        metadata: {
          provenance: {
            sourceProvider: 'workspace-runtime',
            importedBy: 'owner-r3',
            originalFilename: 'managed-creative.mp4',
          },
        },
      },
    });
    expect(await provider.resolveAssetUrl(uploaded.assetId))
      .toBe(MANAGED_OBJECT_URL);

    const afterUpload = await provider.loadTimeline(TIMELINE_ID);
    const registry = await provider.loadAssetRegistry(TIMELINE_ID);
    const placedConfig = {
      ...afterUpload.config,
      clips: [{
        id: 'clip-r3-managed',
        at: 4,
        track: 'V1',
        asset: uploaded.assetId,
        from: 0,
        to: 2,
      }],
    };
    const placedVersion = await provider.saveTimelineAtHead(
      TIMELINE_ID,
      placedConfig,
      afterUpload.head!,
      registry,
    );
    const persisted = await provider.loadTimeline(TIMELINE_ID);
    const persistedRegistry = await provider.loadAssetRegistry(TIMELINE_ID);

    expect(placedVersion.configVersion).toBe(3);
    expect(persisted.config.clips[0]).toMatchObject({
      id: 'clip-r3-managed',
      asset: MANAGED_OBJECT_ID,
      at: 4,
    });
    expect(persistedRegistry.assets[MANAGED_OBJECT_ID]).toMatchObject({
      media_id: MANAGED_OBJECT_ID,
      content_sha256: MANAGED_OBJECT_DIGEST,
      file: MANAGED_OBJECT_ROUTE,
      metadata: {
        provenance: {
          sourceProvider: 'workspace-runtime',
          importedBy: 'owner-r3',
          originalFilename: 'managed-creative.mp4',
        },
      },
    });
    expect(fixture.requests.filter((request) => request.method === 'POST' && request.path.endsWith('/media-imports')))
      .toHaveLength(1);
    expect(fixture.requests.filter((request) => (
      request.method === 'POST' && /^\/v1\/projects\/[^/]+\/objects$/.test(request.path)
    ))).toHaveLength(0);
  });

  it('publishes an uploaded object by its route, not by the URL the editor first saw it at, and still plays it', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });
    const uploaded = await provider.uploadAsset(new File(['managed creative'], 'managed-creative.mp4', { type: 'video/mp4' }), { timelineId: TIMELINE_ID, userId: 'owner-r3' });
    // The editor holds the absolute URL (a playable locator before any readback); the Runtime refuses that as an unmanaged locator when it freezes a render.
    expect(uploaded.entry.file).toBe(MANAGED_OBJECT_URL);
    const loaded = await provider.loadTimeline(TIMELINE_ID);
    const foreign = { type: 'image/png', file: 'https://cdn.example.test/elsewhere.png', media_id: 'sha256:' + 'b'.repeat(64) };
    // Another origin's `/v1/objects/<media_id>` has the route's shape and names the entry's own media, and is still not this Runtime's object.
    const foreignRoute = { type: 'image/png', file: `https://cdn.example.test/v1/objects/${'c'.repeat(64)}`, media_id: 'c'.repeat(64) };
    const foreignLoopback = { type: 'image/png', file: `http://127.0.0.1:1234/v1/objects/${'d'.repeat(64)}`, media_id: 'd'.repeat(64) };
    await provider.saveTimelineAtHead(TIMELINE_ID, loaded.config, loaded.head!, {
      assets: { [uploaded.assetId]: uploaded.entry, foreign, foreignRoute, foreignLoopback },
    });

    const published = fixture.read().parentComposition.registry as { assets: Record<string, { file?: string }> };
    expect(published.assets[uploaded.assetId].file).toBe(MANAGED_OBJECT_ROUTE);
    // A locator that is not this entry's own object is left alone for the Runtime to refuse, never rewritten to look managed.
    expect(published.assets.foreign.file).toBe('https://cdn.example.test/elsewhere.png');
    expect(published.assets.foreignRoute.file).toBe(foreignRoute.file);
    expect(published.assets.foreignLoopback.file).toBe(foreignLoopback.file);
    // The route names its object by itself: it plays, with or without a registry readback.
    expect(await provider.resolveAssetUrl(MANAGED_OBJECT_ROUTE)).toBe(MANAGED_OBJECT_URL);
    expect(await new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport }).resolveAssetUrl(MANAGED_OBJECT_ROUTE)).toBe(MANAGED_OBJECT_URL);
  });

  it('round-trips package and entry identities through Runtime reload with stale-write rejection', async () => {
    const objectReadOverrides = new Map<string, Uint8Array>();
    const fixture = runtimeFixture({ objectReadOverrides });
    const staleProvider = new RuntimeDataProvider({
      projectId: PROJECT_ID,
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      transport: fixture.transport,
    });
    const staleInitial = await staleProvider.loadTimeline(TIMELINE_ID);
    const staleRegistry = await staleProvider.loadAssetRegistry(TIMELINE_ID);

    const provider = new RuntimeDataProvider({
      projectId: PROJECT_ID,
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      transport: fixture.transport,
    });
    const initialSourceBytes = new TextEncoder().encode(
      '<!doctype html><html><body><script>document.body.dataset.scene="initial";</script></body></html>',
    );
    const uploaded = await provider.projectObjects.ingest(initialSourceBytes, 'text/html', 'scene.html');
    const initialReadback = await provider.projectObjects.read(uploaded.object_id);
    expect(Array.from(initialReadback)).toEqual(Array.from(initialSourceBytes));
    expect(await sha256Digest(initialReadback)).toBe(uploaded.digest);
    const initialManifest = { formatVersion: 1, entry: 'scene.html', duration: 100, authoredFps: 30 };
    const initialPackagePayload = { manifest: initialManifest, entry: uploaded, assets: [] };
    const initialPackageBytes = packageBodyBytes(initialManifest, uploaded);
    const initialPackageObject = await provider.projectObjects.ingest(
      initialPackageBytes,
      'application/json',
      'scene.package.json',
    );
    const initialPackageReadback = await provider.projectObjects.read(initialPackageObject.object_id);
    expect(Array.from(initialPackageReadback)).toEqual(Array.from(initialPackageBytes));
    expect(await sha256Digest(initialPackageReadback)).toBe(initialPackageObject.digest);
    expect(initialPackageObject.object_id).not.toBe(uploaded.object_id);
    expect(initialPackageObject.digest).not.toBe(uploaded.digest);
    const initialPackageBody = new TextDecoder().decode(initialPackageReadback);
    expect(JSON.parse(initialPackageBody)).toEqual(initialPackagePayload);
    expect(fixture.requests.filter((request) => request.path.includes('/objects')).map((request) => request.method))
      .toEqual(['POST', 'GET', 'GET', 'POST', 'GET', 'GET']);

    const initialLiveScene = {
      revision: initialPackageObject.digest,
      source: { objectId: initialPackageObject.object_id, revision: initialPackageObject.digest },
      packageBody: initialPackageBody,
      html: new TextDecoder().decode(initialReadback),
    };
    const afterInitialIngest = await provider.loadTimeline(TIMELINE_ID);
    const initialRegistry = await provider.loadAssetRegistry(TIMELINE_ID);
    const initialConfig = {
      ...afterInitialIngest.config,
      clips: [
        {
          id: 'scene-a',
          at: 2,
          track: 'V1',
          clipType: 'haus.astrid.liveScene',
          label: 'scene A sentinel',
          from: 55,
          to: 75,
          speed: 1,
          app: { liveScene: initialLiveScene, unrelated: { sentinel: 'keep-scene-a' } },
        },
        {
          id: 'scene-b',
          at: 22,
          track: 'V1',
          clipType: 'haus.astrid.liveScene',
          label: 'scene B sentinel',
          from: 20,
          to: 30,
          speed: 2,
          app: { liveScene: initialLiveScene, unrelated: { sentinel: 'keep-scene-b' } },
        },
      ],
    };
    const initialSavedVersion = await provider.saveTimelineAtHead(
      TIMELINE_ID,
      initialConfig,
      afterInitialIngest.head!,
      initialRegistry,
    );

    const winningSourceBytes = new TextEncoder().encode(
      '<!doctype html><html><body><script>document.body.dataset.scene="winning";</script></body></html>',
    );
    const winningObject = await provider.projectObjects.ingest(winningSourceBytes, 'text/html', 'scene.html');
    const winningReadback = await provider.projectObjects.read(winningObject.object_id);
    expect(Array.from(winningReadback)).toEqual(Array.from(winningSourceBytes));
    expect(await sha256Digest(winningReadback)).toBe(winningObject.digest);
    const winningManifest = { ...initialManifest, duration: 120, title: 'winning manifest' };
    const winningPackagePayload = { manifest: winningManifest, entry: winningObject, assets: [] };
    const winningPackageBytes = packageBodyBytes(winningManifest, winningObject);
    const winningPackageObject = await provider.projectObjects.ingest(
      winningPackageBytes,
      'application/json',
      'scene.package.json',
    );
    const winningPackageReadback = await provider.projectObjects.read(winningPackageObject.object_id);
    expect(Array.from(winningPackageReadback)).toEqual(Array.from(winningPackageBytes));
    expect(await sha256Digest(winningPackageReadback)).toBe(winningPackageObject.digest);
    expect(winningPackageObject.object_id).not.toBe(winningObject.object_id);
    expect(winningPackageObject.digest).not.toBe(winningObject.digest);
    expect(winningPackageObject.digest).not.toBe(initialPackageObject.digest);
    const winningPackageBody = new TextDecoder().decode(winningPackageReadback);
    expect(JSON.parse(winningPackageBody)).toEqual(winningPackagePayload);

    const manifestOnlyPackageBody = {
      manifest: { ...winningManifest, title: 'manifest-only revision' },
      entry: winningObject,
      assets: [],
    };
    const manifestOnlyPackageBytes = packageBodyBytes(
      manifestOnlyPackageBody.manifest,
      manifestOnlyPackageBody.entry,
      manifestOnlyPackageBody.assets,
    );
    const manifestOnlyPackageObject = await provider.projectObjects.ingest(
      manifestOnlyPackageBytes,
      'application/json',
      'scene.package.json',
    );
    const manifestOnlyPackageReadback = await provider.projectObjects.read(manifestOnlyPackageObject.object_id);
    expect(Array.from(manifestOnlyPackageReadback)).toEqual(Array.from(manifestOnlyPackageBytes));
    expect(await sha256Digest(manifestOnlyPackageReadback)).toBe(manifestOnlyPackageObject.digest);
    expect(manifestOnlyPackageObject.digest).not.toBe(winningPackageObject.digest);
    expect(manifestOnlyPackageBody.entry).toEqual(winningPackagePayload.entry);
    expect(manifestOnlyPackageBody.assets).toEqual(winningPackagePayload.assets);

    const winningLiveScene = {
      revision: winningPackageObject.digest,
      source: { objectId: winningPackageObject.object_id, revision: winningPackageObject.digest },
      packageBody: winningPackageBody,
      html: new TextDecoder().decode(winningReadback),
    };
    expect(winningLiveScene.html).toBe(new TextDecoder().decode(winningSourceBytes));
    const winningConfig = {
      ...initialConfig,
      clips: initialConfig.clips.map((clip) => ({
        ...clip,
        app: { ...clip.app, liveScene: winningLiveScene },
      })),
    };
    const winningVersion = await provider.saveTimelineAtHead(
      TIMELINE_ID,
      winningConfig,
      initialSavedVersion.head,
      await provider.loadAssetRegistry(TIMELINE_ID),
    );

    await expect(staleProvider.saveTimelineAtHead(
      TIMELINE_ID,
      { ...staleInitial.config, clips: [] },
      staleInitial.head!,
      staleRegistry,
    )).rejects.toBeInstanceOf(TimelineVersionConflictError);

    const reloadedProvider = new RuntimeDataProvider({
      projectId: PROJECT_ID,
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      transport: fixture.transport,
    });
    const reopened = await reloadedProvider.loadTimeline(TIMELINE_ID);
    const reopenedRegistry = await reloadedProvider.loadAssetRegistry(TIMELINE_ID);
    const reopenedData = await buildTimelineData(reopened.config, reopenedRegistry);
    const clips = createTimelineReader({ data: reopenedData }).snapshot().clips;
    expect(winningVersion.configVersion).toBe(3);
    expect(reopened.config.clips[0]?.app?.liveScene).toEqual({
      revision: winningPackageObject.digest,
      html: new TextDecoder().decode(winningSourceBytes),
      source: { objectId: winningPackageObject.object_id, revision: winningPackageObject.digest },
      packageBody: winningPackageBody,
    });
    expect(reopened.config.clips.map((clip) => ({
      id: clip.id,
      at: clip.at,
      from: clip.from,
      to: clip.to,
      speed: clip.speed,
      label: clip.label,
      unrelated: clip.app?.unrelated,
    }))).toEqual([
      {
        id: 'scene-a',
        at: 2,
        from: 55,
        to: 75,
        speed: 1,
        label: 'scene A sentinel',
        unrelated: { sentinel: 'keep-scene-a' },
      },
      {
        id: 'scene-b',
        at: 22,
        from: 20,
        to: 30,
        speed: 2,
        label: 'scene B sentinel',
        unrelated: { sentinel: 'keep-scene-b' },
      },
    ]);
    expect(clips.map((clip) => ({
      id: clip.id,
      at: clip.at,
      sourceOffset: clip.sourceOffset,
      sourceEnd: clip.sourceEnd,
      rate: clip.rate,
      source: clip.sourceRefs?.find((ref) => ref.sourceObjectId),
    }))).toEqual([
      {
        id: 'scene-a',
        at: 2,
        sourceOffset: 55,
        sourceEnd: 75,
        rate: 1,
        source: expect.objectContaining({
          sourceObjectId: winningPackageObject.object_id,
          sourceRevision: winningPackageObject.digest,
          packageRevision: winningPackageObject.digest,
        }),
      },
      {
        id: 'scene-b',
        at: 22,
        sourceOffset: 20,
        sourceEnd: 30,
        rate: 2,
        source: expect.objectContaining({
          sourceObjectId: winningPackageObject.object_id,
          sourceRevision: winningPackageObject.digest,
          packageRevision: winningPackageObject.digest,
        }),
      },
    ]);
    const reopenedPackageBytes = await reloadedProvider.projectObjects.read(winningPackageObject.object_id);
    expect(Array.from(reopenedPackageBytes)).toEqual(Array.from(winningPackageBytes));
    expect(await sha256Digest(reopenedPackageBytes)).toBe(winningPackageObject.digest);
    const reopenedPackagePayload = JSON.parse(new TextDecoder().decode(reopenedPackageBytes)) as {
      manifest: Record<string, unknown>;
      entry: ProjectObjectMetadata;
      assets: ProjectObjectMetadata[];
    };
    expect(reopenedPackagePayload).toEqual(winningPackagePayload);
    const reopenedWinningBytes = await reloadedProvider.projectObjects.read(reopenedPackagePayload.entry.object_id);
    expect(Array.from(reopenedWinningBytes)).toEqual(Array.from(winningSourceBytes));
    expect(await sha256Digest(reopenedWinningBytes)).toBe(reopenedPackagePayload.entry.digest);
    const originalBytes = await reloadedProvider.projectObjects.read(uploaded.object_id);
    expect(Array.from(originalBytes)).toEqual(Array.from(initialSourceBytes));
    expect(await sha256Digest(originalBytes)).toBe(uploaded.digest);

    // The Runtime ETag/digest check must reject an equal-length wrong entry.
    const wrongEntryBytes = new TextEncoder().encode(
      '<!doctype html><html><body><script>document.body.dataset.scene="changed";</script></body></html>',
    );
    expect(wrongEntryBytes.byteLength).toBe(winningSourceBytes.byteLength);
    objectReadOverrides.set(winningObject.object_id, wrongEntryBytes);
    await expect(reloadedProvider.projectObjects.read(winningObject.object_id))
      .rejects.toThrow(`Workspace Runtime object identity mismatch for ${winningObject.object_id}`);
    objectReadOverrides.delete(winningObject.object_id);

    await expect(reloadedProvider.projectObjects.read('unknown-project-object'))
      .rejects.toMatchObject({ status: 404 });
    const otherProjectProvider = new RuntimeDataProvider({
      projectId: 'project-r2',
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      transport: fixture.transport,
    });
    const otherProjectObject = await otherProjectProvider.projectObjects.ingest(
      new TextEncoder().encode('<html>other-project</html>'),
      'text/html',
      'other-scene.html',
    );
    await expect(reloadedProvider.projectObjects.read(otherProjectObject.object_id))
      .rejects.toMatchObject({ status: 404 });
    expect(fixture.read().config.clips).toHaveLength(2);
    expect(fixture.read().config.clips[0]?.app?.liveScene.source)
      .toEqual({ objectId: winningPackageObject.object_id, revision: winningPackageObject.digest });
  });

  it('returns the stable catalog identity for freshly prepared media before registry readback', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    const prepared = await provider.prepareAsset(
      new File(['managed creative'], 'managed-creative.mp4', { type: 'video/mp4' }),
      { timelineId: TIMELINE_ID, userId: 'owner-r3' },
    );

    expect(prepared.assetId).toBe(MANAGED_OBJECT_ID);
    expect(prepared.entry).toMatchObject({ media_id: MANAGED_OBJECT_ID, generationId: 'generation-import-r3', variantId: 'variant-import-r3' });
    expect(fixture.requests.some((request) => request.method === 'POST' && request.path.endsWith('/media-imports'))).toBe(true);
    expect(fixture.requests.some((request) => request.method === 'POST' && request.path.endsWith('/objects'))).toBe(false);
    expect(prepared.entry.file).toBe(MANAGED_OBJECT_URL);
    await expect(provider.resolveAssetUrl(prepared.entry.file!))
      .resolves.toBe(MANAGED_OBJECT_URL);
  });

  it('reconnects and validates managed media Range/ETag against registry identity', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    await provider.uploadAsset(
      new File(['managed creative'], 'managed-creative.mp4', { type: 'video/mp4' }),
      { timelineId: TIMELINE_ID, userId: 'owner-r4' },
    );
    const ranged = await provider.readAsset(MANAGED_OBJECT_ID, [0, 3]);
    const metadata = await provider.headAsset(MANAGED_OBJECT_ID);
    await provider.reconnect();

    expect(ranged.status).toBe(206);
    expect(ranged.etag).toBe(`"${MANAGED_OBJECT_DIGEST}"`);
    expect(ranged.content_range).toBe('bytes 0-3/16');
    expect(metadata.status).toBe(200);
    expect(metadata.etag).toBe(`"${MANAGED_OBJECT_DIGEST}"`);
    expect(fixture.requests.filter((request) => request.path === '/v1/handshake')).toHaveLength(2);
    expect(fixture.requests.find((request) => request.method === 'GET' && request.path === `/v1/objects/${encodeURIComponent(MANAGED_OBJECT_ID)}`)?.headers.Range)
      .toBe('bytes=0-3');
  });

  it('fails closed when managed media identity disagrees with the registry', async () => {
    const fixture = runtimeFixture({ mediaEtag: `"sha256:${'b'.repeat(64)}"` });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    await provider.uploadAsset(
      new File(['managed creative'], 'managed-creative.mp4', { type: 'video/mp4' }),
      { timelineId: TIMELINE_ID, userId: 'owner-r4' },
    );

    await expect(provider.headAsset(MANAGED_OBJECT_ID)).rejects.toThrow(
      'Workspace Runtime object identity mismatch',
    );
  });

  it('refuses a stale save without clobbering the canonical Runtime head', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const firstEdit = { ...initial.config, tracks: initial.config.tracks.map((track, index) => index === 0 ? { ...track, label: 'First V1' } : track) };
    await provider.saveTimelineAtHead(TIMELINE_ID, firstEdit, initial.head!);
    const staleEdit = { ...initial.config, tracks: initial.config.tracks.map((track, index) => index === 0 ? { ...track, label: 'Stale V1' } : track) };

    await expect(provider.saveTimelineAtHead(TIMELINE_ID, staleEdit, initial.head!)).rejects.toMatchObject({
      name: 'TimelineVersionConflictError',
      code: 'timeline_version_conflict',
    });
    expect(fixture.read().documentVersion).toBe(2);
    expect(fixture.read().config.tracks[0]?.label).toBe('First V1');
  });

  it('returns an actionable error when the Runtime is down', async () => {
    const client = new AstridRuntimeClient({
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      transport: async () => { throw new Error('connect ECONNREFUSED'); },
    });

    await expect(client.ensureSession()).rejects.toMatchObject({
      name: 'RuntimeUnavailableError',
      code: 'runtime_unavailable',
      recoveryAction: 'Start the supported Runtime and configure its authenticated connector, then retry.',
    });
  });

  it('surfaces a storage admission failure instead of misclassifying it as a timeline conflict', async () => {
    const fixture = runtimeFixture();
    const onRuntimeError = vi.fn();
    const publishPath = `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/composition-revisions`;
    const provider = new RuntimeDataProvider({
      projectId: PROJECT_ID,
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      onRuntimeError,
      transport: async (method, path, headers, body) => {
        if (method === 'POST' && path === publishPath) {
          return {
            status: 409,
            headers: {},
            body: json({
              code: 'realm_admission_failed',
              message: 'Runtime realm admission failed',
              details: {
                checks: {
                  sqlite: { result: 'error: [Errno 28] No space left on device' },
                },
              },
            }),
          };
        }
        return fixture.transport(method, path, headers, body);
      },
    });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const edited = {
      ...initial.config,
      tracks: initial.config.tracks?.map((track, index) => (
        index === 0 ? { ...track, label: 'Storage failure' } : track
      )),
    };

    await expect(provider.saveTimelineAtHead(TIMELINE_ID, edited, initial.head!)).rejects.toMatchObject({
      code: 'runtime_unavailable',
      causeCode: 'realm_admission_failed',
      failureKind: 'storage',
      status: 409,
    });
    expect(onRuntimeError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'runtime_unavailable',
      recoveryAction: 'Check the Runtime data volume and restart it, then retry; your timeline draft is preserved.',
    }));
  });

  it('reports rejected Runtime credentials to the page recovery seam', async () => {
    const onRuntimeError = vi.fn();
    const provider = new RuntimeDataProvider({
      projectId: PROJECT_ID,
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      onRuntimeError,
      transport: async (method, path) => {
        if (path === '/v1/health') {
          return { status: 401, headers: {}, body: json({ code: 'unauthorized', message: 'credential rejected' }) };
        }
        throw new Error(`unexpected ${method} ${path}`);
      },
    });

    await expect(provider.loadTimeline(TIMELINE_ID)).rejects.toBeInstanceOf(RuntimeAuthenticationError);
    expect(onRuntimeError).toHaveBeenCalledTimes(1);
    expect(onRuntimeError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'runtime_authentication',
      status: 401,
    }));
  });
});


// Accepted Pack media-locator regression retained with current provider tests.
it('returns a playable locator for a freshly prepared object before registry readback', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    const prepared = await provider.prepareAsset(
      new File(['managed creative'], 'managed-creative.mp4', { type: 'video/mp4' }),
      { timelineId: TIMELINE_ID, userId: 'owner-r3' },
    );

    expect(prepared.entry.file).toBe(MANAGED_OBJECT_URL);
    await expect(provider.resolveAssetUrl(prepared.entry.file!))
      .resolves.toBe(MANAGED_OBJECT_URL);
  });


describe('current App preservation', () => {
  it.each(['explicit-none', 'partial-missing'] as const)('publishes %s transition intent without losing canonical extensions', async (mode) => {
    const initialClip = { id: 'clip-transition', at: 0, track: 'V1', hold: 2,
      transition: { type: 'crossfade', duration: 0.5 }, app: { other: { keep: true } },
      opaque_clip: { owner: 'another-client' } };
    const fixture = runtimeFixture({ initialClips: [initialClip],
      initialConfig: { app: { astrid: { intent: 'preserve' }, other: { keep: true } }, opaque_config: { keep: 3 } },
      parentExtensions: { opaque_parent: { keep: 4 } } });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const authored = sanitizeTimelineClipSnapshot({ id: initialClip.id, at: 1, track: 'V1', hold: 2,
      ...(mode === 'explicit-none' ? { transition: undefined } : {}) });
    await provider.saveTimelineAtHead(TIMELINE_ID, { ...initial.config, clips: [authored] }, initial.head!);
    const publication = fixture.requests.find((request) => request.method === 'POST' && request.path.endsWith('/composition-revisions'))!;
    const parent = (publication.body as { parent_composition: Record<string, any> }).parent_composition;
    const saved = parent.clips[0];
    if (mode === 'explicit-none') expect(saved).not.toHaveProperty('transition');
    else expect(saved.transition).toEqual(initialClip.transition);
    expect(saved.opaque_clip).toEqual(initialClip.opaque_clip);
    expect(saved.app).toEqual(initialClip.app);
    expect(parent.opaque_parent).toEqual({ keep: 4 });
    expect(parent.config.opaque_config).toEqual({ keep: 3 });
    expect(parent.config.app).toEqual({ astrid: { intent: 'preserve' }, other: { keep: true } });
    expect(parent.config.clips).toEqual(parent.clips);
  });
});


describe('current App preservation pending acknowledgements', () => {
  it('does not replay an accepted partial edit for a new explicit None action', async () => {
    const fixture = runtimeFixture({ initialClips: [{ id: 'clip-transition', at: 0, track: 'V1', hold: 2, transition: { type: 'crossfade', duration: 0.5 } }] });
    let loseAcknowledgement = true;
    const transport: typeof fixture.transport = async (...args) => {
      const response = await fixture.transport(...args);
      if (args[0] === 'POST' && args[1].endsWith('/composition-revisions') && loseAcknowledgement) {
        loseAcknowledgement = false;
        throw new Error('fixture lost accepted publication acknowledgement');
      }
      return response;
    };
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const partial = { id: 'clip-transition', at: 1, track: 'V1', hold: 2 };
    await expect(provider.saveTimelineAtHead(TIMELINE_ID, { ...initial.config, clips: [partial] }, initial.head!)).rejects.toThrow('fixture lost');
    const none = sanitizeTimelineClipSnapshot({ ...partial, transition: undefined });
    await expect(provider.saveTimelineAtHead(TIMELINE_ID, { ...initial.config, clips: [none] }, initial.head!)).rejects.toBeInstanceOf(TimelineVersionConflictError);
    expect(fixture.requests.filter((request) => request.method === 'POST' && request.path.endsWith('/composition-revisions'))).toHaveLength(1);
  });

  it('refuses a different edit beside an unanswered save as the editor\'s own save, never as another writer, and sends nothing', async () => {
    const fixture = runtimeFixture({ initialClips: [{ id: 'clip-a', at: 0, track: 'V1', hold: 2 }] });
    const transport: typeof fixture.transport = async (...args) => {
      if (args[0] === 'POST' && args[1].endsWith('/composition-revisions')) throw new Error('fixture: Astrid went away mid-request');
      return fixture.transport(...args);
    };
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const edit = (at: number) => ({ ...initial.config, clips: [{ id: 'clip-a', at, track: 'V1', hold: 2 }] });
    await expect(provider.saveTimelineAtHead(TIMELINE_ID, edit(1), initial.head!)).rejects.toThrow('went away');

    const refused = await provider.saveTimelineAtHead(TIMELINE_ID, edit(2), initial.head!).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(TimelineVersionConflictError);
    expect(isOwnUnacknowledgedSaveError(refused)).toBe(true);
    // A genuine rejection by the Runtime is not "ours".
    expect(isOwnUnacknowledgedSaveError(new TimelineVersionConflictError('Another editor changed the timeline'))).toBe(false);
  });
});
