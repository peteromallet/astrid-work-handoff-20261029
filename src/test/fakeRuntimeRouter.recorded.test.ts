// The fake is trusted only for operations whose REAL-daemon responses it reproduces.
// For each recorded case the fake implements, it must answer with the recorded status and the same JSON shape
// (same keys recursively, same value types). Operations the fake implements with no recorded case are listed
// at the bottom so they stay visibly untrusted.
import { describe, expect, it } from 'vitest';

import { createFakeRuntimeRouter, type FakeRuntimeRouter } from '@/test/fakeRuntimeRouter.ts';
import { filled, jsonShape, PLACEHOLDER_VALUES, type RecordedResponse } from '@/test/recordedResponses.ts';

const BASE = 'http://bridge.fake/api/astrid';

/** Free-form subtrees that echo caller-supplied content (the task `spec`); only their presence is compared. */
const ECHOED_SPEC = new Set(['$.spec.spec', '$.data.spec.spec', '$.receipt.result.task.spec.spec']);

async function send(router: FakeRuntimeRouter, fixture: RecordedResponse, body: unknown = fixture.request.body, idempotencyKey = 'task') {
  const response = await router.handle(new Request(`${BASE}${fixture.request.path}`, {
    method: fixture.request.method,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: body === null ? undefined : JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() as unknown };
}

/**
 * An admission the App itself could send. The fake validates the App's stricter request dialect
 * (`spec.family/params/output_policy`), so the recorded request (`spec: {prompt}`) is answered 422, not
 * 201: the fake is narrower than the daemon on requests, which is the safe direction. Its RESPONSES are
 * what is held to the fixture here.
 */
function appAdmissionRequest(fixture: RecordedResponse): Record<string, unknown> {
  const recorded = fixture.request.body as Record<string, unknown>;
  return {
    project: 'demo-project',
    capability_id: recorded.capability_id,
    capability_digest: recorded.capability_digest,
    schema_version: '1',
    input_object_ids: recorded.input_object_ids,
    spec: { family: 'image_generation', params: {}, output_policy: {} },
    storage_estimate: { scratch_bytes: 0, output_bytes: 0 },
    settlement_effect: {},
  };
}

describe('fakeRuntimeRouter reproduces the recorded real-daemon responses', () => {
  it('task_admission_201: the App-shaped admission answers with the recorded status and shape', async () => {
    const fixture = filled('task_admission_201');
    const actual = await send(createFakeRuntimeRouter(), fixture, appAdmissionRequest(fixture));
    expect(actual.status).toBe(fixture.status);
    expect(jsonShape(actual.body, ECHOED_SPEC)).toEqual(jsonShape(fixture.body, ECHOED_SPEC));
  });

  it('task_read_200: GET /v1/tasks/:id answers with the recorded status and shape', async () => {
    const admission = filled('task_admission_201');
    const read = filled('task_read_200');
    const router = createFakeRuntimeRouter();
    const admitted = await send(router, admission, appAdmissionRequest(admission));
    const taskId = (admitted.body as { data: { task_id: string } }).data.task_id;

    const actual = await send(router, { ...read, request: { ...read.request, path: `/v1/tasks/${taskId}` } });

    expect(actual.status).toBe(read.status);
    expect(jsonShape(actual.body, ECHOED_SPEC)).toEqual(jsonShape(read.body, ECHOED_SPEC));
  });

  it('not_found_404: an unknown task answers with the recorded status and error shape', async () => {
    const fixture = filled('not_found_404');
    const actual = await send(createFakeRuntimeRouter(), fixture);
    expect(actual.status).toBe(fixture.status);
    expect(jsonShape(actual.body)).toEqual(jsonShape(fixture.body));
  });

  it('validation_error_422: an invalid admission answers with the recorded status and error shape', async () => {
    const fixture = filled('validation_error_422');
    const actual = await send(createFakeRuntimeRouter(), fixture);
    expect(actual.status).toBe(fixture.status);
    expect(jsonShape(actual.body)).toEqual(jsonShape(fixture.body));
    expect((actual.body as { code?: string }).code).toBe((fixture.body as { code: string }).code);
  });
});

describe('fakeRuntimeRouter GET /v1/events reproduces the recorded real-daemon responses', () => {
  /** Two admissions and one completion: three events, so a `limit=2` walk has a second page (as recorded). */
  async function admittedRouter() {
    const admission = filled('task_admission_201');
    const router = createFakeRuntimeRouter();
    await send(router, admission, appAdmissionRequest(admission));
    const second = await send(router, admission, appAdmissionRequest(admission), 'task-2');
    router.completeTask((second.body as { data: { task_id: string } }).data.task_id, {
      role: 'video',
      media_id: `sha256:${'d'.repeat(64)}`,
    });
    return router;
  }

  it('events_page_1_200: a page of task events answers with the recorded status and shape', async () => {
    const fixture = filled('events_page_1_200');
    const router = await admittedRouter();
    const actual = await send(router, fixture);
    expect(actual.status).toBe(fixture.status);
    expect(jsonShape(actual.body)).toEqual(jsonShape(fixture.body));
    const items = (actual.body as { items: Array<{ event_type: string; aggregate_type: string }> }).items;
    expect(items.map((event) => event.event_type)).toEqual(['task.admitted', 'task.admitted']);
    expect(items[0]!.aggregate_type).toBe('task');
  });

  it('events_page_2_200: the last page of a paging walk answers with the recorded shape and a null next_cursor', async () => {
    const page1Fixture = filled('events_page_1_200');
    const fixture = filled('events_page_2_200');
    const router = await admittedRouter();
    const page1 = await send(router, page1Fixture);
    const cursor = (page1.body as { next_cursor: string | null }).next_cursor;
    expect(cursor, 'a page with more behind it carries a cursor').not.toBeNull();
    const actual = await send(router, { ...fixture, request: { ...fixture.request, path: `/v1/events?limit=2&cursor=${cursor}` } });

    expect(actual.status).toBe(fixture.status);
    expect(jsonShape(actual.body)).toEqual(jsonShape(fixture.body));
    expect((actual.body as { next_cursor: unknown }).next_cursor).toBeNull();
    expect((actual.body as { items: Array<{ event_type: string }> }).items.map((event) => event.event_type)).toEqual(['task.completed']);
  });

  it('invalid_cursor_400: a cursor that is not a sequence answers with the recorded status and error shape', async () => {
    const fixture = filled('invalid_cursor_400');
    const actual = await send(await admittedRouter(), fixture);
    expect(actual.status).toBe(fixture.status);
    expect(jsonShape(actual.body)).toEqual(jsonShape(fixture.body));
    expect((actual.body as { code?: string }).code).toBe((fixture.body as { code: string }).code);
  });
});

describe('operations the fake implements without a recorded real-daemon response (untrusted)', () => {
  // Not held to a fixture; do not invent one. Record them from a real daemon before relying on them.
  const UNCOVERED = [
    'GET /v1/health', 'GET /v1/capabilities', 'GET /v1/projects', 'GET /v1/projects/:id/tasks',
    'POST /v1/tasks/:id/cancel', 'POST /v1/projects/:id/objects', 'GET /v1/projects/:id/objects',
    'GET /v1/objects/:id', 'GET /v1/projects/:id/generations', 'GET /v1/generations/:id',
    'GET /v1/generations/:id/variants', 'GET /v1/projects/:selector',
  ];

  it('has no route for managed outputs, and fails loudly rather than answering with an invented body', async () => {
    const router = createFakeRuntimeRouter();
    for (const path of [`/v1/tasks/${PLACEHOLDER_VALUES.task_id}/managed-outputs`]) {
      const response = await router.handle(new Request(`${BASE}${path}`));
      // The fake has no route for this: it must fail loudly (404), never answer with an invented body.
      expect(response.status, path).toBe(404);
    }
    expect(UNCOVERED.length).toBeGreaterThan(0);
  });
});
