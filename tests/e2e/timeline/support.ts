/**
 * Shared harness for the timeline device specs.
 *
 * These specs are the *real-browser* half of the timeline's interaction
 * contract: `src/tools/video-editor/lib/mobile-interaction-conformance.test.tsx`
 * binds every policy predicate to a rendered attribute and a stylesheet rule,
 * but it runs in jsdom and says so in its own header — it cannot see whether the
 * browser's own gesture arbitration (back-swipe, pan, pinch) leaves the editor's
 * gestures reachable. That is what these do, over CDP touch input.
 *
 * One command: `npm run test:e2e:timeline` (after a one-time
 * `npx playwright install chromium`). Its opt-in flag makes `playwright.config.ts`
 * boot *both* live processes these specs need — the dev server and the fake
 * Runtime (`tests/e2e/fake-runtime`) — as `webServer` entries. A second terminal
 * is unnecessary: the harness owns fresh editor and fake Runtime ports for the
 * run and fails loudly if an explicitly supplied port is occupied.
 *
 * Both endpoints are env-parameterized. `BASE_URL` or
 * `PLAYWRIGHT_BASE_URL` wins; otherwise the origin follows the
 * run-isolated `PLAYWRIGHT_PORT` published by `playwright.config.ts`.
 * `FAKE_RUNTIME_PORT` is likewise run-isolated, and `FAKE_RUNTIME_TOKEN_FILE`
 * names the 0600 file holding the fake's bearer token.
 */
