/**
 * Shared support for the direct journey (Plan A): the Chromium resolution, the worker-scoped fixtures, and the App
 * helpers that drive the hosted page. Moved out of direct-journey.spec.ts without changes (card F2-A).
 */
import { chromium, expect, test as base, type Browser, type Page } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { DirectHarness, DOOR_PORT, startDirectHarness } from './harness.ts';

export const UI = {
  status: '[data-testid="runtime-connection-status"]',
  panel: '[data-testid="runtime-not-connected"]',
  copy: 'Copy command',
  connect: 'Connect',
  reload: 'Reload',
};

/** The workspace route a visitor opens on the hosted origin. `/` itself is the public landing page in the WEB build (src/app/routes.tsx:77). */
export const APP_ENTRY_ROUTE = '/tools/video-editor';

export async function closeQuickBrowser(browser: Browser | undefined, browserServer: Awaited<ReturnType<typeof chromium.launchServer>>): Promise<void> {
  const child: ChildProcess = browserServer.process();
  const pid = child.pid;
  if (!pid) throw new Error('Playwright browser server has no child PID');
  let cleanupError: unknown;
  if (browser) try { await browser.close(); } catch (error) { cleanupError = error; }
  try { await browserServer.close(); } catch (error) { cleanupError ??= error; }
  if (child.exitCode === null && child.signalCode === null) await new Promise<void>((resolve) => child.once('exit', () => resolve()));
  if (child.signalCode === 'SIGKILL') cleanupError ??= new Error(`QUICK Chromium process ${pid} exited after SIGKILL`);
  let groupRemains = false;
  try { process.kill(-pid, 0); groupRemains = true; } catch { /* The browser process group has exited. */ }
  if (groupRemains) {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* It exited between the check and cleanup. */ }
    cleanupError ??= new Error(`QUICK Chromium process group ${pid} remained after browser server close and was force-cleaned`);
  }
  if (cleanupError) throw cleanupError;
}

function resolveChromium(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (existsSync(chromium.executablePath())) return undefined;
  // The installed Playwright may expect a newer browser build than the one in the image; use what is there.
  const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '';
  const found = existsSync(browsers) ? readdirSync(browsers).filter((name) => /^chromium-\d+$/.test(name)).sort().pop() : undefined;
  const candidate = found ? path.join(browsers, found, 'chrome-linux', 'chrome') : undefined;
  return candidate && existsSync(candidate) ? candidate : undefined;
}

export const test = base.extend<object, { harness: DirectHarness; browser: Browser }>({
  // Playwright reads fixture dependencies from the destructuring pattern, so the empty pattern is required.
  // eslint-disable-next-line no-empty-pattern
  harness: [async ({}, use) => {
    const harness = await startDirectHarness();
    try { await use(harness); } finally { await harness.stop(); }
  }, { scope: 'worker', timeout: process.env.ASTRID_QUICK_DESCRIPTOR ? 0 : 240_000 }],
  browser: [async ({ harness }, use) => {
    if (process.env.ASTRID_QUICK_DESCRIPTOR) {
      const args = [...harness.chromiumArgs];
      const downloadsPath = process.env.PLAYWRIGHT_DOWNLOADS_PATH;
      if (downloadsPath) mkdirSync(downloadsPath, { recursive: true, mode: 0o700 });
      const installedChrome = process.env.PLAYWRIGHT_USE_INSTALLED_CHROME === '1';
      const browserServer = await chromium.launchServer({ args, ...(installedChrome ? { channel: 'chrome' as const } : { executablePath: resolveChromium() }), ...(downloadsPath ? { downloadsPath } : {}) });
      let browser: Browser | undefined;
      try { browser = await chromium.connect(browserServer.wsEndpoint()); await use(browser); }
      finally { await closeQuickBrowser(browser, browserServer); }
    } else {
      const browser = await chromium.launch({ args: harness.chromiumArgs, executablePath: resolveChromium() });
      try { await use(browser); } finally { await browser.close(); }
    }
  }, { scope: 'worker' }],
  context: async ({ browser, harness }, use) => {
    const context = await browser.newContext(harness.contextOptions as Parameters<Browser['newContext']>[0]);
    try { await use(context); } finally { await context.close(); }
  },
});

export async function currentHead(harness: DirectHarness): Promise<string> {
  const timelines = await harness.runtimeJson('GET', `/v1/projects/${harness.seed.projectId}/timelines/${harness.seed.timelineId}/composition-revisions?limit=1`);
  return timelines.body.items.find((item: any) => item.is_current_head).revision_id;
}

export async function waitForAudit(harness: DirectHarness, predicate: (entry: ReturnType<DirectHarness['audit']>[number]) => boolean, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = harness.audit().filter(predicate);
    if (hit.length || Date.now() > deadline) return hit;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Opens the App at the hosted origin with nothing in the URL and returns the requests it made to the door. */
export async function openApp(page: Page, harness: DirectHarness) {
  const doorRequests: string[] = [];
  page.on('request', (request) => { if (request.url().startsWith(`http://127.0.0.1:${DOOR_PORT}/`)) doorRequests.push(`${request.method()} ${request.url()}`); });
  await page.goto(`${harness.origin}${APP_ENTRY_ROUTE}`);
  return doorRequests;
}

export const expectConnected = (page: Page) => expect(page.locator(UI.status)).toHaveAttribute('data-state', 'connected');

/** The editor's first track-name field: the smallest real edit the App offers on the seeded timeline. */
export const firstTrackName = (page: Page) => page.getByRole('textbox', { name: 'Track name' }).first();

/** Waits for the editor to show the seeded project's timeline (the editor picks the only project by itself). */
export async function openSeededTimeline(page: Page, harness: DirectHarness) {
  await expect(page.getByRole('combobox', { name: 'Select project' })).toContainText(harness.seed.projectName);
  await expect(page.getByRole('combobox', { name: 'Select timeline' })).toBeVisible();
  await expect(firstTrackName(page)).toBeVisible();
  // The editor mounts beneath the connection card and is inert until the card has left: an edit before that is dropped.
  await expect(page.locator(UI.panel)).toHaveCount(0);
}

export async function editFirstTrackName(page: Page, name: string) {
  const field = firstTrackName(page);
  await field.fill(name);
  await field.press('Enter');
  await field.blur();
}

/**
 * Holds every save of a composition revision in flight, so the Runtime never receives it and an edit stays an unsaved
 * draft by construction. The editor autosaves 500 ms after an edit, so without this a restart that follows the edit
 * only keeps the draft when it happens to win that race. Returns the release (later saves go through).
 */
export async function holdTimelineSaves(page: Page) {
  const saves = /\/timelines\/[^/]+\/composition-revisions$/;
  await page.route(saves, (route) => (route.request().method() === 'POST' ? new Promise<void>(() => {}) : route.fallback()));
  return () => page.unroute(saves);
}

export async function revisionBody(harness: DirectHarness, revisionId: string) {
  return (await harness.runtimeJson('GET', `/v1/projects/${harness.seed.projectId}/timelines/${harness.seed.timelineId}/composition-revisions/${revisionId}`)).body;
}
