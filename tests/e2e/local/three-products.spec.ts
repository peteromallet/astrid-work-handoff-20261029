/**
 * Three products on one realm (testing plan F2, thin slice on the Plan A direct path):
 *
 *   npm run test:e2e:three-products    # hosted App build -> Runtime door -> real Runtime, plus the real Astrid CLI
 *
 * The App (hosted build, Chrome) and the agent (the Astrid CLI as a subprocess) are two clients of one Runtime. Nothing in a
 * case is a stand-in: the page talks to the real door, Astrid to the same Runtime over its own credential, and the Runtime
 * is the real daemon on a throwaway realm. Needs an Astrid checkout (ASTRID_CHECKOUT, default ../astrid-agent) with its Python
 * (ASTRID_PYTHON, default <checkout>/.venv/bin/python); a missing prerequisite fails the run with its name, it never skips.
 * The browser is installed Google Chrome (channel 'chrome', as the timeline-chrome-export project does): case 2b plays an H.264
 * film, which the bundled Chromium cannot decode, and a missing Chrome fails at launch. Case 2b also needs ffmpeg (real VP8 and
 * Opus media) and no Remotion: the host's ffmpeg renderer makes the render.
 *
 * Cases
 *   1  agent -> open App   an Astrid task and the agent's publication show up in the open App with no reload
 *   2  concurrent edit     the App's acknowledgement is lost while the agent publishes and the App edits again
 *   2b render R            a render admitted on revision R is R's although the agent publishes R+1 before it runs, it plays,
 *                          and it is the film the App's preview showed (F2 steps 3 and 4: one test, two steps)
 *   3  Runtime restart     the draft survives, saves after the relaunch, and the agent follows the new endpoint
 * Every case first proves the three products share one realm, one Runtime instance and one contract, and ends with the
 * page-wide check that no credential ever reached the page.
 *
 * Not covered here (recorded; plan "Owned debt"):
 *   step 6  Codex image -> sprite                                  full tier only, needs the network
 *
 * Speed: durations, Astrid call times and the load average are written to three-products-summary.json (beside the Playwright
 * output) and never judged (R-10). Waits are hang ceilings, not budgets. The ordering of events is made by awaited CLI calls and
 * route holds, never by sleeping.
 */
import { chromium, expect, type Browser, type Locator, type Page, type Request } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import path from 'node:path';
import { getTimelineLabelWidth } from '../../../src/tools/video-editor/lib/coordinate-utils.ts';
import { PREVIEW_SURFACE, calibrateRuler, seekRulerToFrame, type RulerSeek } from '../support/previewRuler.ts';
import { harnessUnavailableReason, type DirectHarness, type RenderSeed, type ThreeProductsSeed } from './support/harness.ts';
import { closeQuickBrowser, currentHead, editFirstTrackName, expectConnected, firstTrackName, holdTimelineSaves, openApp, openSeededTimeline, revisionBody, test as appTest, UI } from './support/app.ts';
import { AstridCli, astridUnavailableReason, contractDigest, realmDisagreements, revisionSet, type AstridCall, type AstridIdentity } from './support/astrid.ts';
import { centreCell, gridDifference, letterbox, matches, pictureGrid, MATCH, type GridDifference, type PictureGrid, type Rect } from './support/pictures.ts';

/** A hang ceiling for one wait (R-10): many times the usual time, never a budget. */
const CEILING = { timeout: 90_000 };
const SAVES = /\/timelines\/[^/]+\/composition-revisions$/;
const CONFLICT_TITLE = 'This timeline changed somewhere else';

const test = appTest.extend<object, { seed3: ThreeProductsSeed; astrid: AstridCli; quickAstrid: AstridCli; browser: Browser }>({
  // Installed Google Chrome, not the bundled Chromium: the render is H.264 and AAC, which only Chrome decodes. `channel` is
  // used alone (never with an executablePath, which would win over it), so a missing Chrome fails here, at launch, by name.
  browser: [async ({ harness }, use) => {
    if (process.env.ASTRID_QUICK_DESCRIPTOR) {
      // QUICK closes and verifies the browser's process group before F1 shuts the Runtime down.
      const browserServer = await chromium.launchServer({ channel: 'chrome', args: harness.chromiumArgs });
      let browser: Browser | undefined;
      try { browser = await chromium.connect(browserServer.wsEndpoint()); await use(browser); }
      finally { await closeQuickBrowser(browser, browserServer); }
    } else {
      const browser = await chromium.launch({ channel: 'chrome', args: harness.chromiumArgs });
      try { await use(browser); } finally { await browser.close(); }
    }
  }, { scope: 'worker' }],
  seed3: [async ({ harness }, use) => { await use(await harness.seedThreeProducts()); }, { scope: 'worker', timeout: 240_000 }],
  astrid: [async ({ harness, seed3 }, use) => {
    const astrid = await AstridCli.create(harness);
    journey.activeAstrid = astrid;
    journey.identity = await astrid.preflight();
    // The seed must be something Astrid accepts as it is (a real finding otherwise): check a fresh working copy of it, then drop it.
    await astrid.astrid(['timelines', 'checkout', seed3.timelineId, '--project', seed3.projectSlug, '--fresh', '--json']);
    await astrid.astrid(['timelines', 'check', seed3.timelineId, '--project', seed3.projectSlug, '--no-sweep']);
    await astrid.astrid(['timelines', 'discard', seed3.timelineId, '--project', seed3.projectSlug]);
    journey.preflightCalls = [...astrid.calls];
    await use(astrid);
  }, { scope: 'worker', timeout: 240_000 }],
  quickAstrid: [async ({ harness }, use) => {
    if (!harness.attachment) throw new Error('quick Astrid fixture requires ASTRID_QUICK_DESCRIPTOR');
    const astrid = await AstridCli.create(harness);
    journey.activeAstrid = astrid;
    journey.identity = await astrid.preflight();
    journey.preflightCalls = [...astrid.calls];
    await use(astrid);
  }, { scope: 'worker', timeout: 0 }],
});

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => {
  const reason = harnessUnavailableReason() ?? astridUnavailableReason();
  if (reason) throw new Error(`the three-products journey cannot run: ${reason}`);
});

// ---------------------------------------------------------------------------------------------
// The run summary (revision set, durations, load: reported, never judged)

interface CaseRecord {
  name: string;
  status: string;
  durationMs: number;
  loadAverageStart: number;
  loadAverageEnd: number;
  astridCalls: AstridCall[];
  facts: Record<string, unknown>;
}

const journey = {
  startedAt: new Date().toISOString(),
  loadAverageStart: loadavg(),
  identity: undefined as AstridIdentity | undefined,
  preflightCalls: [] as AstridCall[],
  cases: [] as CaseRecord[],
  activeAstrid: undefined as AstridCli | undefined,
  /** What the running case has learned that the summary should carry (named facts, never verdicts on speed). */
  facts: {} as Record<string, unknown>,
  caseStart: { at: 0, load: 0, calls: 0 },
};

test.beforeEach(() => {
  journey.facts = {};
  journey.caseStart = { at: Date.now(), load: loadavg()[0], calls: journey.activeAstrid?.calls.length ?? 0 };
});

// Playwright reads fixture dependencies from the destructuring pattern, so the empty pattern is required.
// eslint-disable-next-line no-empty-pattern
test.afterEach(async ({}, testInfo) => {
  const astrid = journey.activeAstrid;
  journey.cases.push({
    name: testInfo.title,
    status: testInfo.status ?? 'unknown',
    durationMs: testInfo.duration,
    loadAverageStart: journey.caseStart.load,
    loadAverageEnd: loadavg()[0],
    astridCalls: astrid?.calls.slice(journey.caseStart.calls) ?? [],
    facts: journey.facts,
  });
});

// Playwright reads fixture dependencies from the destructuring pattern, so the empty pattern is required.
// eslint-disable-next-line no-empty-pattern
test.afterAll(async ({}, testInfo) => {
  const outputDir = testInfo.project.outputDir;
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, 'three-products-summary.json'), JSON.stringify({
    startedAt: journey.startedAt,
    note: 'reported, never judged (testing plan R-10)',
    revisions: revisionSet(journey.identity),
    machine: { cpus: cpus().length, loadAverageStart: journey.loadAverageStart, loadAverageEnd: loadavg() },
    preflight: { astridCalls: journey.preflightCalls },
    cases: journey.cases,
  }, null, 2));
});