import { test as playwrightTest, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { dirname, resolve } from 'node:path';
import { createTimelineFixtures } from '../../../src/test/fakeRuntimeSeed.mjs';
import { createSeedTimelines } from '../fake-runtime/seed.ts';
import {
  CLIP_BODY_SELECTOR,
  EDIT_AREA_SELECTOR,
  SELECTED_CLIP_SELECTOR,
} from '../../../src/tools/video-editor/lib/timeline-dom.ts';
import {
  readCanonicalBaseUrl,
  resolveCanonicalBaseUrl,
} from './isolated-port.mjs';

export {
  CLIP_BODY_SELECTOR,
  CLIP_ACTION_WITH_ID_SELECTOR,
} from '../../../src/tools/video-editor/lib/timeline-dom.ts';

const editorPortValue = process.env.PLAYWRIGHT_PORT;
const editorPort = editorPortValue == null || editorPortValue === '' ? null : Number(editorPortValue);
if (editorPort != null && (!Number.isInteger(editorPort) || editorPort < 1 || editorPort > 65_535)) {
  throw new Error(`Invalid PLAYWRIGHT_PORT: ${editorPortValue}`);
}
if (!process.env.BASE_URL && !process.env.PLAYWRIGHT_BASE_URL && editorPort == null) {
  throw new Error('PLAYWRIGHT_PORT or BASE_URL must be published by the Playwright config; refusing an implicit shared editor port');
}
const configuredBaseURL = readCanonicalBaseUrl();
if (configuredBaseURL && editorPort != null && configuredBaseURL.port !== editorPort) {
  throw new Error(`Configured base URL port ${configuredBaseURL.port} does not match PLAYWRIGHT_PORT=${editorPort}`);
}
export const BASE_URL = configuredBaseURL?.url
  ?? resolveCanonicalBaseUrl(editorPort as number);
const fakeRuntimePortValue = process.env.FAKE_RUNTIME_PORT;
if (!fakeRuntimePortValue) {
  throw new Error('FAKE_RUNTIME_PORT was not published by playwright.config.ts; refusing an implicit shared fake Runtime port');
}
export const FAKE_RUNTIME_PORT = Number(fakeRuntimePortValue);
if (!Number.isInteger(FAKE_RUNTIME_PORT) || FAKE_RUNTIME_PORT < 1 || FAKE_RUNTIME_PORT > 65_535) {
  throw new Error(`Invalid FAKE_RUNTIME_PORT: ${fakeRuntimePortValue}`);
}
export const FAKE_RUNTIME_ORIGIN = `http://127.0.0.1:${FAKE_RUNTIME_PORT}`;

/** The seeded project's slug and canonical id; the fake accepts either on its routes. */
export const PROJECT_SLUG = 'demo-project';
export const PROJECT_ID = 'demo-project-id';
export const TIMELINE_SLUG = 'demo-timeline';

export interface EditorRouteOptions {
  /** App route; defaults to the video editor. */
  route?: string;
  /** Runtime timeline to open; defaults to the seeded demo timeline. */
  timeline?: string;
  /** Extra query parameters (fixtures, canaries); `localTest=1` is always set. */
  params?: Record<string, string>;
}

/**
 * The one place the Runtime-mode editor URL is built: `runtime=1` binds the page to the Runtime path
 * (workspace.v1) and `runtimeProject`/`runtimeTimeline` select the seeded project and timeline.
 * Returns a path plus query, for specs that use the Playwright `baseURL`.
 */
export function editorPath({ route = '/tools/video-editor', timeline = TIMELINE_SLUG, params = {} }: EditorRouteOptions = {}): string {
  const query = new URLSearchParams({
    runtime: '1',
    runtimeProject: PROJECT_ID,
    runtimeTimeline: timeline,
    localTest: '1',
    ...params,
  });
  return `${route}?${query.toString()}`;
}

/**
 * The rendered film's Download saves through `showSaveFilePicker` where the browser has one, and through a blob link
 * with the film's filename elsewhere (TimelineRenderControls). Chrome has the picker, and its native dialog is invisible
 * to Playwright, which sees a download only for the link. Removing the picker before the page loads runs the product's
 * own link path, so the click yields a download event carrying the rendered bytes and the filename.
 */
export async function forceBlobLinkDownload(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
}

/** Absolute form of {@link editorPath}. */
export function editorUrl(options: EditorRouteOptions = {}): string {
  return `${BASE_URL}${editorPath(options)}`;
}

export const EDITOR_URL = editorUrl();

/**
 * Browser captures are run artifacts by default. Tracked acceptance evidence
 * is deliberately opt-in so ordinary and release-gate runs cannot rewrite the
 * repository while still retaining every capture under Playwright's output.
 * Set PLAYWRIGHT_EVIDENCE_ROOT for an external run directory, or set
 * PLAYWRIGHT_REFRESH_TRACKED_EVIDENCE=1 when intentionally refreshing the
 * committed evidence ledger.
 */
export function browserEvidencePath(testInfo: TestInfo, relativePath: string): string {
  const tracked = process.env.PLAYWRIGHT_REFRESH_TRACKED_EVIDENCE === '1';
  const externalRoot = process.env.PLAYWRIGHT_EVIDENCE_ROOT;
  const destination = tracked
    ? resolve(process.cwd(), 'docs/extensions/ship-evidence', relativePath)
    : externalRoot
      ? resolve(externalRoot, relativePath)
      : testInfo.outputPath(relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  return destination;
}

const FAKE_RUNTIME_RESET_URL = `${FAKE_RUNTIME_ORIGIN}/__test/reset`;
const FAKE_RUNTIME_TIMELINES_URL = `${FAKE_RUNTIME_ORIGIN}/v1/projects/${PROJECT_ID}/timelines`;
const PRISTINE_SEED_FIXTURE = createTimelineFixtures({ assetSrcBaseUrl: BASE_URL });
/** The registry the fake Runtime serves for the default timeline after a reset: sha256 media ids included. */
const PRISTINE_SEED_REGISTRY = createSeedTimelines()[0]!.parentComposition.registry;

/** How long the editor needs to boot, resolve assets and lay the timeline out. */
export const EDITOR_SETTLE_MS = 9_000;

/**
 * Clip layout the specs assert against. The fake Runtime persists saves and the
 * gestures under test really do commit edits, so every spec restores this first
 * or the second run measures the first run's leftovers.
 */
export const BASELINE_CLIPS = [
  { id: 'clip-hero', at: 0, track: 'V1', asset: 'demo-hero', clipType: 'media', hold: 4 },
  { id: 'clip-title', at: 4, track: 'V1', clipType: 'text', hold: 2.5, text: { content: 'Hello timeline' } },
  { id: 'clip-detail', at: 6.5, track: 'V1', asset: 'demo-detail', clipType: 'media', hold: 4 },
  { id: 'clip-video', at: 1.5, track: 'V2', asset: 'demo-clip', clipType: 'media', hold: 5 },
];

/** Track order is fixture state too — the touch grip makes reordering reachable. */
export const BASELINE_TRACK_ORDER = ['V1', 'V2', 'A1'];
export const BASELINE_TRACKS = [
  { id: 'V1', kind: 'visual', label: 'V1', scale: 1, fit: 'contain', opacity: 1, blendMode: 'normal' },
  { id: 'V2', kind: 'visual', label: 'V2', scale: 1, fit: 'contain', opacity: 1, blendMode: 'normal' },
  { id: 'A1', kind: 'audio', label: 'A1', scale: 1, fit: 'contain', opacity: 1, blendMode: 'normal' },
];

/** Bearer header for direct reads and writes against the fake Runtime (the browser goes through the Vite proxy). */
export function fakeRuntimeAuthHeaders(): Record<string, string> {
  const tokenFile = process.env.FAKE_RUNTIME_TOKEN_FILE;
  if (!tokenFile) throw new Error('FAKE_RUNTIME_TOKEN_FILE was not published by playwright.config.ts');
  return { Authorization: `Bearer ${readFileSync(tokenFile, 'utf8').trim()}` };
}

interface FakeRuntimeTimelineSummary { timeline_id: string; head_revision_id: string }

async function readFakeRuntimeHeads(headers: Record<string, string>): Promise<Map<string, string> | string> {
  const response = await fetch(FAKE_RUNTIME_TIMELINES_URL, { headers });
  if (!response.ok) return `[reset] fake Runtime timeline list returned ${response.status}`;
  const { items } = await response.json() as { items?: FakeRuntimeTimelineSummary[] };
  if (!Array.isArray(items)) return '[reset] fake Runtime timeline list did not include items';
  return new Map(items.map((item) => [item.timeline_id, item.head_revision_id]));
}

function resetFakeRuntimeBaselineOnce(): Promise<string | null> {
  return (async () => {
    try {
      const headers = fakeRuntimeAuthHeaders();
      const readiness = await fetch(`${FAKE_RUNTIME_ORIGIN}/runtime-config/v1/workspace.json`);
      if (!readiness.ok) return `[reset] fake Runtime workspace.json returned ${readiness.status}`;
      const before = await readFakeRuntimeHeads(headers);
      if (typeof before === 'string') return before;
      const beforeHead = before.get(TIMELINE_SLUG);
      if (!beforeHead) return `[reset] fake Runtime did not list ${TIMELINE_SLUG} before the reset`;
      const resetResponse = await fetch(FAKE_RUNTIME_RESET_URL, { method: 'POST', headers });
      if (!resetResponse.ok) return `[reset] hard reset returned ${resetResponse.status}`;
      const reset = await resetResponse.json() as { reset?: boolean; epoch?: number; heads?: Record<string, string> };
      if (reset?.reset !== true) return '[reset] hard reset response was not marked reset:true';
      const resetHead = reset.heads?.[TIMELINE_SLUG];
      // Heads never rewind across a reset, so a new epoch always has a head the previous one never held.
      if (!Number.isInteger(reset.epoch) || !resetHead || resetHead === beforeHead) {
        return `[reset] hard reset did not move the head: before=${beforeHead}, after=${resetHead}`;
      }

      // Verify the public read surface, not only the reset response assembled by the control route.
      const after = await readFakeRuntimeHeads(headers);
      if (typeof after === 'string') return after;
      for (const [timelineId, head] of Object.entries(reset.heads ?? {})) {
        if (after.get(timelineId) !== head) {
          return `[reset] verification head mismatch for ${timelineId}: reset=${head}, read=${after.get(timelineId)}`;
        }
      }
      const revisionResponse = await fetch(
        `${FAKE_RUNTIME_TIMELINES_URL}/${TIMELINE_SLUG}/composition-revisions/${encodeURIComponent(resetHead)}`,
        { headers },
      );
      if (!revisionResponse.ok) return `[reset] verification revision GET returned ${revisionResponse.status}`;
      const { payload } = await revisionResponse.json() as { payload: { config: unknown; registry: unknown } };
      if (!isDeepStrictEqual(payload.config, PRISTINE_SEED_FIXTURE.config)) {
        return '[reset] verification read did not return the pristine config';
      }
      if (!isDeepStrictEqual(payload.registry, PRISTINE_SEED_REGISTRY)) {
        return '[reset] verification read did not return the pristine registry';
      }
      return null;
    } catch (error) {
      return `[reset] ${(error as Error).message}`;
    }
  })();
}

/** The head composition of a seeded timeline, as the Runtime serves it (`composition-revisions/<head>`). */
export interface FakeRuntimeComposition {
  headRevisionId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the payload is the Runtime's parent composition, partly opaque to specs
  config: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registry: Record<string, any>;
  payload: Record<string, unknown>;
}

/** Read a timeline's head composition straight from the fake Runtime (the persisted state, not the editor's view of it). */
export async function readFakeRuntimeComposition(timelineId: string = TIMELINE_SLUG): Promise<FakeRuntimeComposition> {
  const headers = fakeRuntimeAuthHeaders();
  const heads = await readFakeRuntimeHeads(headers);
  if (typeof heads === 'string') throw new Error(heads);
  const headRevisionId = heads.get(timelineId);
  if (!headRevisionId) throw new Error(`fake Runtime does not list timeline ${timelineId}`);
  const response = await fetch(
    `${FAKE_RUNTIME_TIMELINES_URL}/${encodeURIComponent(timelineId)}/composition-revisions/${encodeURIComponent(headRevisionId)}`,
    { headers },
  );
  if (!response.ok) throw new Error(`fake Runtime head revision GET returned ${response.status}`);
  const { payload } = await response.json() as { payload: FakeRuntimeComposition['payload'] & { config: FakeRuntimeComposition['config']; registry: FakeRuntimeComposition['registry'] } };
  return { headRevisionId, config: payload.config, registry: payload.registry, payload };
}

let externalPublishCounter = 0;

/**
 * Publish a new head the way a second writer would: read the head, let `update` edit a clone of its
 * config/registry, and POST the result with `expected_head` set to the head just read (a lost race is a 409,
 * never a silent overwrite). The editor under test sees it as an external change.
 */
export async function publishFakeRuntimeComposition(
  update: (composition: Pick<FakeRuntimeComposition, 'config' | 'registry'>) => void,
  timelineId: string = TIMELINE_SLUG,
): Promise<FakeRuntimeComposition> {
  const current = await readFakeRuntimeComposition(timelineId);
  const config = structuredClone(current.config);
  const registry = structuredClone(current.registry);
  update({ config, registry });
  externalPublishCounter += 1;
  const revisionId = `e2e-external-${process.pid}-${externalPublishCounter}`;
  const response = await fetch(
    `${FAKE_RUNTIME_TIMELINES_URL}/${encodeURIComponent(timelineId)}/composition-revisions`,
    {
      method: 'POST',
      headers: { ...fakeRuntimeAuthHeaders(), 'Content-Type': 'application/json', 'Idempotency-Key': revisionId },
      body: JSON.stringify({
        expected_head: current.headRevisionId,
        parent_revision_id: revisionId,
        parent_composition: { config, registry, clips: config.clips ?? [], occurrences: [] },
      }),
    },
  );
  if (!response.ok) throw new Error(`fake Runtime publish returned ${response.status}: ${await response.text()}`);
  return { headRevisionId: revisionId, config, registry, payload: { config, registry, clips: config.clips ?? [], occurrences: [] } };
}

/** Schema ref of the persisted transcript source items the transcript lane renders. */
export const TRANSCRIPT_SEGMENT_SCHEMA_REF = 'astrid.transcript_segment/v1';

export interface SeededTranscriptSegment { start: number; end: number; text: string }

/**
 * Seed a transcript for one media asset the way a saved project carries it: persisted bundle source items
 * (`config.bundle.itemsBySchemaRef[astrid.transcript_segment/v1]`, `source_seconds` against the asset),
 * published as a new head. The lane maps them onto every clip that plays the asset. Call after the shared
 * reset (it replaces the whole bundle); the editor under test sees it as an external change.
 */
export function publishTranscriptSegments(
  segments: readonly SeededTranscriptSegment[],
  assetId: string = 'demo-clip',
  timelineId: string = TIMELINE_SLUG,
): Promise<FakeRuntimeComposition> {
  return publishFakeRuntimeComposition(({ config }) => {
    config.bundle = transcriptBundle(segments, assetId);
  }, timelineId);
}

/** The persisted bundle carrying `segments` as transcript source items of `assetId`. */
export function transcriptBundle(segments: readonly SeededTranscriptSegment[], assetId: string) {
  return {
    schema_version: 1,
    itemsBySchemaRef: {
      [TRANSCRIPT_SEGMENT_SCHEMA_REF]: segments.map((segment, index) => ({
        id: `transcript-source:${assetId}:segment:${index}`,
        shape: 'interval',
        domain: 'source_seconds',
        extent: { start: segment.start, end: segment.end },
        schemaRef: TRANSCRIPT_SEGMENT_SCHEMA_REF,
        payload: { text: segment.text },
        sourceArtifactRef: { assetId },
        provenance: { adapterId: 'astrid.adaptTranscript', adapterVersion: '2' },
      })),
    },
  };
}

// Playwright can invoke hooks from multiple projects/pages in the same worker.
// Queue resets so two reset-and-verify sequences cannot interleave and silently
// verify an intermediate world.
let resetTail: Promise<void> = Promise.resolve();
export function resetFakeRuntimeBaseline(): Promise<string | null> {
  const result = resetTail.then(resetFakeRuntimeBaselineOnce, resetFakeRuntimeBaselineOnce);
  resetTail = result.then(() => undefined, () => undefined);
  return result;
}

// All ordinary timeline specs share one long-lived mutable fake Runtime process. Reset
// its complete state before every test so file/order changes cannot leak config,
// app metadata, or registry assets.
playwrightTest.beforeEach(async () => {
  const error = await resetFakeRuntimeBaseline();
  if (error) throw new Error(error);
});

/**
 * Seed the per-timeline editor preference record (`EditorPreferences`, `useEditorPreferences.ts`) that the
 * editor reads on mount, the way a user's earlier choices would be there. Missing fields take the editor's
 * defaults. Call before `page.goto`.
 */
export async function seedEditorPreferences(
  page: Page,
  patch: Record<string, unknown>,
  timelineId: string = TIMELINE_SLUG,
): Promise<void> {
  await page.addInitScript(({ storageKey, value }) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // storage unavailable: the spec's own assertions report the missing state
    }
  }, { storageKey: `video-editor:preferences:${timelineId}`, value: patch });
}

