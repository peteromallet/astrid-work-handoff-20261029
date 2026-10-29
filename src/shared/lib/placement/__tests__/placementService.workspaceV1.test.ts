import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimelineVersionConflictError } from '@/sdk/video/timeline/errors';
import { createDefaultTimelineConfig } from '@/tools/video-editor/lib/defaults';

/**
 * The Runtime has no `…/timelines/:ref/save` route, so
 * placement must publish through the same RuntimeDataProvider path the editor
 * saves with (`saveTimelineAtHead`, expected-head CAS).
 */

const PROJECT = 'project-v1';
const TIMELINE = 'timeline-v1';
const SHOT = 'shot-1';

const runtime = vi.hoisted(() => ({
  head: 'rev-1',
  config: null as unknown,
  registry: { assets: {} } as unknown,
  publishes: [] as string[],
  /** Runs once, before the next publish is checked — simulates a sibling publish. */
  beforePublish: null as null | (() => void),
}));

vi.mock('@/integrations/runtime/dataProvider', () => ({
  RuntimeDataProvider: class {
    constructor(readonly options: { projectId: string }) {}
    async loadTimeline(timelineId: string) {
      return {
        config: structuredClone(runtime.config),
        configVersion: 1,
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
      runtime.head = `rev-${runtime.publishes.length + 2}`;
      runtime.publishes.push(runtime.head);
      return { configVersion: 2, head: { projectId: this.options.projectId, timelineId, headRevisionId: runtime.head } };
    }
  },
}));

vi.mock('@/tools/video-editor/data/generationAssetResolver', () => ({
  resolveGenerationAsset: async () => ({
    ok: true,
    asset: {
      url: 'http://runtime.test/v1/objects/sha256%3Aabc',
      mimeType: 'image/png',
      entry: { file: 'sha256:abc', type: 'image', media_id: 'sha256:abc' },
    },
  }),
}));

function installV1Fetch() {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://runtime.test');
    url.pathname = url.pathname.replace(/^\/api\/astrid/, '');
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
    if (url.pathname === `/v1/projects/${PROJECT}/timelines`) {
      return json({ items: [{ timeline_id: TIMELINE, name: 'main', is_default: true }] });
    }
    if (url.pathname === `/v1/projects/${PROJECT}/timelines/${TIMELINE}` && (init?.method ?? 'GET') === 'GET') {
      return json({ timeline_id: TIMELINE, config: runtime.config, registry: runtime.registry, config_version: 1 });
    }
    return json({ code: 'not_found', message: `no route ${url.pathname}` }, 404);
  }));
  return calls;
}

async function loadService() {
  return await import('../placementService');
}

describe('placementService under Workspace v1', () => {
  beforeEach(() => {
    runtime.head = 'rev-1';
    runtime.config = createDefaultTimelineConfig();
    runtime.registry = { assets: {} };
    runtime.publishes = [];
    runtime.beforePublish = null;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('places a generation by publishing a new head revision', async () => {
    const calls = installV1Fetch();
    const { placeGeneration } = await loadService();

    const placed = await placeGeneration({ projectSlug: PROJECT, shotId: SHOT, generationId: 'gen-1' });

    expect(placed.timelineFrame).toBe(0);
    expect(runtime.publishes).toEqual(['rev-2']);
    const config = runtime.config as { clips: Array<{ id: string }>; pinnedShotGroups?: Array<{ shotId: string }> };
    expect(config.clips.map((clip) => clip.id)).toEqual([`clip-${placed.entryId}`]);
    expect(config.pinnedShotGroups?.[0]?.shotId).toBe(SHOT);
    expect(calls.some((call) => call.endsWith('/save'))).toBe(false);
  });

  it('re-reads the head and re-applies the placement once after a stale-head conflict', async () => {
    installV1Fetch();
    const { placeGeneration } = await loadService();
    // A sibling publish lands between placement's read and its publish.
    runtime.beforePublish = () => {
      const sibling = structuredClone(runtime.config) as { clips: unknown[] };
      sibling.clips = [{ id: 'sibling', track: 'V1', at: 0, hold: 1 }];
      runtime.config = sibling;
      runtime.head = 'rev-sibling';
    };

    await placeGeneration({ projectSlug: PROJECT, shotId: SHOT, generationId: 'gen-1' });

    const clipIds = (runtime.config as { clips: Array<{ id: string }> }).clips.map((clip) => clip.id);
    expect(clipIds).toContain('sibling');
    expect(clipIds.some((id) => id.startsWith('clip-'))).toBe(true);
    expect(runtime.publishes).toHaveLength(1);
  });

  it('surfaces the conflict when the head stays stale', async () => {
    installV1Fetch();
    const { placeGeneration } = await loadService();
    const bump = () => { runtime.head = `${runtime.head}x`; runtime.beforePublish = bump; };
    runtime.beforePublish = bump;

    await expect(placeGeneration({ projectSlug: PROJECT, shotId: SHOT, generationId: 'gen-1' }))
      .rejects.toMatchObject({ code: 'timeline_version_conflict' });
    expect(runtime.publishes).toHaveLength(0);
  });
});