// ---------------------------------------------------------------------------------------------
// Helpers: what the Runtime holds, what the page was told, what the agent sees

/** JSON with sorted keys, so "equal" means the same data whatever the key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const timelineBase = (harness: DirectHarness, seed: Pick<ThreeProductsSeed, 'timelineId'>) => `/v1/projects/${harness.seed.projectId}/timelines/${seed.timelineId}`;

/** Every composition revision of the seeded timeline, newest first. */
async function allRevisions(harness: DirectHarness, seed: Pick<ThreeProductsSeed, 'timelineId'>): Promise<Array<{ revision_id: string; is_current_head: boolean }>> {
  const items: Array<{ revision_id: string; is_current_head: boolean }> = [];
  let cursor: string | null = null;
  do {
    const page: { status: number; body: any } = await harness.runtimeJson('GET', `${timelineBase(harness, seed)}/composition-revisions?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    expect(page.status, JSON.stringify(page.body)).toBe(200);
    items.push(...page.body.items);
    cursor = page.body.next_cursor ?? null;
  } while (cursor);
  return items;
}

/** The parent composition of a revision and the agent's shot content beneath it, read straight from the Runtime. */
async function revisionState(harness: DirectHarness, seed: ThreeProductsSeed, revisionId: string) {
  const parent = (await revisionBody(harness, revisionId)).payload;
  const occurrence = (parent.occurrences as Array<Record<string, any>>).find((candidate) => candidate.occurrence_id === seed.occurrenceId);
  expect(occurrence, `revision ${revisionId} keeps the agent's shot placement`).toBeTruthy();
  const shot = await harness.runtimeJson('GET', `/v1/projects/${harness.seed.projectId}/shots/${seed.shotId}/revisions/${occurrence!.shot_revision_id}`);
  expect(shot.status, JSON.stringify(shot.body)).toBe(200);
  const inner = await harness.runtimeJson('GET', `${timelineBase(harness, seed)}/revisions/${(shot.body as any).internal_timeline_revision_id}`);
  expect(inner.status, JSON.stringify(inner.body)).toBe(200);
  const payload = (inner.body as any).payload;
  return {
    revisionId,
    parent,
    trackLabel: (parent.config.tracks as Array<Record<string, any>>).find((track) => track.id === 'V1')?.label as string | undefined,
    parentClips: Object.fromEntries((parent.clips as Array<Record<string, any>>).map((clip) => [clip.id, clip])) as Record<string, Record<string, any>>,
    shotClips: Object.fromEntries((payload.clips as Array<Record<string, any>>).map((clip) => [clip.id, clip])) as Record<string, Record<string, any>>,
    shotRegistry: payload.registry.assets as Record<string, Record<string, any>>,
    internalRevisionId: (shot.body as any).internal_timeline_revision_id as string,
  };
}

/** The opaque data neither client models is the seed's, unchanged, in the seed and in every later revision (the App's saves and the agent's alike). */
async function expectOpaqueDataKept(harness: DirectHarness, seed: ThreeProductsSeed) {
  const revisions = await allRevisions(harness, seed);
  const seedAt = revisions.findIndex((revision) => revision.revision_id === seed.headRevisionId);
  expect(seedAt, 'the seed revision is in the history').toBeGreaterThanOrEqual(0);
  for (const revision of revisions.slice(0, seedAt + 1)) {
    const state = await revisionState(harness, seed, revision.revision_id);
    expect(canonical(state.parent.config.x_f2_opaque), `config.x_f2_opaque in ${revision.revision_id}`).toBe(canonical(seed.opaque.config));
    expect(canonical(state.shotClips[seed.agentClipId].app?.f2Opaque), `${seed.agentClipId}.app.f2Opaque in ${revision.revision_id}`).toBe(canonical(seed.opaque.clip));
  }
  return revisions.length;
}

/** The agent's verbs, as the CLI ships them, on one timeline (the seeded one, or the render journey's). */
function agentOf(astrid: AstridCli, seed: { timelineId: string; projectSlug: string }) {
  const common = [seed.timelineId, '--project', seed.projectSlug];
  return {
    checkout: () => astrid.astrid(['timelines', 'checkout', ...common, '--fresh', '--json']),
    edit: (...flags: string[]) => astrid.astrid(['timelines', 'edit', ...common, ...flags]),
    publish: async (message: string, idempotencyKey: string) => {
      const envelope = await astrid.json<{ new_head: string; old_head: string; idempotency_key: string; published?: boolean }>(['timelines', 'publish', ...common, '-m', message, '--idempotency-key', idempotencyKey, '--json']);
      expect(envelope.ok, JSON.stringify(envelope)).toBe(true);
      return envelope.data!;
    },
    status: async () => (await astrid.json<{ current_head: string }>(['timelines', 'status', ...common, '--json'])).data!,
    show: async () => (await astrid.json<{ head_revision_id: string; rows: Array<{ layers: Array<{ clip_id: string; asset: string | null }> }> }>(['timelines', 'show', ...common, '--published', '--json'])).data!,
  };
}

/** A credential never reaches the page: not in a request, a door answer, the DOM, or the page's storage. */
class TokenSniff {
  private readonly pending: Array<Promise<void>> = [];
  private readonly leaks: string[] = [];

  constructor(private readonly tokens: Record<string, string>) {}

  private scan(where: string, text: string | null | undefined) {
    if (!text) return;
    for (const [name, token] of Object.entries(this.tokens)) if (text.includes(token)) this.leaks.push(`${name} token in ${where}`);
  }

  attach(page: Page) {
    page.on('request', (request: Request) => {
      this.pending.push((async () => {
        const headers = await request.allHeaders().catch(() => request.headers());
        this.scan(`the URL of ${request.method()} ${request.url().split('?')[0]}`, request.url());
        this.scan(`the headers of ${request.method()} ${request.url().split('?')[0]}`, JSON.stringify(headers));
        this.scan(`the body of ${request.method()} ${request.url().split('?')[0]}`, request.postData());
      })());
    });
    page.on('response', (response) => {
      const type = response.headers()['content-type'] ?? '';
      if (!/json|text/.test(type) || !response.url().includes(`:${new URL(response.url()).port}/api/`)) return;
      this.pending.push(response.text().then((text) => this.scan(`the answer to ${response.request().method()} ${response.url().split('?')[0]}`, text)).catch(() => {}));
    });
  }

  async expectClean(page: Page) {
    await Promise.all(this.pending);
    const inPage = await page.evaluate(() => JSON.stringify({
      dom: document.documentElement.outerHTML,
      local: Object.fromEntries(Object.entries(window.localStorage)),
      session: Object.fromEntries(Object.entries(window.sessionStorage)),
      cookie: document.cookie,
    }));
    this.scan('the page (DOM, storage, cookies)', inPage);
    expect(this.leaks, 'no credential reached the page').toEqual([]);
  }
}

/** The credentials in play: the App's, Astrid's, and the Runtime's owner and worker credentials (none belongs in a page). */
function secretsOf(harness: DirectHarness, astrid: AstridCli): Record<string, string> {
  const fromFile = (file: string) => {
    const text = readFileSync(file, 'utf8').trim();
    try { const parsed = JSON.parse(text); return typeof parsed.token === 'string' ? parsed.token : text; } catch { return text; }
  };
  return {
    product: harness.productToken,
    astrid: astrid.secret,
    owner: fromFile(path.join(harness.supportDir, 'credentials', 'owner.token')),
    worker: fromFile(harness.discovery().worker_credential_file),
  };
}

/**
 * The three products are talking to the same Runtime: the realm and instance the harness made, the page's health and realm
 * (fetched from inside the page, through the door) and Astrid's handshake all agree, and so do the contract digests of the App,
 * of Astrid and of the Runtime. Returns what each saw, for the summary.
 */
async function expectSameRealm(page: Page, harness: DirectHarness, astrid: AstridCli) {
  const fromPage = await page.evaluate(async (base) => {
    const [health, realm] = await Promise.all([fetch(`${base}/v1/health`), fetch(`${base}/v1/realm`)]);
    return { health: await health.json(), realm: await realm.json() };
  }, harness.doorBase);
  const fromAstrid = await astrid.identity();
  const digest = contractDigest();
  expect([
    ...realmDisagreements('the page', { realm_id: fromPage.realm.realm_id, runtime_instance_id: fromPage.health.runtime_instance_id, schema_digest: fromPage.health.schema_digest }, harness, digest),
    ...realmDisagreements('Astrid', fromAstrid, harness, digest),
  ], 'the page, Astrid and the Runtime share one realm, instance and contract').toEqual([]);
  return { realmId: fromPage.realm.realm_id as string, runtimeInstanceId: fromPage.health.runtime_instance_id as string, schemaDigest: fromPage.health.schema_digest as string, astridFile: fromAstrid.astrid_file };
}

/** The transition control of the clip panel, found by its label (the panel's selects carry no accessible name). */
const transitionSelect = (page: Page): Locator => page.getByText('Transition', { exact: true }).locator('xpath=following::*[@role="combobox"][1]');

async function selectClip(page: Page, clipId: string) {
  await page.locator(`[data-clip-id="${clipId}"]`).first().click();
}

async function setTransitionToNone(page: Page, clipId: string) {
  await selectClip(page, clipId);
  await transitionSelect(page).click();
  await page.getByRole('option', { name: 'None', exact: true }).click();
  await expect(transitionSelect(page)).toContainText('None');
}

/** Opens the App's action pane, where the runtime activity dock lives (it slides away until opened). */
async function openActionPane(page: Page) {
  await page.getByRole('button', { name: /^Open Action pane/ }).click();
  await expect(page.locator('[data-runtime-activity-dock]')).toBeVisible();
}

/** What the page was told by the Runtime: the answers it received, keyed by what they are. */
function watchPageReads(page: Page, harness: DirectHarness) {
  const reads = { eventFeed: [] as Array<{ aggregate_type: string; aggregate_id: string; event_type: string }>, urls: [] as string[], internalRevisions: [] as Array<{ id: string; payload: any }>, compositionRevisions: [] as Array<{ id: string; payload: any }> };
  page.on('response', (response) => {
    const url = response.url();
    if (!url.startsWith(harness.doorBase) || response.request().method() !== 'GET' || response.status() !== 200) return;
    const route = url.slice(harness.doorBase.length);
    reads.urls.push(route);
    if (route.startsWith('/v1/events')) {
      void response.json().then((body) => { for (const item of body.items ?? []) reads.eventFeed.push({ aggregate_type: item.aggregate_type, aggregate_id: item.aggregate_id, event_type: item.event_type }); }).catch(() => {});
    } else if (/\/composition-revisions\/[^/?]+$/.test(route)) {
      void response.json().then((body) => { reads.compositionRevisions.push({ id: body.revision_id, payload: body.payload }); }).catch(() => {});
    } else if (/\/timelines\/[^/]+\/revisions\/[^/?]+$/.test(route)) {
      void response.json().then((body) => { reads.internalRevisions.push({ id: body.revision_id, payload: body.payload }); }).catch(() => {});
    }
  });
  return reads;
}

const noReloadFlag = (page: Page) => page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload);

async function plantNoReloadFlag(page: Page) {
  await page.evaluate(() => { (window as unknown as { __noReload: boolean }).__noReload = true; });
}

// ---------------------------------------------------------------------------------------------
// 1. agent -> open App

test('agent -> open App: an Astrid task and its publication appear in the open App without a reload', async ({ page, harness, astrid, seed3 }) => {
  const agent = agentOf(astrid, seed3);
  const sniff = new TokenSniff(secretsOf(harness, astrid));
  sniff.attach(page);
  const reads = watchPageReads(page, harness);

  await openApp(page, harness);
  await expectConnected(page);
  await openSeededTimeline(page, harness);
  await plantNoReloadFlag(page);
  await openActionPane(page);
  journey.facts.sameRealm = await expectSameRealm(page, harness, astrid);

  // The agent registers an executor and admits a task. The page learns of it from the Runtime's event feed, not from a reload.
  await astrid.host({ register: true });
  const created = await astrid.json<{ task_id: string }>(['tasks', 'create', '--project', seed3.projectSlug, '--capability', 'f2.marker', '--spec', '{}', '--json']);
  expect(created.ok, JSON.stringify(created)).toBe(true);
  const taskId = created.data!.task_id;
  const row = page.locator(`[data-activity-task-id="${taskId}"]`);
  await expect(row).toHaveAttribute('aria-label', /^F2 Marker, (Queued|Ready)$/, CEILING);
  await expect.poll(() => reads.eventFeed, { message: 'the page was told by the event feed', ...CEILING }).toContainEqual(expect.objectContaining({ aggregate_type: 'task', aggregate_id: taskId }));

  // The executor runs it: the task leaves the active rows and is listed as complete.
  const ran = await astrid.host({ runOnce: true });
  expect(ran).toMatchObject({ task_id: taskId, state: 'succeeded' });
  const output = ran.outputs?.find((candidate) => candidate.name === 'marker');
  expect(output, 'the task produced its marker image').toBeTruthy();
  await expect(row).toHaveCount(0, CEILING);
  await page.getByRole('button', { name: 'Peek at tasks' }).click();
  await expect(page.locator('[data-task-peek-surface="tasks"]').filter({ hasText: 'F2 Marker' }).getByText('Complete', { exact: true })).toBeVisible(CEILING);
  const settled = await astrid.json<{ state: string }>(['tasks', 'show', taskId, '--project', seed3.projectSlug, '--json']);
  expect(settled.data!.state, 'the Runtime agrees the task succeeded').toBe('succeeded');

  // The agent publishes the timeline with the task's output; the open page adopts that revision by itself.
  const before = await currentHead(harness);
  await agent.checkout();
  await agent.edit('--clip', seed3.agentClipId, '--swap-asset', `${seed3.markerAssetKey}=task:${taskId}/marker#0`);
  const published = await agent.publish('agent: marker', 'f2-case1');
  expect(published.old_head, 'the agent built on the head the App has').toBe(before);
  expect(published.new_head).not.toBe(before);
  expect(await currentHead(harness), 'the Runtime head is the agent\'s revision').toBe(published.new_head);

  await expect.poll(() => reads.urls.some((url) => url.includes(`/composition-revisions/${published.new_head}`)), CEILING).toBe(true);
  await expect.poll(() => reads.internalRevisions.some((revision) => revision.payload?.registry?.assets?.[seed3.markerAssetKey]), CEILING).toBe(true);
  const adopted = reads.internalRevisions.find((revision) => revision.payload?.registry?.assets?.[seed3.markerAssetKey])!;
  expect(adopted.payload.registry.assets[seed3.markerAssetKey].media_id, 'the page received the revision that carries the task\'s output').toBe(output!.object_id);
  expect(await noReloadFlag(page), 'the page was never reloaded').toBe(true);

  // The Runtime holds the same data: the revision is the task's work, and the agent's edit kept what neither client models.
  const state = await revisionState(harness, seed3, published.new_head);
  expect(state.shotRegistry[seed3.markerAssetKey].media_id).toBe(output!.object_id);
  expect(state.shotClips[seed3.agentClipId].asset).toBe(seed3.markerAssetKey);
  expect((await agent.show()).head_revision_id, 'the agent reads the head it published').toBe(published.new_head);
  // The App's next save is built on the agent's head, and the Runtime accepts it (the parent-head check of the retired handoff case).
  const appSaved = page.waitForResponse((response) => response.request().method() === 'POST' && SAVES.test(new URL(response.url()).pathname), CEILING);
  await editFirstTrackName(page, 'F2 App after agent');
  const appSave = await appSaved;
  expect(appSave.status(), 'the Runtime accepts the App\'s save on the agent\'s head').toBe(200);
  expect(appSave.request().postDataJSON().expected_head, 'the App built its save on the agent\'s head').toBe(published.new_head);
  await expect.poll(() => currentHead(harness), CEILING).not.toBe(published.new_head);
  const appRevision = await currentHead(harness);
  expect(await noReloadFlag(page), 'the page was still not reloaded after its own save').toBe(true);

  // The agent reads the App's save made on top of its own publication.
  expect((await agent.status()).current_head, 'the agent reads the App\'s revision').toBe(appRevision);

  const revisionCount = await expectOpaqueDataKept(harness, seed3);

  journey.facts = { ...journey.facts, taskId, outputObjectId: output!.object_id, agentRevision: published.new_head, appRevision, revisionCount };
  await sniff.expectClean(page);
});

// ---------------------------------------------------------------------------------------------
// 2. concurrent edit

/**
 * One outcome today, and the App picks it: a named conflict that keeps the draft.
 *
 * The App's save A commits at the Runtime but its acknowledgement is lost (the held response is aborted as a connection reset).
 * While it is unacknowledged the agent publishes B on top of A, and the App edits again (C).
 * Then the App's own transport retry replays A with the same idempotency key, and the Runtime returns the stored receipt
 * (new_head = A). From there one of two things happens, depending on whether a head poll that queued up during the hold ran
 * before the 500 ms retry; this test records which and asserts neither:
 *   (a) the provider's cached head has already moved to B, so it refuses the confirmed receipt ("The save was confirmed, but
 *       the timeline has since changed", dataProvider.ts:869-879); or
 *   (b) the receipt is accepted and the queued edit C is posted on head A, where the Runtime answers 409 stale_head
 *       (useTimelinePersistence.ts:700-721, service.py:3129-3134).
 * Both raise TimelineVersionConflictError, which opens "This timeline changed somewhere else" and freezes autosave
 * (useTimelinePersistence.ts:402-406, 806-833; useTimelineRealtime.ts:23-27). The merge is not reachable: B4 removed the path that
 * rebased onto the head and re-posted, and nothing in the App rebases a local draft onto another writer's head
 * (dataProvider.ts:766-773, 869-879). If a later App change merges here, that is a deliberate update to this test (R-7).
 */
test('concurrent edit: the App\'s acknowledgement is lost, the agent publishes, the App edits again; the App names the conflict and keeps its draft', async ({ page, harness, astrid, seed3 }) => {
  const agent = agentOf(astrid, seed3);
  const sniff = new TokenSniff(secretsOf(harness, astrid));
  sniff.attach(page);
  const watched = watchPageReads(page, harness);

  // Every save the page sends, with the key and head it names and what became of it.
  interface Post { key: string; expectedHead: string | null; status: number | null; outcome: 'held' | 'sent' | 'lost' }
  const posts: Post[] = [];
  const postOf = new Map<Request, Post>();
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !SAVES.test(new URL(request.url()).pathname)) return;
    const post: Post = { key: request.headers()['idempotency-key'], expectedHead: JSON.parse(request.postData() ?? '{}').expected_head ?? null, status: null, outcome: 'sent' };
    postOf.set(request, post);
    posts.push(post);
  });
  page.on('response', (response) => { const post = postOf.get(response.request()); if (post) post.status = response.status(); });
  page.on('requestfailed', (request) => { const post = postOf.get(request); if (post) post.outcome = 'lost'; });

  // Hold the acknowledgement, not the request: the Runtime commits the save, the page never hears back.
  let holding = true;
  const held: Array<{ route: Parameters<Parameters<Page['route']>[1]>[0]; post: Post }> = [];
  await page.route(SAVES, async (route) => {
    const request = route.request();
    if (!holding || request.method() !== 'POST') return route.fallback();
    const post = postOf.get(request)!;
    const response = await route.fetch();
    post.status = response.status();
    post.outcome = 'held';
    held.push({ route, post });
  });

  await openApp(page, harness);
  await expectConnected(page);
  await openSeededTimeline(page, harness);
  journey.facts.sameRealm = await expectSameRealm(page, harness, astrid);
  const baseHead = await currentHead(harness);
  const revisionsBefore = (await allRevisions(harness, seed3)).length;

  // A: the App renames the track. The Runtime commits it; the acknowledgement is held.
  await editFirstTrackName(page, 'F2 App A');
  await expect.poll(() => held.length, CEILING).toBe(1);
  expect(held[0].post.status, 'the Runtime committed A').toBe(200);
  expect(held[0].post.expectedHead).toBe(baseHead);
  const keyA = held[0].post.key;
  await expect.poll(() => currentHead(harness), CEILING).not.toBe(baseHead);
  const headA = await currentHead(harness);
  expect(headA, 'the App\'s save is stored under its idempotency key').toBe(keyA);

  // B: the agent builds on A and publishes (it extends one clip and clears another one's asset).
  await agent.checkout();
  const stateA = await revisionState(harness, seed3, headA);
  await agent.edit('--clip', seed3.agentClipId, '--extend', '1');
  await agent.edit('--clip', seed3.agentClearClipId, '--clear-asset');
  const published = await agent.publish('agent: extend and clear', 'f2-case2');
  expect(published.old_head, 'the agent built on the App\'s save').toBe(headA);
  const headB = published.new_head;
  expect(await currentHead(harness)).toBe(headB);

  // C: the App edits again while A is unacknowledged (it clears a transition).
  await setTransitionToNone(page, seed3.transitionClipId);

  // The acknowledgement is lost: the page sees a connection reset, and its own retry follows.
  holding = false;
  await held[0].route.abort('connectionreset');

  const conflict = page.getByRole('alertdialog', { name: CONFLICT_TITLE });
  await expect(conflict).toBeVisible(CEILING);
  await expect(conflict.getByText('Keep your changes, or switch to the latest version.')).toBeVisible();
  await expect(conflict.getByRole('button', { name: 'Keep my changes' })).toBeVisible();
  await expect(conflict.getByRole('button', { name: 'Use latest version' })).toBeVisible();
  await page.unroute(SAVES);

  // Which of the two ways to the conflict ran (recorded, not asserted).
  const afterRelease = posts.slice(1);
  const queuedEditPosted = afterRelease.find((post) => post.expectedHead === headA && post.key !== keyA);
  const branch = queuedEditPosted ? 'b: the receipt was accepted, the queued edit was posted on A and the Runtime answered 409 stale_head' : 'a: the provider refused the confirmed receipt after its cached head moved to B';
  test.info().annotations.push({ type: 'case-2-branch', description: branch });
  journey.facts = { ...journey.facts, verdict: 'named_conflict', branch, posts: posts.map(({ expectedHead, status, outcome }, index) => ({ n: index + 1, expectedHead: expectedHead === null ? null : expectedHead === baseHead ? 'base head' : expectedHead === headA ? 'A' : expectedHead, status, outcome, sameKeyAsA: posts[index].key === keyA })) };

  // The draft is kept: the dialog is modal, so the editor behind it is hidden from the accessibility tree but still holds A and C.
  await expect(page.getByRole('textbox', { name: 'Track name', includeHidden: true }).first()).toHaveValue('F2 App A');
  await expect(transitionSelect(page)).toContainText('None');

  // The Runtime head is B and holds A and B, and not C.
  expect(await currentHead(harness), 'nothing was published after B').toBe(headB);
  const stateB = await revisionState(harness, seed3, headB);
  expect(stateB.trackLabel, 'B holds the App\'s save A').toBe('F2 App A');
  expect(stateB.shotClips[seed3.agentClipId].hold, 'B holds the agent\'s extension').toBe(stateA.shotClips[seed3.agentClipId].hold + 1);
  expect(stateB.shotClips[seed3.agentClearClipId].asset, 'B holds the agent\'s clear').toBeUndefined();
  expect(stateA.shotClips[seed3.agentClearClipId].asset, 'A still had that asset').toBeTruthy();
  expect(stateB.parentClips[seed3.transitionClipId].transition, 'C was never published').toEqual(stateA.parentClips[seed3.transitionClipId].transition);
  expect(stateB.parentClips[seed3.transitionClipId].transition).toBeTruthy();

  // One publication per retried save: A was replayed under its own key and made exactly one revision; the agent's publication made one.
  const revisions = (await allRevisions(harness, seed3)).map((revision) => revision.revision_id);
  expect(revisions.length, 'two new revisions: A and B').toBe(revisionsBefore + 2);
  expect(new Set(revisions).size, 'no revision is stored twice').toBe(revisions.length);
  expect(revisions.filter((id) => id === keyA), 'A\'s key names exactly one revision').toHaveLength(1);
  expect(posts.filter((post) => post.key === keyA).length, 'A was replayed with the same key').toBeGreaterThanOrEqual(2);
  expect(posts.filter((post) => post.expectedHead === baseHead).every((post) => post.key === keyA), 'every send on the base head is A\'s').toBe(true);

  // Opaque data and clears, in every revision.
  await expectOpaqueDataKept(harness, seed3);

  // Both clients agree after a reload: the App reads head B and shows A; the agent reads B.
  const readsBeforeReload = watched.urls.length;
  await page.reload();
  await expectConnected(page);
  await openSeededTimeline(page, harness);
  await expect(firstTrackName(page)).toHaveValue(stateB.trackLabel!);
  await expect.poll(() => watched.urls.slice(readsBeforeReload).some((url) => url.includes(`/composition-revisions/${headB}`)), CEILING).toBe(true);
  await selectClip(page, seed3.transitionClipId);
  await expect(transitionSelect(page)).toContainText('crossfade');
  expect((await agent.status()).current_head).toBe(headB);
  const shown = await agent.show();
  expect(shown.head_revision_id).toBe(headB);
  const layers = shown.rows.flatMap((row) => row.layers);
  expect(layers.find((layer) => layer.clip_id === seed3.agentClearClipId)?.asset, 'the agent sees the clear').toBeNull();
  journey.facts.headB = headB;
  await sniff.expectClean(page);
});

