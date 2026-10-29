import { expect, test, type Page } from '@playwright/test';
import { astridOnboardedStorageState } from './fixtures/astridOnboardedStorageState';
import { editorPath, resetFakeRuntimeBaseline, seedEditorPreferences } from './timeline/support';

const COMPOSED_URL = editorPath({ params: { transcriptLaneFixture: 'render-matrix' } });

/**
 * `touch` runs are touch-emulated (`hasTouch` + `isMobile`), the way the toolbar-reachable spec runs the same
 * devices, so they get the touch editor, which draws no create tools (adding elements is the agent's job
 * there). The pointer runs (desktop, and the 768px narrow desktop) keep them in the canvas footer.
 */
const viewports = [
  { name: 'desktop', width: 1440, height: 960, touch: false },
  { name: 'tablet', width: 768, height: 1024, touch: false },
  { name: 'tablet-touch', width: 834, height: 1194, touch: true },
  { name: 'phone', width: 390, height: 844, touch: true },
] as const;

test.describe.configure({ mode: 'serial' });

async function initializeLocalMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.removeItem('astrid.dev-extensions.disabled');
    // The app follows the sky unless a time is chosen (useAppTheme's APP_THEME_TIME_KEY); the baselines are
    // drawn at night, so choose midnight rather than let the wall clock pick the palette.
    localStorage.setItem('theme-hour', '0');
  });
}

async function stabilizeTimeline(page: Page): Promise<void> {
  const stabilizingCss = `
      *, *::before, *::after {
        animation: none !important;
        caret-color: transparent !important;
        transition: none !important;
      }
      .timeline-scroll { scrollbar-width: none !important; }
      .timeline-scroll::-webkit-scrollbar { display: none !important; }
    `;
  // Local bridge discovery can perform one startup navigation while an editor
  // route settles. Retry the idempotent freeze against the final document.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.addStyleTag({ content: stabilizingCss });
      await page.evaluate(async () => {
        for (const video of document.querySelectorAll('video')) video.pause();
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
      });
      break;
    } catch (error) {
      if (attempt === 2 || !String(error).includes('Execution context was destroyed')) throw error;
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.timeline-wrapper')).toBeVisible();
    }
  }
  await expect(page.locator('.timeline-wrapper')).toBeVisible();
  await frameComposedLanes(page);
}

/**
 * Frame the transcript lane the way a user reaches it, then prove the frame. On the pointer runs the create
 * tools sit in the footer row under the last track, so they take layout space and never lie over a row; the
 * floor is then the tools' top. The touch editor draws no create tools, so there the floor is the edit area's
 * bottom.
 *
 * Scroll position 0 is what a user sees on open, so it is kept whenever the lane already lies fully inside
 * the timeline viewport, below the ruler and above the floor (desktop, tablet). Where it does not (the phone's
 * 140px viewport holds two and a half rows plus the ruler), the lane's top edge is scrolled flush under the
 * ruler. That scroll target is computed from the layout and must be reachable: the scrollTop the browser
 * returns has to equal it, so a clamp fails here instead of a sliced row being snapshotted.
 */
