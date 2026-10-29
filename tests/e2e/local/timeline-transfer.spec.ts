import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, expect, type Page, type TestInfo } from '@playwright/test';
import { EDITOR_TOUR_VERSION } from '../../../src/shared/lib/editorTourVersion.ts';
import { browserEvidencePath } from './support/evidence.ts';
import { test as base } from './support/app.ts';


// An ephemeral (incognito-style) browser context caps OPFS writes near 0.5 GiB, far below the 2.2 GB large archive. A
// persistent profile gets the real quota, so this case drives its own persistent Chrome instead of the shared fixture context.
let pageCrashed = false;
let forbiddenProbe: () => string[] = () => [];
const cleanups: Array<() => void> = [];
const test = base.extend({
  page: async ({ harness }, use) => {
    const userDataDir = mkdtempSync(path.join(process.env.TMPDIR ?? '/private/tmp', 'n4-profile-'));
    const downloads = process.env.PLAYWRIGHT_DOWNLOADS_PATH;
    if (downloads) mkdirSync(downloads, { recursive: true, mode: 0o700 });
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome', args: harness.chromiumArgs, permissions: ['local-network-access'], acceptDownloads: true,
      ...(downloads ? { downloadsPath: downloads } : {}),
    });
    const page = context.pages()[0] ?? await context.newPage();
    pageCrashed = false;
    page.on('crash', () => { pageCrashed = true; });
    try { await use(page); } finally {
      await context.close().catch(() => undefined);
      rmSync(userDataDir, { recursive: true, force: true });
    }
  },
});

// Resolve with the success toast, or fail at once with the error toast's text. Toasts auto-dismiss after 5 s, so poll fast.
async function settleTransfer(page: Page, testInfo: TestInfo, label: 'Export' | 'Import', success: RegExp, timeout = 600_000) {
  const ok = page.getByText(success);
  const failed = page.locator('.group.destructive');
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (forbiddenProbe().length) throw new Error(`${label}: the editor requested a forbidden URL: ${forbiddenProbe()[0]}`);
    if (pageCrashed || page.isClosed()) throw new Error(`${label} failed after ${((Date.now() - started) / 1000).toFixed(1)} s: the browser page crashed or closed`);
    if (await ok.first().isVisible().catch(() => false)) return;
    if (await failed.first().isVisible().catch(() => false)) {
      const message = ((await failed.first().innerText().catch(() => '')) || '(no text)').trim();
      // Evidence for the Activity panel: does a failed task ever leave "Running"? Sample 30 s.
      const samples: string[] = [];
      const shot = browserEvidencePath(testInfo, `timeline-transfer/${label.toLowerCase()}-failed-activity.png`);
      for (let second = 0; second <= 30; second += 1) {
        const text = await page.locator('body').innerText().catch(() => '');
        const rows = text.split('\n').filter((line) => /Export plan|Import|Running|Failed|Error/i.test(line)).join(' | ');
        samples.push(`${second}s: ${rows}`);
        if (second === 30) await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
        await page.waitForTimeout(1000);
      }
      writeFileSync(browserEvidencePath(testInfo, `timeline-transfer/${label.toLowerCase()}-failed-activity.txt`), `${message}\n${samples.join('\n')}\n`);
      throw new Error(`${label} failed in the UI after ${((Date.now() - started) / 1000).toFixed(1)} s: ${message}`);
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`${label} neither succeeded nor failed within ${timeout} ms`);
}
test.describe.configure({ mode: 'serial' });

test.afterEach(async ({ page }) => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  await page.evaluate(async () => {
    const saved = (window as any).__n4Archive;
    if (saved?.name) await (await navigator.storage.getDirectory()).removeEntry(saved.name).catch(() => {});
    delete (window as any).__n4Archive;
  }).catch(() => {});
});