// ---------------------------------------------------------------------------------------------
// 2b. render R, publish R+1 before it runs (F2 steps 3 and 4)

/** The three moments compared: frames near 1 s, 3 s (the middle of the agent's slot) and 5 s of the 6 s film. */
const SAMPLE_SECONDS = [1, 3, 5] as const;

/** A task row, whichever envelope the door answers it in. */
const dataOf = (body: any) => body?.data ?? body;

/** What the preview showed at a moment: where the playhead observed itself, and the picture. */
interface PreviewShot { seconds: number; seek: RulerSeek; png: Buffer; surface: { width: number; height: number }; composition: Rect }

/**
 * The editor's preview at the playhead. The preview's own evidence is what is waited on: each decoded video clip exposes the
 * player frame that was current when its decoder last drew (`data-preview-presented-frame`, ReadinessVideo), so the capture
 * starts when a clip has presented the frame the ruler click asked for. There is no quiet period and no frame counting.
 */
async function capturePreview(page: Page, seconds: number, seek: RulerSeek, outputDir: string, name: string): Promise<PreviewShot> {
  const surface = page.locator(PREVIEW_SURFACE);
  await expect(surface.locator(`[data-preview-presented-frame="${seek.observedFrame}"]`), `a clip of the preview presented frame ${seek.observedFrame} for ${name}`).toBeAttached(CEILING);
  // The composition box is Remotion's player element: the surface also holds the bars around it.
  const geometry = await surface.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const player = element.querySelector('.__remotion-player');
    if (!player) throw new Error('the preview surface has no .__remotion-player');
    const inner = player.getBoundingClientRect();
    return { surface: { width: box.width, height: box.height }, composition: { x: inner.left - box.left, y: inner.top - box.top, width: inner.width, height: inner.height } };
  });
  // The preview's overlay (timeline picker, time, Render) and the transport buttons lie over the picture; the picture is what is compared.
  const png = await surface.screenshot({
    animations: 'disabled',
    style: '[data-video-editor-shell-region="preview"] > [data-shell-interaction="true"], .astrid-preview-transport { visibility: hidden !important; }',
    path: path.join(outputDir, `${name}.png`),
  });
  return { seconds, seek, png, ...geometry };
}

