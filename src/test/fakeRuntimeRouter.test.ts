import { afterEach, describe, expect, it } from 'vitest';

import { bridgeErrorEnvelopeSchema } from '@/tools/video-editor/data/bridgeContract.ts';
import { classifyRouteError } from '@/integrations/astrid/transport.ts';
import { createFakeRuntimeRouter } from '@/test/fakeRuntimeRouter.ts';
import { taskSummaryFromReadModel, makeAdmittedTaskReadModel } from '@/test/bridgeFixtures.mjs';
import { createGalleryFixtures, createTimelineFixtures } from '@/test/fakeRuntimeSeed.mjs';

const BASE = 'http://bridge.fake';

function get(path: string): Promise<Response> {
  return createFakeRuntimeRouter().handle(new Request(`${BASE}${path}`));
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return await createFakeRuntimeRouter().handle(
    new Request(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );
}

describe('fakeRuntimeRouter wire conformance', () => {
  afterEach(() => {});

  it('replays doc-18 fixture shapes end to end through admission and polling', async () => {
    const router = createFakeRuntimeRouter();
    const admit = await router.handle(new Request(`${BASE}/api/astrid/projects/demo-project/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'k1' },
      body: JSON.stringify({
        project: 'demo-project',
        capability_id: 'astrid.image_generation',
        capability_digest: `sha256:${'a'.repeat(64)}`,
        schema_version: '1',
        input_object_ids: [`sha256:${'1'.repeat(64)}`],
        spec: {
          family: 'image_generation',
          params: { prompt: 'x' },
          output_policy: {},
        },
        storage_estimate: { scratch_bytes: 0, output_bytes: 0 },
        settlement_effect: {},
      }),
    }));
    expect(admit.status).toBe(201);
    const admitted = (await admit.json()).task;
    // Kernel read model keys its identity as `id` (as implemented on phase-b).
    expect(admitted.id).toBeTruthy();
    expect(admitted.spec.family).toBe('image_generation');

    // Reads and cancellation ride the neutral Runtime routes.
    const list = await (await router.handle(new Request(`${BASE}/v1/projects/demo-project/tasks`))).json();
    expect(list.items[0].task_id).toBe(admitted.id);
    expect(list.items[0].state).toBe('queued');

    const detail = await (await router.handle(new Request(`${BASE}/v1/tasks/${admitted.id}`))).json();
    expect(detail.task_id).toBe(admitted.id);
    expect(detail.state).toBe('queued');

    const cancelled = await router.handle(new Request(`${BASE}/v1/tasks/${admitted.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'cancel-1' },
      body: '{}',
    }));
    expect((await cancelled.json()).data.state).toBe('cancelled');
  });

  it('answers gallery reads from the shared fixture module only', async () => {
    const fixtures = createGalleryFixtures();
    const page = await (await get('/v1/projects/demo-project/generations?limit=50')).json();
    expect(page.items).toHaveLength(fixtures.details.length);
    // Recency-first order (created_at DESC).
    const created = page.items.map((row: { created_at: string }) => row.created_at);
    expect([...created].sort().reverse()).toEqual(created);

    const generationId = fixtures.details[0].generation_id;
    const detail = await (await get(`/v1/generations/${generationId}`)).json();
    expect(detail.generation_id).toBe(generationId);
    const variants = await (await get(`/v1/generations/${generationId}/variants`)).json();
    expect(variants.items.some((variant: { metadata: { is_primary: boolean } }) => variant.metadata.is_primary)).toBe(true);

    const missing = await get('/v1/generations/unknown');
    expect(missing.status).toBe(404);
  });

  it('serves media bytes with Range/ETag semantics from fixture data', async () => {
    const fixtures = createGalleryFixtures();
    const mediaId = fixtures.media[0].media_id;

    const full = await get(`/api/astrid/projects/demo-project/media/${mediaId}/content`);
    expect(full.status).toBe(200);
    expect(full.headers.get('Content-Type')).toBe(fixtures.media[0].mime);
    expect(full.headers.get('Accept-Ranges')).toBe('bytes');

    const ranged = await createFakeRuntimeRouter().handle(new Request(
      `${BASE}/api/astrid/projects/demo-project/media/${mediaId}/content`,
      { headers: { Range: 'bytes=0-9' } },
    ));
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('Content-Range')).toMatch(/^bytes 0-9\//);

    const missing = await get('/api/astrid/projects/demo-project/media/unknown/content');
    expect(missing.status).toBe(404);
  });

  it('maps oversized admission bodies to payload_too_large with limit_bytes', async () => {
    const huge = JSON.stringify({
      family: 'image_generation',
      input: { prompt: 'x'.repeat(1024 * 1024 + 2) },
    });
    const response = await createFakeRuntimeRouter().handle(new Request(
      `${BASE}/api/astrid/projects/demo-project/tasks`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'k' }, body: huge },
    ));
    expect(response.status).toBe(413);
    const envelope = bridgeErrorEnvelopeSchema.parse(await response.json());
    expect(envelope.error).toBe('payload_too_large');
    expect(envelope.limit_bytes).toBe(1024 * 1024);
  });

  it('classifies every public category deterministically', () => {
    expect(classifyRouteError(400, 'invalid_body')).toBe('invalid_body');
    expect(classifyRouteError(404, undefined)).toBe('not_found');
    expect(classifyRouteError(409, 'idempotency_mismatch')).toBe('conflict');
    expect(classifyRouteError(422, 'capability_unavailable')).toBe('capability_unavailable');
    expect(classifyRouteError(413, 'payload_too_large')).toBe('payload_too_large');
    expect(classifyRouteError(500, 'internal')).toBe('unknown');
  });

  it('keeps fixture helpers consistent with the journey state', () => {
    const readModel = makeAdmittedTaskReadModel({ taskId: '01j8zcex4q7m4sjdy6g6000001' });
    const summary = taskSummaryFromReadModel(readModel);
    expect(summary.task_id).toBe(readModel.id);
    expect(summary.status).toBe(readModel.status);

    const timeline = createTimelineFixtures();
    expect(timeline.timelineSummary.timeline_id).toBe('demo-timeline');
  });

  it('serves the event feed: paging cursors end in null, polling cursors never do, aggregate filter, from=latest', async () => {
    const router = createFakeRuntimeRouter();
    const admit = async (key: string) => {
      const response = await router.handle(new Request(`${BASE}/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          project: 'demo-project',
          capability_id: 'astrid.image_generation',
          capability_digest: `sha256:${'a'.repeat(64)}`,
          schema_version: '1',
          input_object_ids: [],
          spec: { family: 'image_generation', params: {}, output_policy: {} },
          storage_estimate: { scratch_bytes: 0, output_bytes: 0 },
          settlement_effect: {},
        }),
      }));
      return (await response.json() as { data: { task_id: string } }).data.task_id;
    };
    const read = async (query: string) => await (await router.handle(new Request(`${BASE}/v1/events${query}`))).json() as {
      items: Array<{ aggregate_id: string; event_type: string; cursor: string; sequence: number }>;
      next_cursor: string | null;
    };

    // A paging walk (no cursor, or a paging cursor) ends in null, as in `events_page_2_200`.
    expect(await read('?limit=2')).toEqual({ items: [], next_cursor: null });

    const first = await admit('key-1');
    const second = await admit('key-2');
    await router.handle(new Request(`${BASE}/v1/tasks/${second}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'cancel-2' },
      body: '{}',
    }));

    const page1 = await read('?limit=2');
    expect(page1.items.map((event) => [event.aggregate_id, event.event_type])).toEqual([
      [first, 'task.admitted'], [second, 'task.admitted'],
    ]);
    expect(page1.next_cursor).not.toBeNull();
    const page2 = await read(`?limit=2&cursor=${page1.next_cursor}`);
    expect(page2.items.map((event) => event.event_type)).toEqual(['task.cancelled']);
    expect(page2.next_cursor).toBeNull();
    expect(await read('?limit=10')).toMatchObject({ next_cursor: null });
    expect((await read(`?aggregate_id=${first}`)).items).toHaveLength(1);

    // A polling cursor (from=latest mints it) is never null: it advances with the feed and is echoed when idle.
    expect(await read('?from=latest')).toEqual({ items: [], next_cursor: '3' });
    expect(await read('?cursor=0&limit=2')).toMatchObject({ next_cursor: '2' });
    expect(await read('?cursor=2')).toMatchObject({ items: [{ event_type: 'task.cancelled' }], next_cursor: '3' });
    expect(await read('?cursor=3')).toEqual({ items: [], next_cursor: '3' });
    const bad = await router.handle(new Request(`${BASE}/v1/events?cursor=nope`));
    expect(bad.status).toBe(400);
  });

  it('continues the event sequence from eventSequenceStart so a rebuilt router never rewinds a cursor', async () => {
    const router = createFakeRuntimeRouter({ eventSequenceStart: 40 });
    await router.handle(new Request(`${BASE}/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'late' },
      body: JSON.stringify({
        project: 'demo-project',
        capability_id: 'astrid.image_generation',
        capability_digest: `sha256:${'a'.repeat(64)}`,
        schema_version: '1',
        input_object_ids: [],
        spec: { family: 'image_generation', params: {}, output_policy: {} },
        storage_estimate: { scratch_bytes: 0, output_bytes: 0 },
        settlement_effect: {},
      }),
    }));
    const page = await (await router.handle(new Request(`${BASE}/v1/events?cursor=40`))).json() as {
      items: Array<{ sequence: number }>;
    };
    expect(page.items.map((event) => event.sequence)).toEqual([41]);
  });

  it('answers one project by slug or canonical id from the same row as the list, and 404s otherwise', async () => {
    const router = createFakeRuntimeRouter();
    const listed = (await (await router.handle(new Request(`${BASE}/v1/projects`))).json() as { items: Array<{ project_id: string; slug: string }> }).items[0]!;
    for (const selector of [listed.slug, listed.project_id]) {
      const response = await router.handle(new Request(`${BASE}/v1/projects/${selector}`));
      expect(response.status, selector).toBe(200);
      expect(await response.json()).toEqual(listed);
    }
    expect((await router.handle(new Request(`${BASE}/v1/projects/other-project`))).status).toBe(404);
  });

  it('lists, ingests and serves objects from a shared store only, with no placeholder objects', async () => {
    const objectStore = new Map();
    const router = createFakeRuntimeRouter({ objectStore });
    const listIds = async () => (await (await router.handle(new Request(`${BASE}/v1/projects/demo-project/objects`))).json() as {
      items: Array<{ object_id: string }>;
    }).items.map((item) => item.object_id);
    expect(await listIds()).toEqual([]);

    const bytes = new TextEncoder().encode('content addressed');
    const ingested = await router.handle(new Request(`${BASE}/v1/projects/demo-project/objects`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Idempotency-Key': 'ingest-1' },
      body: bytes,
    }));
    expect(ingested.status).toBe(201);
    const objectId = (await ingested.json() as { data: { object_id: string } }).data.object_id;
    expect(objectId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(Array.from(objectStore.get(objectId)?.bytes ?? [])).toEqual(Array.from(bytes));
    expect(await listIds()).toEqual([objectId]);
    const served = await router.handle(new Request(`${BASE}/v1/objects/${objectId}`));
    expect(served.status).toBe(200);
    expect(served.headers.get('ETag')).toBe(`"${objectId}"`);
    expect(Array.from(new Uint8Array(await served.arrayBuffer()))).toEqual(Array.from(bytes));
  });
});
