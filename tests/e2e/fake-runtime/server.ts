/**
 * The fake Runtime: a small seeded stand-in for the Workspace Runtime daemon that `dev:editor` and the
 * Playwright suites speak workspace.v1 to. It is a dispatcher over the two fakes the repo already has,
 * wrapped in node:http; it holds no route logic of its own beyond workspace.json, the timeline list (which
 * has to aggregate the instances), auth, reset and header adaptation.
 *
 *   workspace.json, health/handshake/realm, objects, media imports, timelines/:t/*  -> runtimeFixture
 *   every other /v1/*                                                               -> createFakeRuntimeRouter
 *   ACP chat reads and opt-in setup scenarios                                        -> acp.ts
 *
 * Run with `tsx --tsconfig tests/e2e/fake-runtime/tsconfig.json` (see launch.mjs). Env: FAKE_RUNTIME_PORT
 * (0 or unset picks a free port) and FAKE_RUNTIME_TOKEN_FILE (required). On start it prints
 * `FAKE_RUNTIME_READY <port>` to stdout. Binds 127.0.0.1 only.
 */
import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { createFakeRuntimeRouter, type FakeRuntimeRouter } from '../../../src/test/fakeRuntimeRouter.ts';
import {
  runtimeFixture,
} from '../../../src/test/fakeWorkspaceRuntime.ts';
import {
  FAKE_RUNTIME_ACTOR_ID,
  FAKE_RUNTIME_INSTANCE_ID,
  FAKE_RUNTIME_REALM_ID,
} from '../../../src/test/fakeRuntimeIdentity.mjs';
import type { FakeObjectStore } from '../../../src/test/fakeObjectStore.ts';
import { createFakeAcp, type FakeAcp } from './acp.ts';
import { createSeedObjectStore, createSeedTimelines, DEMO_PROJECT_ID, DEMO_PROJECT_SLUG, type SeedName } from './seed.ts';

export const READY_PREFIX = 'FAKE_RUNTIME_READY';

type Fixture = ReturnType<typeof runtimeFixture>;
type Instance = { summary: Record<string, unknown> & { timeline_id: string }; fixture: Fixture };
type World = {
  epoch: number;
  /** The event sequence this world's router continues from. */
  eventBase: number;
  store: FakeObjectStore;
  router: FakeRuntimeRouter;
  instances: Map<string, Instance>;
  defaultInstance: Instance;
  acp: FakeAcp;
};
type Reply = { status: number; headers: Record<string, string>; body: Uint8Array };

const encoder = new TextEncoder();
const jsonBody = (value: unknown) => encoder.encode(JSON.stringify(value));
const errorReply = (status: number, code: string, message: string): Reply => ({
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: jsonBody({ code, message, request_id: 'fake-request' }),
});

/** The fixture matches case-sensitively on `Idempotency-Key`, `Content-Type`, `X-Original-Name`, `Range`. */
const titleCase = (name: string) => name.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('-');

function buildWorld(epoch: number, eventSequenceStart: number, seed: SeedName = 'demo'): World {
  const store = createSeedObjectStore();
  const router = createFakeRuntimeRouter({ objectStore: store, eventSequenceStart });
  // The visual and geometry baselines were taken against a stub whose tasks and generations were empty.
  router.state.galleryDetails.splice(0);
  router.state.galleryPageRows.splice(0);
  router.state.media.clear();
  const instances = new Map<string, Instance>();
  for (const seeded of createSeedTimelines(seed)) {
    const timelineId = seeded.summary.timeline_id;
    instances.set(timelineId, {
      summary: seeded.summary,
      fixture: runtimeFixture({
        projectId: DEMO_PROJECT_ID,
        timelineId,
        // Heads never rewind across a reset: a client holding a pre-reset head must stay stale.
        headRevisionId: `seed-r${epoch}`,
        priorRevisions: [],
        parentComposition: seeded.parentComposition,
        objects: store,
        recordRequests: false,
      }),
    });
  }
  const [defaultInstance] = [...instances.values()];
  return {
    epoch,
    eventBase: eventSequenceStart,
    store,
    router,
    instances,
    defaultInstance: defaultInstance!,
    acp: createFakeAcp([DEMO_PROJECT_SLUG, DEMO_PROJECT_ID]),
  };
}