/** The finished film's player: seek to a moment, wait for its frame, and take the element's picture (without the native control bar, which lies over it). */
async function captureFilm(player: Locator, atSeconds: number, outputDir: string, name: string) {
  await expect.poll(() => player.evaluate((video: HTMLVideoElement) => video.readyState), { message: 'the player has loaded its metadata', ...CEILING }).toBeGreaterThanOrEqual(1);
  const presented = await player.evaluate((video: HTMLVideoElement, at: number) => new Promise<{ mediaTime: number }>((resolve, reject) => {
    if (Math.abs(video.currentTime - at) < 1e-6) { reject(new Error('the player is already at the moment to sample: no seek, so no new frame')); return; }
    video.pause();
    video.controls = false;
    let seeked = false;
    let frame: { mediaTime: number } | null = null;
    const finish = () => { if (seeked && frame) resolve(frame); };
    // The callback is registered before the seek: a paused video presents nothing until the seek's frame.
    video.requestVideoFrameCallback((_now, metadata) => { frame = { mediaTime: metadata.mediaTime }; finish(); });
    video.addEventListener('seeked', () => { seeked = true; finish(); }, { once: true });
    video.currentTime = at;
  }), atSeconds);
  const geometry = await player.evaluate((video: HTMLVideoElement) => {
    const box = video.getBoundingClientRect();
    return { box: { width: box.width, height: box.height }, natural: { width: video.videoWidth, height: video.videoHeight } };
  });
  const png = await player.screenshot({ animations: 'disabled', path: path.join(outputDir, `${name}.png`) });
  return { png, mediaTime: presented.mediaTime, ...geometry, picture: letterbox(geometry.natural, geometry.box) };
}

