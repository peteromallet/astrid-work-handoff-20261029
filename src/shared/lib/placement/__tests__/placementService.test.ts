import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeRuntimeRouter, type FakeRuntimeRouter } from '@/test/fakeRuntimeRouter.ts';
import { TimelineVersionConflictError } from '@/sdk/video/timeline/errors';
import { createDefaultTimelineConfig } from '@/tools/video-editor/lib/defaults';

import {
  batchUpdatePlacementFrames,
  fetchGalleryRows,
  fetchProjectPlacements,
  placeGeneration,
  unplaceGeneration,
} from '../placementService';

/**
 * Placement round-trips over workspace.v1: the timeline list is a `/v1/projects/…`
 * route; the head is read and written only through `RuntimeDataProvider`
 * (`loadTimeline` / `loadAssetRegistry`, and `saveTimelineAtHead`, an immutable
 * revision published with `expected_head`). `GET /v1/projects/:p/timelines/:t`
 * is not stubbed: the real Runtime answers it with the public timeline resource
 * and no config or registry. Gallery and generation reads come from the
 * canonical fake router; the Runtime head is the in-memory fake below.
 */

const PROJECT = 'demo-project';
const TIMELINE = 'timeline-v1';
const SHOT = 'shot-e2e-1';
const FAKE_ORIGIN = 'http://bridge.fake';

const runtime = vi.hoisted(() => ({
  head: 'rev-1',
  version: 1,
  config: null as unknown,
  registry: { assets: {} } as unknown,
  publishes: [] as string[],
  /** Runs once, before the next publish is checked: simulates a sibling publish. */
  beforePublish: null as null | (() => void),
}));

vi.mock('@/integrations/runtime/dataProvider', () => ({
  RuntimeDataProvider: class {
    constructor(readonly options: { projectId: string }) {}
    async loadTimeline(timelineId: string) {
      return {
        config: structuredClone(runtime.config),
        configVersion: runtime.version,
        head: { projectId: this.options.projectId, timelineId, headRevisionId: runtime.head },
      };
    }
    async loadAssetRegistry() {
      return structuredClone(runtime.registry);
    }
    async saveTimelineAtHead(
      timelineId: string,
      config: unknown,
      expectedHead: { headRevisionId: string | null },
      registry: unknown,
    ) {
      const hook = runtime.beforePublish;
      runtime.beforePublish = null;
      hook?.();
      if (expectedHead.headRevisionId !== runtime.head) {
        throw new TimelineVersionConflictError('stale_head');
      }
      runtime.config = structuredClone(config);
      runtime.registry = structuredClone(registry);
      runtime.version += 1;
      runtime.head = `rev-${runtime.publishes.length + 2}`;
      runtime.publishes.push(runtime.head);
      return {
        configVersion: runtime.version,
        head: { projectId: this.options.projectId, timelineId, headRevisionId: runtime.head },
      };
    }
  },
}));

