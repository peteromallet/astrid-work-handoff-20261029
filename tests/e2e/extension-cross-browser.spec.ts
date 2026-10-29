import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  PROJECT_SLUG,
  TIMELINE_SLUG,
  browserEvidencePath,
  editorPath,
  resetFakeRuntimeBaseline,
} from './timeline/support';

const EDITOR_URL = editorPath({ params: { transcriptLaneFixture: '1' } });

function collectIssues(page: Page): string[] {
  const issues: string[] = [];
  page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
  page.on('console', (message) => {
    // Chromium/Firefox/WebKit emit a generic console.error for any failed
    // resource. HTTP status is classified below, where the URL is available;
    // retain application/page errors here.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      issues.push(`[console.error] ${message.text()}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      issues.push(`[http ${response.status()}] ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    // Transport failures are release-gate failures.
    issues.push(`[requestfailed] ${request.url()} — ${request.failure()?.errorText ?? 'unknown'}`);
  });
  return issues;
}

function evidencePath(testInfo: TestInfo, fileName: string): string {
  return browserEvidencePath(testInfo, `cross-browser/${testInfo.project.name}/${fileName}`);
}

async function openCombinedEditor(page: Page): Promise<string[]> {
  const issues = collectIssues(page);
  expect(await resetFakeRuntimeBaseline()).toBeNull();
  await page.addInitScript(() => localStorage.removeItem('astrid.dev-extensions.disabled'));
  const response = await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  expect(response?.ok()).toBe(true);
  // Hang ceiling, not a timing bound: a run that starts here (one test selected) is the first load of a cold dev
  // server, which compiles the whole editor route before it mounts.
  await expect(page.locator('[data-lane-kind="astrid.transcript"]')).toBeVisible({ timeout: 90_000 });
  return issues;
}

test('extension inventory host renders active and diagnostic state', async ({ page }) => {
  const issues = collectIssues(page);
  // The harness mounts no data provider. `localProject` is kept only because Layout's sessionless auth gate keys off it.
  await page.goto(`/tools/video-editor/harness?scenario=populated&localProject=${PROJECT_SLUG}&localTimeline=${TIMELINE_SLUG}&localTest=1`, {
    waitUntil: 'domcontentloaded',
  });

  const cards = page.locator('[data-video-editor-extension-package-id]');
  // Hang ceiling, not a timing bound: the first load of a cold dev server compiles the harness route.
  await expect(cards).toHaveCount(3, { timeout: 45_000 });
  await expect(page.locator('[data-video-editor-extension-package-state="loaded"]')).toHaveCount(3);
  await expect(page.getByLabel('Extension summary: 3 packages, 3 loaded')).toBeVisible();
  await expect(page.locator('[data-video-editor-activity-event]')).toHaveCount(3);
  await expect(page.locator('[data-video-editor-extension-manager="true"]')).toBeVisible();

  const diagnosticButton = page.getByRole('button', {
    name: 'Show diagnostics for Inspector Tools',
  });
  await diagnosticButton.focus();
  await expect(diagnosticButton).toBeFocused();
  await diagnosticButton.press('Enter');
  await expect(page.getByRole('button', { name: 'Hide diagnostics for Inspector Tools' })).toBeVisible();
  expect(issues).toEqual([]);
});

test('combined extension surfaces compose and expose keyboard semantics', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const issues = await openCombinedEditor(page);

  const lane = page.locator('[data-lane-kind="astrid.transcript"]');
  const chips = lane.getByTestId('transcript-lane-occurrence');
  expect(await chips.count()).toBeGreaterThan(0);
  expect(await chips.count()).toBeLessThanOrEqual(128);
  const first = chips.first();
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed', 'true');

  expect(issues).toEqual([]);
  await page.screenshot({
    path: evidencePath(testInfo, 'combined-extension-surfaces.png'),
    fullPage: true,
  });
});

test('combined extension controls remain visible and operable at phone width', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  // A phone gets the touch editor: no dock, mode bar or floating rails, and a 56 px track column. The extension
  // manager is a desk surface (proven by the desktop case above and by extension-accessibility.spec.ts); what the
  // phone still offers from extensions is the transcript lane.
  await page.setViewportSize({ width: 390, height: 844 });
  const issues = await openCombinedEditor(page);

  const geometry = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(geometry.bodyWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.documentWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewportWidth);

  const lane = page.locator('[data-lane-kind="astrid.transcript"]');
  await page.locator('.timeline-canvas-edit-area').evaluate((scroller) => {
    scroller.scrollTop = scroller.scrollHeight;
  });
  await expect(lane).toBeInViewport();
  await lane.getByTestId('transcript-lane-occurrence').first().click();
  await expect(lane.getByTestId('transcript-lane-occurrence').first()).toHaveAttribute('aria-pressed', 'true');
  expect(issues).toEqual([]);
  await page.screenshot({
    path: evidencePath(testInfo, 'phone-extension-surfaces.png'),
    fullPage: true,
  });
});