const rounded = (difference: GridDifference) => ({ meanPerChannel: difference.meanPerChannel.map((value) => Number(value.toFixed(2))), worstCell: Number(difference.worstCell.toFixed(2)) });

test('render R, publish R+1 before it runs: the render is R\'s, it plays, and it is the film the App showed', async ({ page, harness, astrid }, testInfo) => {
  const sniff = new TokenSniff(secretsOf(harness, astrid));
  sniff.attach(page);
  const reads = watchPageReads(page, harness);
  const outputDir = path.join(testInfo.outputDir, 'render-journey');
  mkdirSync(outputDir, { recursive: true });
  await page.setViewportSize({ width: 1600, height: 1000 });

  // This browser plays what the render is: H.264 High 4.0 and AAC-LC in MP4. Without that the case could not tell a bad film from a browser that cannot play it.
  const codecs = await page.evaluate(() => ({
    h264: document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"'),
    aac: document.createElement('audio').canPlayType('audio/mp4; codecs="mp4a.40.2"'),
  }));
  expect(codecs.h264, 'this browser must play H.264 High 4.0 (avc1.640028); the journey runs in installed Chrome').toBe('probably');
  expect(codecs.aac, 'this browser must play AAC-LC (mp4a.40.2); the journey runs in installed Chrome').toBe('probably');

  const render = await harness.seedRenderTimeline();
  const agent = agentOf(astrid, render);
  const timeline = { fps: render.fps, startLeft: getTimelineLabelWidth('desktop'), lastClipSelector: render.occurrenceBlockSelector };
  const filmResponses: Array<{ url: string; status: number; contentRange: string | null }> = [];
  page.on('response', (response) => {
    if (response.url().includes('/v1/objects/')) filmResponses.push({ url: response.url(), status: response.status(), contentRange: response.headers()['content-range'] ?? null });
  });
  const renderBlockers = page.locator('[data-video-editor-render-blocker]');
  const player = page.getByRole('dialog', { name: 'Rendered film' }).getByTestId('timeline-render-player');

  let revisionR = '';
  let revisionR1 = '';
  let taskId = '';
  const previewShots: PreviewShot[] = [];
  let negative: PreviewShot | undefined;

  await test.step('3 render R, publish R+1 before the render runs: the render is R\'s', async () => {
    // a. One worker hosts the marker and the renderer. Remotion is not provisioned here, and rendering.render is still ready.
    await astrid.host({ register: true, render: true });
    const catalog = await harness.runtimeJson('GET', '/v1/capabilities?limit=200');
    expect(catalog.status, JSON.stringify(catalog.body)).toBe(200);
    const row = (catalog.body as any).items.find((item: any) => item.capability_id === 'rendering.render');
    expect(row, 'the Runtime lists rendering.render').toBeTruthy();
    expect({ status: row.status, unavailable_reason: row.unavailable_reason }, 'rendering.render is ready on a host without Remotion').toEqual({ status: 'ready', unavailable_reason: null });

    // The App is open on the render timeline before the agent publishes, so that it can adopt R by itself.
    await openApp(page, harness);
    await expectConnected(page);
    await openSeededTimeline(page, harness);
    journey.facts.sameRealm = await expectSameRealm(page, harness, astrid);
    await page.getByRole('combobox', { name: 'Select timeline' }).click();
    await page.getByRole('option', { name: render.timelineName }).click();
    await expect(page.getByRole('combobox', { name: 'Select timeline' })).toContainText(render.timelineName);
    await expect(page.locator(render.occurrenceBlockSelector)).toBeVisible(CEILING);
    await plantNoReloadFlag(page);

    // b. The marker is a task's output: a 2 s clip of the fixed marker colour (the one case 1 makes in this realm too), so what the film shows at 3 s is its own, not the grey placeholder's.
    const created = await astrid.json<{ task_id: string }>(['tasks', 'create', '--project', render.projectSlug, '--capability', 'f2.marker', '--spec', '{}', '--json']);
    expect(created.ok, JSON.stringify(created)).toBe(true);
    const markerTask = created.data!.task_id;
    const ran = await astrid.host({ runOnce: true, render: true });
    expect(ran).toMatchObject({ task_id: markerTask, state: 'succeeded' });
    const clip = ran.outputs?.find((candidate) => candidate.name === 'marker_clip');
    expect(clip, 'the task produced its marker clip').toBeTruthy();
    expect(clip!.ordinal, 'and the Runtime numbered it').toEqual(expect.any(Number));

    // c. The agent fills the slot with it and publishes R. The open App adopts R by itself.
    await agent.checkout();
    await agent.edit('--clip', render.slotClipId, '--swap-asset', `${render.markerAssetKey}=task:${markerTask}/marker_clip#${clip!.ordinal}`);
    const publishedR = await agent.publish('agent: marker clip in the slot', 'f2-render-r');
    expect(publishedR.old_head, 'R builds on the seed').toBe(render.headRevisionId);
    revisionR = publishedR.new_head;
    await expect.poll(() => reads.urls.some((url) => url.includes(`/composition-revisions/${revisionR}`)), { message: 'the App read R', ...CEILING }).toBe(true);
    expect(await noReloadFlag(page), 'the App adopted R without a reload').toBe(true);

    // d. What the App's preview shows near 1 s, 3 s and 5 s: the playhead's own observed time, and the picture.
    const calibration = await calibrateRuler(page, timeline);
    for (const seconds of SAMPLE_SECONDS) {
      const seek = await seekRulerToFrame(page, calibration, seconds * render.fps, render.fps, `${seconds} s`);
      expect(seek.observedFrame, `the playhead reached the frame at ${seconds} s`).toBe(seconds * render.fps);
      if (seconds === 3) await expect(page.locator(`${PREVIEW_SURFACE} [data-preview-decoded-frame="true"][data-preview-media-src*="${encodeURIComponent(clip!.object_id)}"]`)).toBeAttached(CEILING);
      previewShots.push(await capturePreview(page, seconds, seek, outputDir, `preview-${seconds}s-R`));
    }
    await expect(renderBlockers, 'no blocker is shown: the Runtime\'s seam check only advises render admission, whatever the cuts at 2 s and 4 s').toHaveCount(0);

    // e. Render. No host is running, so the task is admitted and waits; the order is made by the setup, not by timing.
    const admitted = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/v1/tasks') && response.request().postDataJSON()?.capability_id === 'rendering.render', CEILING);
    await page.getByRole('button', { name: 'Render', exact: true }).click();
    const admission = await admitted;
    expect(admission.status(), await admission.text()).toBeLessThan(300);
    const admittedBody = dataOf(await admission.json());
    taskId = admittedBody.task_id ?? admittedBody.task?.id;
    expect(taskId, 'the App\'s render request named a task').toBeTruthy();
    expect(admission.request().postDataJSON().spec.params, 'the App leaves the renderer to the host').not.toHaveProperty('selector');
    await expect(renderBlockers).toHaveCount(0);

    // f. Before the render can run, the agent puts the placeholder back and publishes R+1 on R. The App adopts R+1; its preview is the negative control.
    const eventsBefore = await harness.runtimeJson('GET', '/v1/events?limit=200');
    expect(eventsBefore.status, JSON.stringify(eventsBefore.body)).toBe(200);
    await agent.checkout();
    await agent.edit('--clip', render.slotClipId, '--swap-asset', `f2-render-grey=${render.placeholder.digest}`);
    const publishedR1 = await agent.publish('agent: placeholder back in the slot', 'f2-render-r1');
    expect(publishedR1.old_head, 'R+1 builds on R').toBe(revisionR);
    revisionR1 = publishedR1.new_head;
    expect(revisionR1).not.toBe(revisionR);
    await expect.poll(() => reads.urls.some((url) => url.includes(`/composition-revisions/${revisionR1}`)), { message: 'the App read R+1', ...CEILING }).toBe(true);
    // Same zoom, same film length: the calibration made for R still maps the ruler to time.
    const seekAfter = await seekRulerToFrame(page, calibration, 3 * render.fps, render.fps, '3 s on R+1');
    await expect(page.locator(`${PREVIEW_SURFACE} [data-preview-decoded-frame="true"][data-preview-media-src*="${encodeURIComponent(render.placeholder.objectId)}"]`)).toBeAttached(CEILING);
    await expect(page.locator(`${PREVIEW_SURFACE} [data-preview-media-src*="${encodeURIComponent(clip!.object_id)}"]`), 'the marker clip is gone from the preview').toHaveCount(0);
    negative = await capturePreview(page, 3, seekAfter, outputDir, 'preview-3s-R1');
    Object.assign(journey.facts, { taskId, revisionR, revisionR1 });

    // g. Now the host runs. It claims the task the App admitted.
    const rendered = await astrid.host({ runOnce: true, render: true });
    expect(rendered, 'the host rendered the task the App admitted').toMatchObject({ task_id: taskId, state: 'succeeded' });

    // h. The Runtime's record: the render is R's, the host chose its renderer, and R, the admission and R+1 happened in that order.
    const task = await harness.runtimeJson('GET', `/v1/tasks/${taskId}`);
    expect(task.status, JSON.stringify(task.body)).toBe(200);
    const record = dataOf(task.body);
    const authority = record.spec.spec.inputs.timeline_authority;
    expect(authority.parent_revision_id, 'the render is pinned to R').toBe(revisionR);
    expect(authority.parent_revision_id, 'and not to R+1').not.toBe(revisionR1);
    expect(record.result.renderer_selection, 'the host chose ffmpeg because Remotion is not available').toMatchObject({ selector: 'rendering.ffmpeg', chosen_by: 'host', remotion_ok: false });
    journey.facts.rendererSelection = record.result.renderer_selection;
    const history = (await allRevisions(harness, render)).map((revision) => revision.revision_id);
    expect(history.indexOf(revisionR1), 'R+1 is newer than R in the Runtime\'s history').toBeLessThan(history.indexOf(revisionR));
    expect(history.indexOf(revisionR), 'R is newer than the seed').toBeLessThan(history.indexOf(render.headRevisionId));
    const feed = await harness.runtimeJson('GET', `/v1/events?aggregate_id=${encodeURIComponent(taskId)}&limit=200`);
    expect(feed.status, JSON.stringify(feed.body)).toBe(200);
    const admissionSequence = Math.min(...((feed.body as any).items as Array<{ sequence: number }>).map((event) => event.sequence));
    const latestBeforeR1 = Math.max(...((eventsBefore.body as any).items as Array<{ sequence: number }>).map((event) => event.sequence));
    expect(admissionSequence, 'the task was admitted before the agent published R+1 (the event feed\'s latest sequence at that moment)').toBeLessThanOrEqual(latestBeforeR1);
    journey.facts.admissionSequence = admissionSequence;

    // i. The marker is in the film: the centre of the picture at 3 s is the task's colour, and not the placeholder's grey.
    await expect(page.getByRole('dialog', { name: 'Rendered film' })).toBeVisible(CEILING);
    const shot3 = previewShots.find((shot) => shot.seconds === 3)!;
    const frame = await captureFilm(player, shot3.seek.observedTime + 0.5 / render.fps, outputDir, 'film-3s-marker');
    const centre = centreCell(await pictureGrid(page, frame.png, frame.picture, frame.box));
    const marker = [...Buffer.from(astrid.markerColor, 'hex')];
    expect(Math.max(...centre.map((value, channel) => Math.abs(value - marker[channel]))), `the film's centre at 3 s is the marker colour ${astrid.markerColor}: ${centre.map(Math.round)}`).toBeLessThanOrEqual(8);
    const grey = [render.placeholderGrey.r, render.placeholderGrey.g, render.placeholderGrey.b];
    expect(Math.hypot(...centre.map((value, channel) => value - grey[channel])), 'and it is far from the placeholder grey').toBeGreaterThanOrEqual(60);
    journey.facts.centreCellOfFilmAt3s = centre.map((value) => Number(value.toFixed(1)));
  });

  await test.step('4 the render plays, and it is the film the App showed', async () => {
    // a. The App opened the finished film; its source is the door's content URL of the task's output.
    const task = dataOf((await harness.runtimeJson('GET', `/v1/tasks/${taskId}`)).body);
    const output = (task.result.outputs as Array<{ digest: string; object_id?: string; media_type: string; size: number }>).find((candidate) => String(candidate.media_type).startsWith('video'));
    expect(output, 'the task produced a film').toBeTruthy();
    await expect(page.getByRole('dialog', { name: 'Rendered film' })).toBeVisible(CEILING);
    // The door answers the same Runtime routes under two prefixes; the App's render result uses its own (`/api/astrid`).
    const doorOrigin = new URL(harness.doorBase).origin;
    const objectRoute = `/v1/objects/${encodeURIComponent(output!.object_id ?? output!.digest)}`;
    const expectedSrc = (await player.getAttribute('src'))!;
    expect(['astrid', 'runtime'].map((prefix) => `${doorOrigin}/api/${prefix}${objectRoute}`), 'the player\'s source is the door\'s content URL of the task\'s output').toContain(expectedSrc);
    await expect.poll(() => player.evaluate((video: HTMLVideoElement) => video.readyState), { message: 'the player loaded the film', ...CEILING }).toBeGreaterThanOrEqual(1);

    // b. The door serves ranges: the player's own requests were 206 with a Content-Range, and so is a probe of 1 KiB at an offset.
    const playerRanges = filmResponses.filter((response) => response.url === expectedSrc && response.status === 206 && response.contentRange);
    expect(playerRanges.length, 'the player\'s own requests were answered 206 with a Content-Range').toBeGreaterThan(0);
    const probe = await page.evaluate(async (src) => {
      const response = await fetch(src, { headers: { Range: 'bytes=1024-2047' } });
      return { status: response.status, contentRange: response.headers.get('content-range'), bytes: (await response.arrayBuffer()).byteLength };
    }, expectedSrc);
    expect(probe.status).toBe(206);
    expect(probe.contentRange).toBe(`bytes 1024-2047/${output!.size}`);
    expect(probe.bytes).toBe(1024);

    // c, d. The film at each moment the preview showed, compared through the same pipeline as the preview's picture.
    const rows: Array<{ seconds: number; previewTime: number; filmTime: number; difference: GridDifference }> = [];
    let film3: PictureGrid | undefined;
    let aspect = { film: 0, preview: 0 };
    for (const shot of previewShots) {
      const frame = await captureFilm(player, shot.seek.observedTime + 0.5 / render.fps, outputDir, `film-${shot.seconds}s`);
      expect(Math.abs(frame.mediaTime - shot.seek.observedTime), `the player presented the frame at ${shot.seconds} s`).toBeLessThan(1 / render.fps);
      const filmGrid = await pictureGrid(page, frame.png, frame.picture, frame.box);
      const difference = gridDifference(filmGrid, await pictureGrid(page, shot.png, shot.composition, shot.surface));
      rows.push({ seconds: shot.seconds, previewTime: shot.seek.observedTime, filmTime: frame.mediaTime, difference });
      Object.assign(journey.facts, { frameDifferences: { match: rows.map((row) => ({ seconds: row.seconds, previewTime: row.previewTime, filmTime: row.filmTime, ...rounded(row.difference) })) } });
      expect(matches(difference), `the film at ${shot.seconds} s is the preview's picture: ${JSON.stringify(rounded(difference))} against ${JSON.stringify(MATCH)}`).toBe(true);
      if (shot.seconds === 3) film3 = filmGrid;
      aspect = { film: frame.natural.width / frame.natural.height, preview: shot.composition.width / shot.composition.height };
    }
    expect(aspect.film, 'the render has the preview\'s aspect ratio').toBeCloseTo(aspect.preview, 1);

    // The negative control: the film is not the preview of R+1, so the comparison can tell R from R+1.
    const teeth = gridDifference(film3!, await pictureGrid(page, negative!.png, negative!.composition, negative!.surface));
    Object.assign(journey.facts, { frameDifferences: { match: rows.map((row) => ({ seconds: row.seconds, previewTime: row.previewTime, filmTime: row.filmTime, ...rounded(row.difference) })), negativeControl: rounded(teeth) } });
    expect(matches(teeth), `the film at 3 s is not the preview of R+1: ${JSON.stringify(rounded(teeth))} must exceed ${JSON.stringify(MATCH)}`).toBe(false);

    // e. Sound, decoded from the same URL: the tone is in the film.
    const loudness = await page.evaluate(async (src) => {
      const response = await fetch(src);
      const audio = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(await response.arrayBuffer());
      let sum = 0;
      let count = 0;
      for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
        const samples = audio.getChannelData(channel);
        for (let index = Math.floor(0.5 * audio.sampleRate); index < Math.min(samples.length, Math.floor(5.5 * audio.sampleRate)); index += 1) { sum += samples[index] * samples[index]; count += 1; }
      }
      return 20 * Math.log10(Math.sqrt(sum / Math.max(1, count)));
    }, expectedSrc);
    expect(loudness, 'the film is audible between 0.5 s and 5.5 s (dBFS)').toBeGreaterThan(-40);

    // f. Its length is the timeline's: a content check, not a timing check.
    const duration = await player.evaluate((video: HTMLVideoElement) => video.duration);
    expect(Math.abs(duration - render.durationSeconds), 'the film is as long as the timeline, within a frame').toBeLessThanOrEqual(1 / render.fps);

    // g. Reported, never judged.
    Object.assign(journey.facts, { loudnessDbfs: Number(loudness.toFixed(1)), filmSeconds: duration });
  });

  await sniff.expectClean(page);
});