/**
 * A project without a world library answers 404 to the Explorer's read of its library document. That is the Runtime's
 * "absent" answer the panel handles (explorer/library.ts `readDocument`), not an error, so specs that fail on any
 * HTTP error step over it.
 */
export function isAbsentWorldLibraryRead(response: { status(): number; url(): string; request(): { method(): string } }): boolean {
  return response.status() === 404
    && response.request().method() === 'GET'
    && /\/documents\/world-library%3A[^/]*$/.test(new URL(response.url()).pathname);
}

/** Data-kind lanes other than the transcript start hidden; a spec that measures one opts in like a user does. */
export function showDataLanes(page: Page, timelineId: string = TIMELINE_SLUG): Promise<void> {
  return seedEditorPreferences(page, { showDataLanes: true }, timelineId);
}

const pageIssues = new WeakMap<Page, string[]>();

/** Collect every browser/page error. Local-test mode intentionally has no broad noise allowlist. */
export function collectPageLogs(page: Page): string[] {
  const existing = pageIssues.get(page);
  if (existing) return existing;
  const logs: string[] = [];
  pageIssues.set(page, logs);
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      logs.push(`[console.error] ${message.text().slice(0, 300)}`);
    }
  });
  return logs;
}

/**
 * Collect every HTTP response with status >= 400 and every failed request, with no exception list.
 * Pair it with `collectPageLogs` in specs that open the editor with `page.goto` instead of `openEditor`.
 */
