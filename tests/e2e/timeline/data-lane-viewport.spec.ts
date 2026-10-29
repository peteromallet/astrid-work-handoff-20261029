import { expect, test } from '@playwright/test';
import { MAX_TIMELINE_SCALE_WIDTH } from '../../../src/tools/video-editor/lib/timeline-scale.ts';
import { collectNetworkIssues, collectPageLogs, editorUrl, resetFakeRuntimeBaseline } from './support';

const EDITOR_URL = editorUrl({ params: { transcriptLaneFixture: 'dense' } });

// Hang ceiling, not a timing bound: the first load of a cold dev server compiles the whole editor route.
test.setTimeout(120_000);

// The shared reset hook in support.ts registers for the first spec file a worker loads only, so a spec resets
// for itself and starts pristine.
test.beforeEach(async () => {
  expect(await resetFakeRuntimeBaseline()).toBeNull();
});

test('dense data lane paints late viewport items with bounded DOM and real geometry', async ({ page }, testInfo) => {
  // At the 100px/s zoom ceiling a 900px viewport spans the whole four-second
  // fixture. The sparse-window cap then quite correctly centers both the
  // origin and late scroll around the same 128 items. Keep the viewport narrow
  // enough that the two source windows are genuinely different.
  await page.setViewportSize({ width: 500, height: 760 });
  const logs = collectPageLogs(page);
  const networkIssues = collectNetworkIssues(page);
  await page.addInitScript(() => localStorage.removeItem('astrid.dev-extensions.disabled'));
  // The touch shell has no zoom buttons (pinch zooms it, and this viewport is below the touch shell's
  // breakpoint), so the timeline starts at the zoom ceiling through the editor's saved preference.
  await page.addInitScript((zoomCeiling) => {
    localStorage.setItem('video-editor:preferences:demo-timeline', JSON.stringify({ scaleWidth: zoomCeiling }));
  }, MAX_TIMELINE_SCALE_WIDTH);
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });

  const row = page.locator('[data-lane-kind="astrid.transcript"]');
  await expect(row).toBeVisible({ timeout: 30_000 });
  const scroller = page.locator('.timeline-canvas-edit-area');

  await scroller.evaluate((element) => {
    element.scrollLeft = 0;
    element.scrollTop = element.scrollHeight;
  });
  const chips = row.locator('[data-testid="transcript-lane-occurrence"]');
  await expect.poll(() => chips.count()).toBeGreaterThan(0);
  const earlyIds = await chips.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-item-id')).filter(Boolean) as string[]);
  const earlyWindowStart = Number(await row.getAttribute('data-window-start'));

  // Use the browser's observed maximum rather than `scrollWidth-clientWidth`:
  // the vertical scrollbar can make that arithmetic 16px larger than the
  // actually reachable horizontal position in Chromium.
  const maxScrollLeft = await scroller.evaluate((element) => {
    const current = element.scrollLeft;
    element.scrollLeft = element.scrollWidth;
    const observedMaximum = element.scrollLeft;
    element.scrollLeft = current;
    return observedMaximum;
  });
  expect(maxScrollLeft).toBeGreaterThan(500);
  await scroller.evaluate((element) => { element.scrollLeft = 100; });
  await expect.poll(async () => Number(await row.getAttribute('data-viewport-start'))).toBeGreaterThan(0);
  const pixelsPerSecond = 100 / Number(await row.getAttribute('data-viewport-start'));
  // The fixture contributes 500 intervals across 0–4 source seconds. Target a
  // real late interval rather than the editor's intentionally empty runway.
  const lateScrollLeft = Math.min(maxScrollLeft, 3.5 * pixelsPerSecond);
  await scroller.evaluate((element, left) => { element.scrollLeft = left; }, lateScrollLeft);
  await expect.poll(async () => Number(await row.getAttribute('data-window-start')))
    .toBeGreaterThan(earlyWindowStart);
  await expect.poll(() => chips.count()).toBeGreaterThan(0);

  const lateIds = await chips.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-item-id')).filter(Boolean) as string[]);
  const lateWindowStart = Number(await row.getAttribute('data-window-start'));
  expect(lateWindowStart).toBeGreaterThan(earlyWindowStart);
  expect(lateIds.length).toBeGreaterThan(0);
  expect(lateIds.length).toBeLessThanOrEqual(128);
  expect(earlyIds.filter((id) => lateIds.includes(id))).toEqual([]);
  const totalItems = Number(await row.getAttribute('data-total-items'));
  expect(totalItems).toBeGreaterThan(128);

  const geometry = await page.evaluate(() => {
    const editArea = document.querySelector<HTMLElement>('.timeline-canvas-edit-area');
    const lane = document.querySelector<HTMLElement>('[data-lane-kind="astrid.transcript"]');
    const label = lane?.querySelector<HTMLElement>('[title="Transcript"]')?.parentElement;
    const itemRects = Array.from(
      lane?.querySelectorAll<HTMLElement>('[data-testid="transcript-lane-occurrence"]') ?? [],
      (element) => element.getBoundingClientRect(),
    );
    if (!editArea || !lane || !label) return null;
    const scrollerRect = editArea.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    const visibleLeft = labelRect.right;
    const visibleRight = scrollerRect.right;
    return {
      scrollLeft: editArea.scrollLeft,
      maxScrollLeft: editArea.scrollWidth - editArea.clientWidth,
      mounted: itemRects.length,
      visibleIntersections: itemRects.filter((rect) => rect.right >= visibleLeft && rect.left <= visibleRight).length,
    };
  });
  expect(geometry).not.toBeNull();
  expect(geometry!.scrollLeft).toBeGreaterThanOrEqual(lateScrollLeft - 1);
  expect(geometry!.mounted).toBeLessThanOrEqual(128);
  expect(geometry!.visibleIntersections).toBeGreaterThan(0);

  await testInfo.attach('dense-lane-late-scroll', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  // A failed load shows up twice: as the browser's generic console line (filtered here) and as the
  // http / requestfailed entry, which is asserted below with no exception.
  expect(logs.filter((line) => !line.includes('Failed to load resource:')), [...new Set(logs)].join(' | ')).toEqual([]);
  expect(networkIssues, [...new Set(networkIssues)].join(' | ')).toEqual([]);
});