/** A Runtime route accepts a slug or the canonical id; the fixture instances only know the id. */
function canonicalProjectId(selector: string): string | null {
  const decoded = decodeURIComponent(selector);
  return decoded === DEMO_PROJECT_SLUG || decoded === DEMO_PROJECT_ID ? DEMO_PROJECT_ID : null;
}

function instanceFor(world: World, reference: string): Instance | undefined {
  const ref = decodeURIComponent(reference);
  return world.instances.get(ref) ?? [...world.instances.values()].find((instance) => (
    instance.summary.slug === ref || instance.summary.timeline_ulid === ref
  ));
}

function readBody(request: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function tokenMatches(header: string | undefined, token: string): boolean {
  const presented = Buffer.from(/^Bearer (.+)$/.exec(header ?? '')?.[1] ?? '');
  const expected = Buffer.from(token);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

export type FakeRuntimeServer = { port: number; origin: string; close(): Promise<void> };

export async function startFakeRuntimeServer(options: { token: string; port?: number }): Promise<FakeRuntimeServer> {
  let origin = '';
  let world = buildWorld(1, 0);

  /** Hand a request to a runtimeFixture instance. Its failures (it throws on unexpected paths) become 500s. */
  async function callFixture(
    instance: Instance,
    method: string,
    path: string,
    request: http.IncomingMessage,
    body: Buffer,
  ): Promise<Reply> {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.headers)) {
      if (name === 'authorization' || value === undefined) continue;
      headers[titleCase(name)] = Array.isArray(value) ? value.join(', ') : value;
    }
    try {
      const reply = await instance.fixture.transport(method, path, headers, body.length > 0 ? new Uint8Array(body) : undefined);
      return {
        status: reply.status,
        headers: {
          ...(Object.keys(reply.headers).some((name) => name.toLowerCase() === 'content-type') ? {} : { 'Content-Type': 'application/json' }),
          ...(Object.keys(reply.headers).some((name) => name.toLowerCase() === 'cache-control') ? {} : { 'Cache-Control': 'no-store' }),
          ...reply.headers,
        },
        body: reply.body,
      };
    } catch (error) {
      return failure(`${method} ${path}`, error);
    }
  }

  function failure(what: string, error: unknown): Reply {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[fake-runtime] ${what} failed: ${message}`);
    return errorReply(500, 'fake_internal', message);
  }

  async function dispatch(request: http.IncomingMessage, body: Buffer): Promise<Reply> {
    const method = request.method ?? 'GET';
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    const fixturePath = (path: string) => `${path}${url.search}`;

    if (method === 'GET' && pathname === '/runtime-config/v1/workspace.json') {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: jsonBody({
          schemaVersion: 1,
          actorId: FAKE_RUNTIME_ACTOR_ID,
          realmId: FAKE_RUNTIME_REALM_ID,
          runtimeInstanceId: FAKE_RUNTIME_INSTANCE_ID,
          endpoint: origin,
        }),
      };
    }

    if (!tokenMatches(request.headers.authorization, options.token)) {
      return errorReply(401, 'unauthorized', 'a valid bearer token is required');
    }

    // The instance table is read after the body is complete and before any await, so a fixture
    // compare-and-swap and a reset cannot interleave: a publish either lands in the live world or is refused.
    const live = world;

    if (pathname === '/__test/reset') {
      if (method !== 'POST') return errorReply(405, 'method_not_allowed', 'reset is POST only');
      // Neither heads nor the event feed rewind: a client holding a pre-reset cursor must still see new events.
      const events = live.router.state.events;
      // `{ "seed": "empty" }` starts the demo timeline as a new, empty one; no body (or any other) is the demo seed.
      let seed: SeedName = 'demo';
      try { seed = (JSON.parse(body.toString('utf8') || '{}') as { seed?: unknown }).seed === 'empty' ? 'empty' : 'demo'; } catch { seed = 'demo'; }
      world = buildWorld(live.epoch + 1, events.length > 0 ? events[events.length - 1]!.sequence : live.eventBase, seed);
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: jsonBody({
          reset: true,
          seed,
          epoch: world.epoch,
          heads: Object.fromEntries([...world.instances].map(([timelineId, instance]) => [timelineId, instance.fixture.read().headRevisionId])),
        }),
      };
    }

    if (!pathname.startsWith('/v1/')) {
      let parsed: unknown = null;
      if (body.length > 0) {
        try { parsed = JSON.parse(body.toString('utf8')); } catch { parsed = null; }
      }
      const acp = live.acp.handle(method, pathname, parsed);
      if (acp) {
        if (acp.delayMs) await new Promise(resolve => setTimeout(resolve, acp.delayMs));
        return { status: acp.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: jsonBody(acp.body) };
      }
      console.error(`[fake-runtime] no fake route for ${method} ${pathname}`);
      return errorReply(404, 'not_found', `No fake route for ${pathname}`);
    }

    // The editor records the open project in the Runtime (PUT /v1/projects/selection); the fake accepts the demo project only.
    if (pathname === '/v1/projects/selection') {
      if (method !== 'PUT') return errorReply(405, 'method_not_allowed', 'project selection is PUT only');
      let selector = '';
      try { selector = String((JSON.parse(body.toString('utf8')) as { project?: unknown }).project ?? ''); } catch { selector = ''; }
      const projectId = selector ? canonicalProjectId(selector) : null;
      if (!projectId) return errorReply(404, 'not_found', `project ${selector} was not found`);
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: jsonBody({
          data: { project_id: projectId, scope: 'workspace' },
          receipt: {
            receipt_id: 'fake-selection-receipt', command_kind: 'project.select', idempotency_key: String(request.headers['idempotency-key'] ?? ''),
            request_hash: 'fake', project_id: projectId, project_seq: [0, 0], event_ids: [], result: null, created_at: new Date(0).toISOString(),
          },
        }),
      };
    }

    if (pathname === '/v1/health' || pathname === '/v1/handshake' || pathname === '/v1/realm') {
      return await callFixture(live.defaultInstance, method, pathname, request, body);
    }

    const timelineList = /^\/v1\/projects\/([^/]+)\/timelines$/.exec(pathname);
    if (timelineList && method === 'GET') {
      if (!canonicalProjectId(timelineList[1]!)) return errorReply(404, 'not_found', `project ${timelineList[1]} was not found`);
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: jsonBody({
          items: [...live.instances.values()].map((instance) => ({
            ...instance.summary,
            project_id: DEMO_PROJECT_ID,
            head_revision_id: instance.fixture.read().headRevisionId,
          })),
          next_cursor: null,
        }),
      };
    }

    // The Transcript panel lists the project's transcript documents when the Extensions tab opens. The seeded
    // world holds no project documents, so every listing is an empty page; an unknown project is a 404.
    const documentList = /^\/v1\/projects\/([^/]+)\/documents$/.exec(pathname);
    if (documentList && method === 'GET') {
      if (!canonicalProjectId(documentList[1]!)) return errorReply(404, 'not_found', `project ${decodeURIComponent(documentList[1]!)} was not found`);
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: jsonBody({ items: [], next_cursor: null }),
      };
    }

    const timelineRoute = /^\/v1\/projects\/([^/]+)\/timelines\/([^/]+)(\/.*)?$/.exec(pathname);
    if (timelineRoute) {
      const projectId = canonicalProjectId(timelineRoute[1]!);
      const instance = instanceFor(live, timelineRoute[2]!);
      if (!projectId || !instance) {
        return errorReply(404, 'not_found', `timeline ${decodeURIComponent(timelineRoute[2]!)} was not found in project ${decodeURIComponent(timelineRoute[1]!)}`);
      }
      const path = `/v1/projects/${projectId}/timelines/${instance.summary.timeline_id}${timelineRoute[3] ?? ''}`;
      return await callFixture(instance, method, fixturePath(path), request, body);
    }

    // Objects are project-level and content-addressed in the one shared store. runtimeFixture owns ingest,
    // media imports, object location and object GET/HEAD; the router owns the project object list.
    const projectObjectRoute = (method === 'POST' && /^\/v1\/projects\/([^/]+)\/(media-imports|objects)$/.exec(pathname))
      || (method === 'GET' && /^\/v1\/projects\/([^/]+)\/(objects\/[^/]+\/location)$/.exec(pathname))
      || null;
    if (projectObjectRoute) {
      const projectId = canonicalProjectId(projectObjectRoute[1]!);
      if (!projectId) return errorReply(404, 'not_found', `project ${decodeURIComponent(projectObjectRoute[1]!)} was not found`);
      return await callFixture(live.defaultInstance, method, `/v1/projects/${projectId}/${projectObjectRoute[2]}`, request, body);
    }
    if (/^\/v1\/objects\/[^/]+$/.test(pathname) && (method === 'GET' || method === 'HEAD')) {
      return await callFixture(live.defaultInstance, method, pathname, request, body);
    }

    // Everything else is the router, unchanged. Its object list, projects, tasks, events and generations
    // are the routes held to the recordings by fakeRuntimeRouter.recorded.test.ts.
    try {
      const routed = await live.router.handle(new Request(`http://127.0.0.1${request.url ?? '/'}`, {
        method,
        headers: Object.fromEntries(Object.entries(request.headers).flatMap(([name, value]) => (
          value === undefined ? [] : [[name, Array.isArray(value) ? value.join(', ') : value]]
        ))),
        ...(method === 'GET' || method === 'HEAD' || body.length === 0 ? {} : { body: new Uint8Array(body) }),
      }));
      return {
        status: routed.status,
        headers: Object.fromEntries(routed.headers.entries()),
        body: new Uint8Array(await routed.arrayBuffer()),
      };
    } catch (error) {
      return failure(`${method} ${pathname}`, error);
    }
  }

  const server = http.createServer((request, response) => {
    void (async () => {
      let reply: Reply;
      try {
        const body = await readBody(request);
        reply = await dispatch(request, body);
      } catch (error) {
        reply = failure(`${request.method} ${request.url}`, error);
      }
      const headers = { ...reply.headers };
      if (!Object.keys(headers).some((name) => name.toLowerCase() === 'content-length')) {
        headers['Content-Length'] = String(reply.body.byteLength);
      }
      response.writeHead(reply.status, headers);
      response.end(request.method === 'HEAD' ? undefined : Buffer.from(reply.body));
    })();
  });
  server.on('clientError', (_error, socket) => socket.destroy());

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
  return {
    port,
    origin,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

// Run directly (`tsx server.ts`): token from FAKE_RUNTIME_TOKEN_FILE, port from FAKE_RUNTIME_PORT.
if (process.argv[1] !== undefined && /fake-runtime[\\/]server\.ts$/.test(process.argv[1])) {
  const tokenFile = process.env.FAKE_RUNTIME_TOKEN_FILE;
  if (!tokenFile) {
    console.error('[fake-runtime] FAKE_RUNTIME_TOKEN_FILE is required');
    process.exit(2);
  }
  const requestedPort = Number(process.env.FAKE_RUNTIME_PORT ?? 0);
  void startFakeRuntimeServer({ token: fs.readFileSync(tokenFile, 'utf8').trim(), port: requestedPort }).then((server) => {
    console.log(`${READY_PREFIX} ${server.port}`);
    const stop = () => { void server.close().then(() => process.exit(0)); };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  }, (error: unknown) => {
    console.error(`[fake-runtime] could not start: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