export function collectNetworkIssues(page: Page): string[] {
  const issues: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) issues.push(`[http ${response.status()}] ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    issues.push(`[requestfailed] ${request.url()} — ${request.failure()?.errorText ?? 'unknown'}`);
  });
  return issues;
}

export function assertNoUnexpectedPageErrors(logs: readonly string[]): void {
  if (logs.length > 0) {
    throw new Error(`Unexpected browser errors:\n${[...new Set(logs)].join('\n')}`);
  }
}

export interface TouchInput {
  tap(x: number, y: number): Promise<void>;
  touchDrag(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options?: { steps?: number; holdMs?: number; stepMs?: number },
  ): Promise<void>;
  pinch(cx: number, cy: number, from: number, to: number, steps?: number): Promise<void>;
}

/**
 * Raw CDP touch input.
 *
 * Playwright's `page.touchscreen` only taps; these gestures need real multi-step
 * touchmove streams (and two-finger streams for pinch) because the behavior under
 * test *is* how the browser arbitrates a sustained touch drag against the page.
 */
export async function createTouchInput(context: BrowserContext, page: Page): Promise<TouchInput> {
  const cdp = await context.newCDPSession(page);

  return {
    async tap(x, y) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await page.waitForTimeout(60);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(500);
    },

    async touchDrag(x1, y1, x2, y2, { steps = 14, holdMs = 0, stepMs = 16 } = {}) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
      if (holdMs) await page.waitForTimeout(holdMs);
      for (let i = 1; i <= steps; i += 1) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps }],
        });
        await page.waitForTimeout(stepMs);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(400);
    },

    async pinch(cx, cy, from, to, steps = 12) {
      const points = (spread: number) => [{ x: cx - spread, y: cy }, { x: cx + spread, y: cy }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from) });
      for (let i = 1; i <= steps; i += 1) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: points(from + ((to - from) * i) / steps),
        });
        await page.waitForTimeout(20);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(600);
    },
  };
}

/**
 * The editor's only permitted network authorities in local mode are the
 * Vite app (which proxies the fake Runtime, so the browser never calls it directly); anything else (Supabase, Google Fonts, a
 * provider API) is a leak even if the request later fails. Non-network schemes
 * (data:, blob:, ...) are allowed.
 */
function isLocalAuthority(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  const secure = parsed.protocol === 'https:' || parsed.protocol === 'wss:';
  const web = secure || parsed.protocol === 'http:' || parsed.protocol === 'ws:';
  if (!web) return true;
  const origin = `${secure ? 'https' : 'http'}://${parsed.host}`;
  return origin === new URL(BASE_URL).origin;
}