// ---------------------------------------------------------------------------------------------
// 3. Runtime restart with both attached

test('Runtime restart with the App open: the draft survives, saves after the relaunch, and the agent follows', async ({ page, harness, astrid, seed3 }) => {
  const agent = agentOf(astrid, seed3);
  const sniff = new TokenSniff(secretsOf(harness, astrid));
  sniff.attach(page);

  await openApp(page, harness);
  await expectConnected(page);
  await openSeededTimeline(page, harness);
  const before = await expectSameRealm(page, harness, astrid);
  const headBefore = await currentHead(harness);

  // A draft that was never sent: the save is held, so the edit is a draft by construction.
  const releaseSaves = await holdTimelineSaves(page);
  await editFirstTrackName(page, 'F2 kept across restart');
  await plantNoReloadFlag(page);

  // The Runtime restarts on a new port; the page says so and does not reload itself.
  await harness.restartRuntime();
  await expect(page.getByRole('heading', { name: 'Astrid restarted' })).toBeVisible(CEILING);
  expect(await noReloadFlag(page), 'the page does not reload by itself').toBe(true);

  // The agent follows discovery to the new endpoint: same realm and contract, a new instance, and the draft is not in the Runtime.
  const after = await astrid.identity();
  expect(after.realm_id).toBe(before.realmId);
  expect(after.runtime_instance_id, 'the agent reached the relaunched Runtime').toBe(harness.runtimeInstanceId);
  expect(after.runtime_instance_id).not.toBe(before.runtimeInstanceId);
  expect(after.schema_digest).toBe(before.schemaDigest);
  expect((await agent.status()).current_head, 'the draft is not saved').toBe(headBefore);
  expect(await currentHead(harness)).toBe(headBefore);

  // The page reconnects after Reload, offers the draft back, and saves it once the hold is released.
  await page.getByRole('button', { name: UI.reload }).click();
  await expectConnected(page);
  await expect(page.getByRole('heading', { name: 'Astrid restarted' })).toHaveCount(0);
  await openSeededTimeline(page, harness);
  journey.facts.sameRealmAfterRestart = await expectSameRealm(page, harness, astrid);
  const recovered = page.getByRole('alert').filter({ hasText: 'You have unsaved changes' });
  await expect(recovered).toBeVisible(CEILING);
  await releaseSaves();
  const recoveredSave = page.waitForRequest((request) => request.method() === 'POST' && SAVES.test(new URL(request.url()).pathname), CEILING);
  await recovered.getByRole('button', { name: 'Save them' }).click();
  const keyAfter = (await recoveredSave).headers()['idempotency-key'];
  await expect.poll(() => currentHead(harness), CEILING).not.toBe(headBefore);
  await expect(firstTrackName(page)).toHaveValue('F2 kept across restart');

  // The agent reads what the App saved after the relaunch.
  const headAfter = await currentHead(harness);
  expect((await agent.status()).current_head).toBe(headAfter);
  expect((await agent.show()).head_revision_id).toBe(headAfter);
  const state = await revisionState(harness, seed3, headAfter);
  expect(state.trackLabel, 'the saved revision is the draft').toBe('F2 kept across restart');
  expect(headAfter, 'the post-restart save is stored under its idempotency key').toBe(keyAfter);
  await expectOpaqueDataKept(harness, seed3);

  journey.facts = { ...journey.facts, instanceBefore: before.runtimeInstanceId, instanceAfter: after.runtime_instance_id, headBefore, headAfter };
  await sniff.expectClean(page);
});

