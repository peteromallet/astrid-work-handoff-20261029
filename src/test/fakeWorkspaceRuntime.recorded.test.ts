// The fixture side of the fake Runtime: the stale-head publish rejection is the
// one `runtimeFixture` answer with a recording, so it is held to `publish_conflict_409` here. (The events
// feed is the router's and is held in fakeRuntimeRouter.recorded.test.ts.) Everything else `runtimeFixture`
// serves is unrecorded; the real-daemon direct journey is its referee.
import { describe, expect, it } from 'vitest';

import { PROJECT_ID, runtimeFixture, TIMELINE_ID } from '@/test/fakeWorkspaceRuntime.ts';
import { filled, jsonShape } from '@/test/recordedResponses.ts';

describe('runtimeFixture reproduces the recorded real-daemon responses', () => {
  it('publish_conflict_409: a publish against a stale head answers with the recorded status and error shape', async () => {
    const fixture = filled('publish_conflict_409');
    const instance = runtimeFixture();
    const path = `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/composition-revisions`;

    const response = await instance.transport(
      fixture.request.method,
      path,
      { 'Idempotency-Key': 'stale-publish', 'Content-Type': 'application/json' },
      new TextEncoder().encode(JSON.stringify(fixture.request.body)),
    );
    const body = JSON.parse(new TextDecoder().decode(response.body)) as { code: string; details: { reason: string } };

    expect(response.status).toBe(fixture.status);
    expect(jsonShape(body)).toEqual(jsonShape(fixture.body));
    expect(body.code).toBe((fixture.body as { code: string }).code);
    expect(body.details.reason).toBe('stale_head');
  });
});