/**
 * Open the editor in Runtime mode (over the fake Runtime) and wait for it to settle.
 *
 * Local mode must never talk to a backend: no session is seeded, so every
 * auth-gated query is disabled. This waits for the editor, then asserts zero
 * Supabase REST/auth requests — with a stale project id pre-seeded, covering
 * the regression where leftover project selection re-enabled queries — and
 * that every request and websocket stayed on the app origin.
 */
export async function openEditor(page: Page): Promise<void> {
  const issues = collectPageLogs(page);
  const forbiddenRequests: string[] = [];
  const offOriginUrls = new Set<string>();
  const notFoundResponses: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/(supabase\.co|127\.0\.0\.1:54321|localhost:54321|\/auth\/v1\/|\/rest\/v1\/|\/functions\/v1\/)/.test(url)) {
      forbiddenRequests.push(url);
    }
    if (!isLocalAuthority(url)) offOriginUrls.add(url);
  });
  page.on('websocket', (socket) => {
    if (!isLocalAuthority(socket.url())) offOriginUrls.add(socket.url());
  });
  page.on('response', (response) => {
    if (response.status() === 404) notFoundResponses.push(response.url());
  });
  // Pre-seed a stale project selection: local mode must not let leftover
  // project state re-enable backend queries (the regression Codex flagged).
  await page.addInitScript(() => {
    try {
      // A fresh browser profile otherwise opens the first-run onboarding
      // dialog over the editor and intercepts the timeline interactions below.
      window.localStorage.setItem('astrid-setup-complete', 'true');
      window.localStorage.setItem('astrid.lastSelectedProjectId', 'stale-project-from-earlier-session');
    } catch {
      // storage unavailable — the assertion below still covers the happy path
    }
  });
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  // A cold Vite module graph can outlast the geometry-settle delay. Wait for
  // the actual bootstrap and editor before using that delay for layout.
  await page.waitForFunction(() => {
    const runtime = window.__ASTRID_APP_LOCAL_TEST__;
    return runtime?.enabled
      && Array.isArray(runtime.diagnostics.loader)
      && Array.isArray(runtime.diagnostics.runtime);
  }, undefined, { timeout: 45_000 });
  await page.getByRole('button', { name: 'Render', exact: true }).waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForTimeout(EDITOR_SETTLE_MS);
  const localTestSnapshot = await page.evaluate(() => window.__ASTRID_APP_LOCAL_TEST__);
  if (
    !localTestSnapshot?.enabled
    || !Array.isArray(localTestSnapshot.diagnostics.loader)
    || !Array.isArray(localTestSnapshot.diagnostics.runtime)
  ) {
    throw new Error('localTest=1 did not initialize structured window.__ASTRID_APP_LOCAL_TEST__ diagnostics');
  }
  if (forbiddenRequests.length > 0) {
    throw new Error(`local-test editor made forbidden remote requests:\n${[...new Set(forbiddenRequests)].join('\n')}`);
  }
  if (offOriginUrls.size > 0) {
    throw new Error(`local-test editor left the app origin:\n${[...offOriginUrls].join('\n')}`);
  }
  const backendCalls = await page.evaluate(() => {
    const urls = performance.getEntriesByType('resource')
      .map((e) => e.name)
      .filter((n) => /(supabase\.co|127\.0\.0\.1:54321|localhost:54321)/.test(n));
    return urls.length;
  });
  if (backendCalls > 0) {
    throw new Error(`local-mode editor made ${backendCalls} backend request(s); local mode must be backend-free`);
  }
  // Every missing asset is a failure: nothing in the editor issues a deliberate negative probe.
  if (notFoundResponses.length > 0) {
    throw new Error(`local-test editor made unexpected 404 request(s):\n${[...new Set(notFoundResponses)].join('\n')}`);
  }
  assertNoUnexpectedPageErrors(issues);
}