function installRuntime(router: FakeRuntimeRouter): string[] {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw.startsWith(FAKE_ORIGIN) ? raw : `${FAKE_ORIGIN}${raw}`);
    const path = url.pathname.replace(/^\/api\/astrid/, '');
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${path}`);
    const json = (body: unknown) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    if (path === `/v1/projects/${PROJECT}/timelines`) {
      return json({ items: [{ timeline_id: TIMELINE, name: 'main', is_default: true }] });
    }
    return await router.handle(new Request(url, init));
  }));
  return calls;
}

function firstSeededGenerationId(router: FakeRuntimeRouter): string {
  const detail = router.state.galleryDetails[0] as { generation_id: string };
  return detail.generation_id;
}

describe('placementService: CAS round-trips over workspace.v1', () => {
  beforeEach(() => {
    runtime.head = 'rev-1';
    runtime.version = 1;
    runtime.config = createDefaultTimelineConfig();
    runtime.registry = { assets: {} };
    runtime.publishes = [];
    runtime.beforePublish = null;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('places a completed generation into the document and the placement survives a fresh read', async () => {
    const router = createFakeRuntimeRouter();
    const calls = installRuntime(router);
    const generationId = firstSeededGenerationId(router);

    const placed = await placeGeneration({ projectSlug: PROJECT, shotId: SHOT, generationId });
    expect(placed.timelineFrame).toBe(0);
    expect(runtime.publishes).toEqual(['rev-2']);
    expect(calls.some((call) => call.endsWith('/save'))).toBe(false);

    // Fresh read: what a page load sees after refresh.
    const read = await fetchProjectPlacements(PROJECT);
    const rows = read.byShot.get(SHOT) ?? [];
    expect(rows.map((r) => r.generationId)).toEqual([generationId]);
    expect(rows[0]?.timelineFrame).toBe(0);
    expect(read.config.pinnedShotGroups?.[0]?.shotId).toBe(SHOT);

    // The placed clip is a REAL editor clip on the group track with a registry asset.
    const group = read.config.pinnedShotGroups?.[0];
    const clip = read.config.clips.find((c) => c.id === `clip-${placed.entryId}`);
    expect(clip?.track).toBe(group?.trackId);
    expect(clip?.clipType).toBe('media');
    const asset = read.registry.assets[clip?.asset ?? ''] as { generationId?: string } | undefined;
    expect(asset).toBeDefined();
  });

  it('pooled add keeps membership without a clip; batch update promotes it', async () => {
    const router = createFakeRuntimeRouter();
    installRuntime(router);
    const generationId = firstSeededGenerationId(router);

    const pooled = await placeGeneration({ projectSlug: PROJECT, shotId: SHOT, generationId, timelineFrame: null });
    let read = await fetchProjectPlacements(PROJECT);
    expect(read.config.clips.find((c) => c.id === `clip-${pooled.entryId}`)).toBeUndefined();
    expect(pooled.timelineFrame).toBeNull();

    const [promoted] = await batchUpdatePlacementFrames({
      projectSlug: PROJECT,
      shotId: SHOT,
      updates: [{ entryId: pooled.entryId, timelineFrame: 3 }],
    });
    expect(promoted.timelineFrame).toBe(3);
    read = await fetchProjectPlacements(PROJECT);
    expect(read.config.clips.some((c) => c.source_uuid === pooled.entryId)).toBe(true);
  });

  it('unplacing with keepAsPooled drops the clip but keeps membership', async () => {
    const router = createFakeRuntimeRouter();
    installRuntime(router);
    const generationId = firstSeededGenerationId(router);

    const placed = await placeGeneration({ projectSlug: PROJECT, shotId: SHOT, generationId });
    await unplaceGeneration({
      projectSlug: PROJECT,
      shotId: SHOT,
      entryId: placed.entryId,
      generationId,
      keepAsPooled: true,
    });

    const read = await fetchProjectPlacements(PROJECT);
    expect(read.config.clips.some((c) => c.source_uuid === placed.entryId)).toBe(false);
    expect(read.byShot.get(SHOT)?.[0]?.timelineFrame).toBeNull();
  });

  it('a concurrent publish between load and save engages the stale-head retry, not a lost update', async () => {
    const router = createFakeRuntimeRouter();
    installRuntime(router);
    const generationId = firstSeededGenerationId(router);

    // A sibling publish lands after our load and before our publish.
    runtime.beforePublish = () => {
      const sibling = structuredClone(runtime.config) as { clips: unknown[] };
      sibling.clips = [{ id: 'sibling', track: 'V1', at: 0, hold: 1 }];
      runtime.config = sibling;
      runtime.head = 'rev-sibling';
    };

    const placed = await placeGeneration({ projectSlug: PROJECT, shotId: SHOT, generationId });
    expect(placed.entryId).toContain(SHOT);
    expect(runtime.publishes).toHaveLength(1);
    const read = await fetchProjectPlacements(PROJECT);
    expect(read.config.clips.map((clip) => clip.id)).toContain('sibling');
    expect(read.byShot.get(SHOT)?.map((r) => r.generationId)).toEqual([generationId]);
  });

  it('gallery rows walk the R12 pages for the merge view', async () => {
    const router = createFakeRuntimeRouter();
    installRuntime(router);
    const rows = await fetchGalleryRows(PROJECT);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.primaryMediaId).toBeTruthy();
  });
});