test('CLI-imported archive exports and imports into a fresh project, then plays', async ({ page, harness }, testInfo) => {
  test.setTimeout(2_400_000); // 600 s export + 600 s import polls plus setup and playback, with headroom
  const descriptor = harness.attachment;
  expect(descriptor, 'N4 needs the isolated CLI-imported realm descriptor').toBeTruthy();
  const imported = JSON.parse(readFileSync(descriptor!.resultFile, 'utf8')) as {
    status?: string;
    project_id?: string;
    timeline_ids?: string[];
    archive_bytes: number;
  };
  expect(imported.status).toBe('passed');
  expect(imported.project_id).toBe(descriptor!.projectId);
  expect(imported.timeline_ids).toContain(descriptor!.timelineId);
  const sourceArchiveBytes = Number(imported.archive_bytes);
  expect(sourceArchiveBytes).toBeGreaterThan(0);
  expect(descriptor!.sourceArchiveBytes).toBe(sourceArchiveBytes);
  expect(descriptor!.freeBytesBefore).toBeGreaterThan(0);
  const diskFreeBefore = Number(descriptor!.freeBytesBefore);

  const blockedPorts = new Set(['17340', '2222']);
  const observedRequests: string[] = [];
  const forbiddenRequests: string[] = [];
  const sandboxDoor = new URL(descriptor!.doorEndpoint);
  expect(['http:', 'https:']).toContain(sandboxDoor.protocol);
  expect(sandboxDoor.hostname).toBe('127.0.0.1');
  expect(blockedPorts.has(sandboxDoor.port), 'sandbox door must use its own dynamic port').toBe(false);
  expect(harness.origin).toBe(descriptor!.hostedOrigin);
  const appMode = process.env.N4_APP_MODE ?? 'hosted';
  const appOrigin = appMode === 'hosted' ? harness.origin : process.env.N4_LOCAL_APP_ORIGIN;
  expect(appOrigin, 'local flow requires N4_LOCAL_APP_ORIGIN').toBeTruthy();
  const allowedOrigins = new Set([appOrigin!, harness.origin, sandboxDoor.origin]);
  // No page.route at all: any route (even a RegExp one) makes Chromium pause every request through the Node worker, including the
  // multi-hundred-MB media uploads of the large case. Instead every request is observed (the harness already maps
  // only the app's own hosts, and the external ones to a dead port), and any request outside the allowed origins or on :17340 / :2222 fails the test at once.
  const forbiddenUrl = new RegExp(`^(?:https?|wss?):\\/\\/[^/?#]*:(?:${[...blockedPorts].join('|')})(?:[/?#]|$)|^(?!(?:${[...allowedOrigins].map((o) => o.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|')})(?:[/?#]|$))(?:https?|wss?):\\/\\/`);
  forbiddenProbe = () => forbiddenRequests;
  let observedCount = 0;
  page.on('request', (request) => {
    observedCount += 1;
    if (observedRequests.length < 5000) observedRequests.push(`${request.method()} ${request.url()}`);
    if (forbiddenUrl.test(request.url())) forbiddenRequests.push(request.url());
  });

  // Memory evidence for the Node worker, every 10 s. (No subprocess such as ps: the memory wrapper's psutil sampler cannot read
  // Apple system binaries and would flag the sample incomplete; the wrapper's owned-tree peak already covers the driver.)
  const rssFile = browserEvidencePath(testInfo, 'timeline-transfer/node-rss.csv');
  writeFileSync(rssFile, 'time,worker_rss_bytes\n');
  const sampleRss = () => appendFileSync(rssFile, `${new Date().toISOString()},${process.memoryUsage().rss}\n`);
  sampleRss();
  const rssTimer = setInterval(sampleRss, 10_000);
  cleanups.push(() => clearInterval(rssTimer));

  // Use a real OPFS-backed file handle so the product exercises its streaming File System Access path.
  // This keeps the archive file-backed in Chromium instead of materializing a multi-gigabyte Blob.
  await page.addInitScript(({ localOrigin, tourKey }) => {
    if (window.location.origin === localOrigin) localStorage.setItem(tourKey, '1');
    const nativeInputClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      // Keep the product's Import button and change handler, while supplying the
      // OPFS-backed File below instead of opening an OS file chooser.
      if (this.getAttribute('aria-label') === 'Import timeline archive') return;
      nativeInputClick.call(this);
    };
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => {
        const name = `n4-${crypto.randomUUID()}.astrid`;
        const root = await navigator.storage.getDirectory();
        const handle = await root.getFileHandle(name, { create: true });
        (window as any).__n4Archive = { name, handle };
        return handle;
      },
    });
  }, { localOrigin: appOrigin!, tourKey: `astrid-editor-tour-v${EDITOR_TOUR_VERSION}` });
  const query = new URLSearchParams({ project: descriptor!.projectId, timeline: descriptor!.timelineId });
  await page.goto(`${appOrigin}/tools/video-editor?${query}`);
  // The connection pill is only mounted for the hosted editor; the local Vite editor reaches the Runtime through its dev proxy,
  // and the timeline picker below (which needs the Runtime's data) is its connected signal. A cold dev server needs time for its first load.
  if (appMode === 'hosted') await expect(page.locator('[data-testid="runtime-connection-status"]')).toHaveAttribute('data-state', 'connected', { timeout: 120_000 });
  await expect(page.getByRole('combobox', { name: 'Select timeline' })).toBeVisible({ timeout: 180_000 });
  const picker = page.getByRole('combobox', { name: 'Select timeline' });
  // The timeline picker's suggestions listbox; page-wide options also match the playback-speed select.
  const timelineOptions = page.getByRole('listbox', { name: 'Suggestions' }).getByRole('option');
  await expect(picker).toBeVisible();
  await picker.click();
  await expect(timelineOptions.first()).toBeVisible();
  const cliPickerEvidence = browserEvidencePath(testInfo, 'timeline-transfer/cli-imported-picker.png');
  await page.screenshot({ path: cliPickerEvidence, fullPage: true });
  await page.keyboard.press('Escape');
  await expect(timelineOptions).toHaveCount(0);

  await picker.click();
  const exportStarted = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: 'Export timeline', exact: true }).click();
  await settleTransfer(page, testInfo, 'Export', /^Exported /);
  const archive = await page.evaluate(async () => {
    const saved = (window as any).__n4Archive;
    if (!saved?.handle) throw new Error('export did not open the OPFS destination');
    const file = await saved.handle.getFile();
    return { name: saved.name, size: file.size };
  });
  const exportCompleteEvidence = browserEvidencePath(testInfo, 'timeline-transfer/ui-export-complete.png');
  await page.screenshot({ path: exportCompleteEvidence, fullPage: true });
  const exportElapsedMs = await page.evaluate((started) => performance.now() - started, exportStarted);
  const archiveInfo = archive as { name: string; size: number };
  expect(archiveInfo.name).toMatch(/^n4-.*\.astrid$/i);
  expect(archiveInfo.size).toBeGreaterThan(0);
  if (sourceArchiveBytes >= 1024 ** 3) expect(archiveInfo.size).toBeGreaterThanOrEqual(1024 ** 3);
  const diskAfterExport = statfsSync(descriptor!.dataRoot);
  const diskFreeAfterExport = Number(diskAfterExport.bavail) * Number(diskAfterExport.bsize);
  expect(diskFreeAfterExport, 'sandbox must retain at least 2 GiB free during the browser transfer').toBeGreaterThanOrEqual(2 * 1024 ** 3);

  // Import into a separate empty project in the same sandbox Runtime. The fixture creates it before this test.
  const targetProjectId = descriptor!.transferProjectId;
  const targetProjectName = descriptor!.transferProjectName;
  if (!targetProjectId || !targetProjectName) throw new Error('N4 descriptor must include the Runtime-created empty UI import project');
  const projectPicker = page.getByRole('combobox', { name: 'Select project' });
  await projectPicker.click();
  await page.getByRole('option', { name: new RegExp(targetProjectName, 'i') }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('project')).toBe(targetProjectId);
  // The editor re-renders while it settles onto the target project's timeline, which closes open menus. Wait for that first.
  await expect.poll(() => { const id = new URL(page.url()).searchParams.get('timeline'); return id && id !== descriptor!.timelineId ? id : null; }, { message: 'the editor selects a timeline in the target project' }).toBeTruthy();
  await expect(picker).toBeVisible();
  let importStarted = 0;
  await expect(async () => {
    await picker.click({ timeout: 10_000 });
    const importButton = page.getByRole('button', { name: 'Import timeline…', exact: true });
    await expect(importButton).toBeVisible({ timeout: 5_000 });
    importStarted = await page.evaluate(() => performance.now());
    await importButton.click({ timeout: 5_000 });
  }).toPass({ timeout: 120_000 });
  const input = page.getByLabel('Import timeline archive');
  await page.evaluate(async () => {
    const saved = (window as any).__n4Archive;
    if (!saved?.handle) throw new Error('OPFS export handle was not retained');
    const file = await saved.handle.getFile();
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Import timeline archive"]');
    if (!input) throw new Error('timeline import file input is missing');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(input).toHaveCount(1);
  await expect.poll(() => {
    const timelineId = new URL(page.url()).searchParams.get('timeline');
    return timelineId && timelineId !== descriptor!.timelineId ? timelineId : null;
  }, { message: 'the editor selects a new timeline imported into the fresh project', timeout: 600_000 }).toBeTruthy();
  await settleTransfer(page, testInfo, 'Import', /^Imported /);
  const importElapsedMs = await page.evaluate((started) => performance.now() - started, importStarted);
  await expect.poll(() => new URL(page.url()).searchParams.get('project')).toBe(targetProjectId);
  const roundTripTimelineId = new URL(page.url()).searchParams.get('timeline');
  expect(roundTripTimelineId).toBeTruthy();
  expect(roundTripTimelineId).not.toBe(descriptor!.timelineId);
  const savedTimeline = await harness.runtimeJson('GET', `/v1/projects/${encodeURIComponent(targetProjectId)}/timelines/${encodeURIComponent(roundTripTimelineId!)}/composition-revisions?limit=1`);
  expect(savedTimeline.body.items.some((row: any) => row.is_current_head && row.revision_id)).toBe(true);
  const diskAfterImport = statfsSync(descriptor!.dataRoot);
  const diskFreeAfterImport = Number(diskAfterImport.bavail) * Number(diskAfterImport.bsize);
  expect(diskFreeAfterImport, 'sandbox must retain at least 2 GiB free after UI import').toBeGreaterThanOrEqual(2 * 1024 ** 3);

  await picker.click();
  // A fresh project already carries its default "Main" timeline; the import adds exactly one more, which is the selected one.
  await expect(timelineOptions.and(page.locator('[aria-selected="true"]'))).toHaveCount(1);
  await expect(timelineOptions).toHaveCount(2);
  await expect(timelineOptions.and(page.locator(':not([aria-selected="true"])'))).toHaveText(/^Main/);
  const roundTripPickerEvidence = browserEvidencePath(testInfo, 'timeline-transfer/ui-round-trip-picker.png');
  await page.screenshot({ path: roundTripPickerEvidence, fullPage: true });
  await page.keyboard.press('Escape');
  await expect(timelineOptions).toHaveCount(0);

  await expect(page.getByRole('region', { name: 'Preview panel' })).toBeVisible();
  // The position slider is only shown in full screen (calmed player controls), so observe playback from there.
  await page.getByRole('button', { name: 'Full screen' }).click();
  const position = page.getByRole('slider', { name: 'Playback position' });
  await expect(position).toBeVisible();
  const before = await position.getAttribute('aria-valuenow');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => position.getAttribute('aria-valuenow'), {
    message: 'playback frame advances on the CLI-imported timeline', timeout: 15_000,
  }).not.toBe(before);
  const after = await position.getAttribute('aria-valuenow');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const playbackEvidence = browserEvidencePath(testInfo, 'timeline-transfer/ui-round-trip-playback.png');
  await page.screenshot({ path: playbackEvidence, fullPage: true });
  await page.keyboard.press('Escape');

  const memory = await page.evaluate(async () => {
    const measure = (performance as any).measureUserAgentSpecificMemory;
    if (typeof measure !== 'function') return null;
    const value = await measure.call(performance);
    return { bytes: value.bytes, measurement: 'current after transfer, not peak RSS', label: 'Chromium browser memory estimate' };
  }).catch(() => null);
  const evidence = {
    status: 'passed',
    project_id: descriptor!.projectId,
    imported_into_project_id: targetProjectId,
    imported_timeline_id: descriptor!.timelineId,
    imported_timeline_ids: imported.timeline_ids,
    app_mode: appMode,
    app_origin: appOrigin,
    hosted_origin: harness.origin,
    door_endpoint: descriptor!.doorEndpoint,
    cli_picker_screenshot: cliPickerEvidence,
    export_complete_screenshot: exportCompleteEvidence,
    round_trip_picker_screenshot: roundTripPickerEvidence,
    playback_screenshot: playbackEvidence,
    archive_file: `OPFS:${archiveInfo.name}`,
    archive_size_bytes: archiveInfo.size,
    disk_free_bytes_before: diskFreeBefore,
    disk_free_bytes_after_export: diskFreeAfterExport,
    disk_free_bytes_after_import: diskFreeAfterImport,
    export_elapsed_ms: exportElapsedMs,
    import_elapsed_ms: importElapsedMs,
    ui_import_selected_timeline: new URL(page.url()).searchParams.get('timeline'),
    ui_import_selected_project: new URL(page.url()).searchParams.get('project'),
    browser_memory: memory ?? { status: 'unavailable', bytes: null, label: 'Browser memory API unavailable; no point-in-time estimate was collected.' },
    browser_peak_memory: { status: 'unmeasured', label: 'Aggregate Chromium process peak memory was not collected; N4 performance assessment remains pending.' },
    performance_status: 'pending-aggregate-browser-peak-memory-measurement',
    allowed_origins: [...allowedOrigins],
    playback_position_before: before,
    playback_position_after: after,
    forbidden_ports: [...blockedPorts],
    requests: observedRequests,
    requests_observed_total: observedCount,
  };
  writeFileSync(browserEvidencePath(testInfo, 'timeline-transfer/result.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  await page.evaluate(async () => {
    const saved = (window as any).__n4Archive;
    if (saved?.name) await (await navigator.storage.getDirectory()).removeEntry(saved.name);
    delete (window as any).__n4Archive;
  });
  expect(forbiddenRequests, `blocked external/owner endpoint requests: ${forbiddenRequests.join(', ')}`).toEqual([]);
});