/**
 * Selection is published as `data-selected="true"` on the clip root
 * (`ClipAction.tsx` via `clipActionAttrs`), so this reads the DOM contract, not
 * the accent-border classes a theming change would silently move.
 */
export function countSelectedClips(page: Page): Promise<number> {
  return page.evaluate(
    (selector) => document.querySelectorAll(selector).length,
    SELECTED_CLIP_SELECTOR as string,
  );
}

export interface ElementBox { x: number; y: number; w: number; h: number; cx: number; cy: number }

/** Rounded viewport box of the first match, or null. */
export function boxOf(page: Page, selector: string): Promise<ElementBox | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  }, selector);
}

/**
 * Pick a clip that is on screen and has room to its right on its own track.
 *
 * The timeline resolves an overlapping drop by snapping back to the nearest free
 * slot, which for a packed neighbour is the clip's own origin — so dragging any
 * other clip would measure the packing rule rather than the gesture.
 */
export function pickFreeDraggableClip(page: Page) {
  return page.evaluate((selectors: { editArea: string; clipWithId: string }) => {
    const area = document.querySelector(selectors.editArea)?.getBoundingClientRect();
    if (!area) return null;
    const clips = Array.from(document.querySelectorAll(selectors.clipWithId)).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute('data-clip-id'),
        row: el.getAttribute('data-row-id'),
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
      };
    });
    const onScreen = clips.filter((c) => c.x + c.w / 2 > area.left && c.x + c.w / 2 < area.right - 40);
    const free = onScreen.find((c) => !clips.some(
      (other) => other.id !== c.id && other.row === c.row && other.x > c.x && other.x < c.x + c.w + 140,
    ));
    return free ?? onScreen[0] ?? clips[0] ?? null;
  }, { editArea: EDIT_AREA_SELECTOR as string, clipWithId: CLIP_BODY_SELECTOR as string });
}