async function frameComposedLanes(page: Page): Promise<void> {
  const framing = await page.locator('.timeline-canvas-edit-area').evaluate((area) => {
    const transcript = area.querySelector('[data-lane-kind="astrid.transcript"]');
    const ruler = document.querySelector('[data-testid="timeline-ruler"]');
    const tools = document.querySelector('[data-testid="timeline-tool-buttons"]');
    if (!transcript || !ruler) throw new Error('the transcript lane is not mounted');
    const framed = () => {
      const ceiling = ruler.getBoundingClientRect().bottom;
      const areaBottom = area.getBoundingClientRect().bottom;
      const floor = tools && area.contains(tools) ? Math.min(areaBottom, tools.getBoundingClientRect().top) : areaBottom;
      const rect = transcript.getBoundingClientRect();
      return rect.top >= ceiling - 0.5 && rect.bottom <= floor + 0.5;
    };
    area.scrollLeft = 0;
    area.scrollTop = 0;
    const target = framed() ? 0 : transcript.getBoundingClientRect().top - ruler.getBoundingClientRect().bottom;
    area.scrollTop = target;
    return { target, applied: area.scrollTop, maxScroll: area.scrollHeight - area.clientHeight };
  });
  expect(framing.target, 'the framing target lies within the scrollable range').toBeLessThanOrEqual(framing.maxScroll);
  expect(Math.abs(framing.applied - framing.target), `scrollTop ${framing.applied} equals the framing target ${framing.target}`).toBeLessThan(0.5);

  const rulerBox = await page.getByTestId('timeline-ruler').boundingBox();
  const areaBox = await page.locator('.timeline-canvas-edit-area').boundingBox();
  const toolsBox = await page.getByTestId('timeline-tool-buttons').boundingBox({ timeout: 1_000 }).catch(() => null);
  expect(rulerBox).not.toBeNull();
  expect(areaBox).not.toBeNull();
  const ceiling = rulerBox!.y + rulerBox!.height;
  const areaBottom = areaBox!.y + areaBox!.height;
  const floor = toolsBox ? Math.min(areaBottom, toolsBox.y) : areaBottom;
  const transcriptBox = await page.locator('[data-lane-kind="astrid.transcript"]').boundingBox();
  expect(transcriptBox, 'the transcript lane is mounted').not.toBeNull();
  if (framing.target > 0) {
    expect(Math.abs(transcriptBox!.y - ceiling), 'the transcript lane starts flush under the ruler').toBeLessThan(0.5);
  }
  expect(transcriptBox!.y, 'the transcript lane starts below the ruler').toBeGreaterThanOrEqual(ceiling - 0.5);
  expect(transcriptBox!.y + transcriptBox!.height, "the transcript lane ends above the floor (the tool buttons in the footer, else the edit area's bottom)").toBeLessThanOrEqual(floor + 0.5);
  if (!toolsBox) return;
  // In the footer the tools are laid out in the edit area: they must lie fully inside it, so a snapshot
  // never shows half a button cut by the area's bottom edge.
  expect(toolsBox.y + toolsBox.height, 'the footer tool buttons end inside the edit area').toBeLessThanOrEqual(areaBottom + 0.5);
  // No track row or lane is under a button.
  const rowsUnderTools = await page.locator('.timeline-canvas-edit-area').evaluate((area, tools) => (
    [...area.querySelectorAll('[data-track-id], [data-lane-kind]')].filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.left < tools.x + tools.width && rect.right > tools.x && rect.top < tools.y + tools.height && rect.bottom > tools.y;
    }).length
  ), toolsBox);
  expect(rowsUnderTools, 'no track row or lane lies under the tool buttons').toBe(0);
}

async function expectTimelineSnapshot(page: Page, name: string): Promise<void> {
  await stabilizeTimeline(page);
  await expect(page.locator('.timeline-wrapper')).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    threshold: 0.2,
    maxDiffPixelRatio: 0.005,
  });
}

async function openComposedEditor(page: Page): Promise<void> {
  expect(await resetFakeRuntimeBaseline()).toBeNull();
  await initializeLocalMode(page);
  // This spec pins the composed extension lanes, not the Inspector dock. The dock opens by default on
  // desktop and would take a third of the timeline's width, so the saved panel selection is "closed",
  // the same preference the product reads, set the way a user's earlier choice would be.
  await seedEditorPreferences(page, { selectedRightPanelId: null });
  const response = await page.goto(COMPOSED_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  expect(response?.ok()).toBe(true);
  await expect(page.locator('[data-lane-kind="astrid.transcript"]')).toBeVisible({ timeout: 30_000 });
}

for (const viewport of viewports) {
  test.describe(`${viewport.name} composed timeline`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      ...(viewport.touch ? { hasTouch: true, isMobile: true } : {}),
    });

    test(`matches the composed extension timeline at ${viewport.name} size`, async ({ page }) => {
      await openComposedEditor(page);
      // The pointer editor keeps its create tools in the canvas footer; the touch editor draws none.
      await expect(page.getByTestId('timeline-tool-buttons')).toHaveCount(viewport.touch ? 0 : 1);
      await expectTimelineSnapshot(page, `composed-${viewport.name}.png`);
    });
  });
}

// What a first-time desktop user sees: nothing saved for the Activity pane, so it opens locked as a column beside the
// editor (`tasksPaneLocked`) and the timeline is that much narrower. The cases above seed it unlocked, to pin the lanes.
test.describe('desktop first-run composed timeline', () => {
  test.use({
    viewport: { width: 1440, height: 960 },
    storageState: astridOnboardedStorageState(process.env.BASE_URL!, { activityPaneUnlocked: false }),
  });

  test('matches the composed extension timeline beside the locked Activity pane', async ({ page }) => {
    await openComposedEditor(page);
    await expect(page.getByLabel('Runtime activity')).toBeVisible();
    await expectTimelineSnapshot(page, 'composed-desktop-first-run.png');
  });
});