// ---------------------------------------------------------------------------------------------
// QUICK: F1 owns the realm and Runtime; this case attaches the App and real Astrid CLI to that one timeline.

test('quick: Astrid edit then App edit are visible and readable on the adopted timeline', async ({ page, harness, quickAstrid }) => {
  const descriptor = harness.attachment;
  const seed = harness.quickSeed;
  expect(descriptor, 'the quick descriptor selected the attached harness').toBeTruthy();
  expect(seed, 'the adopted project and timeline are available').toBeTruthy();
  const quickSeed = { timelineId: seed!.timelineId, projectSlug: seed!.projectSlug };
  const agent = agentOf(quickAstrid, quickSeed);
  const sniff = new TokenSniff(secretsOf(harness, quickAstrid));
  sniff.attach(page);
  const reads = watchPageReads(page, harness);

  await openApp(page, harness);
  await expectConnected(page);
  await openSeededTimeline(page, harness);
  const sameRealm = await expectSameRealm(page, harness, quickAstrid);
  expect(sameRealm.realmId).toBe(descriptor!.realmId);
  expect(sameRealm.runtimeInstanceId).toBe(descriptor!.runtimeInstanceId);
  expect(sameRealm.astridFile).toContain('astrid');

  const baseRevisionId = descriptor!.headRevisionId;
  const base = await revisionBody(harness, baseRevisionId);
  const clips = (base.payload.clips ?? []) as Array<Record<string, any>>;
  expect(clips.length, 'the fixture has an editable media clip').toBeGreaterThan(0);
  const clip = clips[0];
  const mediaId = base.payload.registry.assets[clip.asset].media_id as string;
  const mediaUrl = `${harness.doorBase}/v1/objects/${encodeURIComponent(mediaId)}`;
  const preview = page.getByTestId('video-editor-preview-surface');
  const decodedFrame = preview.locator('[data-preview-media-src]');
  // ReadinessVideo forwards this marker to the painted media element and reports its decoded source separately.
  const renderedClip = preview.locator('[data-astrid-retry-token]');
  await expect(decodedFrame, 'the preview contains the fixture media source').toHaveCount(1);
  await expect(decodedFrame).toHaveAttribute('data-preview-media-src', mediaUrl);
  await expect(decodedFrame, 'Chromium decoded the fixture media').toHaveAttribute('data-preview-decoded-frame', 'true');
  await expect(renderedClip, 'one fixture media surface is rendered').toHaveCount(1);
  await expect(renderedClip, 'the editor visibly renders the fixture media').toBeVisible();
  await expect(renderedClip).toHaveCSS('opacity', '1');

  await agent.checkout();
  await agent.edit('--clip', String(clip.id), '--set', 'opacity=0.5');
  const astridPublished = await agent.publish('Quick Astrid edit', `quick-astrid-${descriptor!.timelineId}`);
  expect(astridPublished.old_head).toBe(baseRevisionId);
  const astridRevisionId = astridPublished.new_head;
  // The open App catches up through its head poll (RuntimeDataProvider.refreshIntervalMs): no reload, no event. No fixed timeout; only a hang fails.
  await expect.poll(async () => (await currentHead(harness)), { message: 'the App observes Astrid’s published revision', timeout: 0 }).toBe(astridRevisionId);
  await expect.poll(() => reads.compositionRevisions.some((item) => item.id === astridRevisionId && item.payload?.clips?.some((candidate: any) => candidate.id === clip.id && candidate.opacity === 0.5)), { message: 'the editor reads Astrid’s edited clip content', timeout: 0 }).toBe(true);
  await expect(renderedClip, 'Astrid’s opacity edit is visible in the rendered editor').toHaveCSS('opacity', '0.5', { timeout: 0 });

  const appLabel = 'QUICK App edit';
  const appSaved = page.waitForResponse((response) => response.request().method() === 'POST' && SAVES.test(new URL(response.url()).pathname), CEILING);
  await editFirstTrackName(page, appLabel);
  const saveResponse = await appSaved;
  expect(saveResponse.ok(), `App save returned ${saveResponse.status()}`).toBe(true);
  expect(saveResponse.request().postDataJSON().expected_head, 'the App built on Astrid’s revision').toBe(astridRevisionId);
  const saveEnvelope = await saveResponse.json();
  const savedRevisionId = saveEnvelope.data?.new_head as string;
  expect(savedRevisionId, 'the App response identifies its saved revision').toBeTruthy();
  expect(saveEnvelope.data?.old_head, 'the App save receipt names Astrid’s revision as its parent').toBe(astridRevisionId);
  expect(savedRevisionId).not.toBe(astridRevisionId);
  expect(await currentHead(harness)).toBe(savedRevisionId);

  const status = await agent.status();
  const show = await agent.show();
  expect(status.current_head, 'Astrid reads the App-saved revision').toBe(savedRevisionId);
  expect(show.head_revision_id).toBe(savedRevisionId);
  const lineage = (await allRevisions(harness, quickSeed)).map((revision) => revision.revision_id);
  expect(lineage.indexOf(savedRevisionId), 'the App revision is the newest ancestor').toBeGreaterThanOrEqual(0);
  expect(lineage.indexOf(savedRevisionId)).toBeLessThan(lineage.indexOf(astridRevisionId));
  expect(lineage.indexOf(astridRevisionId)).toBeLessThan(lineage.indexOf(baseRevisionId));
  const astridRead = await quickAstrid.readTimelineBundle(seed!.timelineId, seed!.projectSlug, savedRevisionId);
  expect(astridRead.revisionId, 'Astrid opened the App-saved immutable revision').toBe(savedRevisionId);
  const composition = astridRead.bundle.parent as Record<string, any>;
  const labels = (composition.config.tracks as Array<Record<string, any>>).map((track) => track.label);
  expect(labels, 'Astrid reads the App-edited track label as content').toContain(appLabel);

  const revisions = revisionSet(journey.identity);
  const observedRevisions = { app: revisions.appHead, astrid: revisions.astridHead, runtime: revisions.runtimeHead };
  expect(observedRevisions).toEqual(descriptor!.revisions);
  const result = {
    realmId: sameRealm.realmId,
    runtimeInstanceId: sameRealm.runtimeInstanceId,
    baseRevisionId,
    astridRevisionId,
    savedRevisionId,
    astridParentRevisionId: astridPublished.old_head,
    appParentRevisionId: saveEnvelope.data.old_head as string,
    astridLabel: 'Quick Astrid edit',
    appLabel,
    revisions: observedRevisions,
  };
  mkdirSync(path.dirname(descriptor!.resultFile), { recursive: true });
  writeFileSync(descriptor!.resultFile, JSON.stringify(result, null, 2));
  journey.facts = { ...journey.facts, ...result };
  await sniff.expectClean(page);
});
