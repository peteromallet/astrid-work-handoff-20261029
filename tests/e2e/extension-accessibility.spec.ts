import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  PROJECT_SLUG,
  TIMELINE_SLUG,
  editorPath,
  resetFakeRuntimeBaseline,
  isAbsentWorldLibraryRead,
} from './timeline/support';

const EDITOR_URL = editorPath({ params: { transcriptLaneFixture: '1' } });
// The harness mounts no data provider. `localProject` is kept only because Layout's sessionless auth gate keys off it.
const HARNESS_URL = `/tools/video-editor/harness?scenario=populated&localProject=${PROJECT_SLUG}&localTimeline=${TIMELINE_SLUG}&localTest=1`;
// The routed editor uses the generated Astrid catalog.
const EXTENSION_COUNT = 2;

function collectIssues(page: Page): string[] {
  const issues: string[] = [];
  page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
  page.on('console', (message) => {
    // Failed-resource console messages do not carry a reliable URL across
    // browser engines. Classify them from response/request events below;
    // preserve application-level console errors here.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      issues.push(`[console.error] ${message.text()}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !isAbsentWorldLibraryRead(response)) {
      issues.push(`[http ${response.status()}] ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    issues.push(`[requestfailed] ${request.url()} — ${request.failure()?.errorText ?? 'unknown'}`);
  });
  return issues;
}

async function openComposedEditor(page: Page): Promise<string[]> {
  const issues = collectIssues(page);
  expect(await resetFakeRuntimeBaseline()).toBeNull();
  await page.addInitScript(() => localStorage.removeItem('astrid.dev-extensions.disabled'));
  const response = await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  expect(response?.ok()).toBe(true);
  // Hang ceiling, not a timing bound: the first test of a run is the first load of a cold dev server, which
  // compiles the whole editor route before it mounts (Chromium runs first and sat on the boot screen past 20 s;
  // the same test passes in ~24 s with a longer ceiling, and Firefox and WebKit pass on the warm server).
  await expect(page.locator('[data-lane-kind="astrid.transcript"]')).toBeVisible({ timeout: 90_000 });
  return issues;
}

async function openExtensionsPanel(page: Page): Promise<Locator> {
  // Desktop's dock and the touch editor's picture-area tabs share one Video | Inspector | Extensions tab list.
  // Below 1024 px the desk dock starts closed (INSPECTOR_DEFAULT_OPEN_MIN_VIEWPORT_PX), so a reader opens it from
  // the preview's Panel display control first; the touch editor's tabs and the wide desk dock are open already.
  const dock = page.getByTestId('video-editor-right-panel-dock');
  if ((await dock.getAttribute('data-open')) === 'false') {
    await page.getByRole('button', { name: 'Panel display' }).click();
    await page.getByRole('menuitemradio', { name: 'Full-height' }).click();
    await expect(dock).toHaveAttribute('data-open', 'true');
  }
  const extensionsTab = page.getByRole('tab', { name: 'Extensions' });
  await expect(extensionsTab).toBeVisible();
  await extensionsTab.click();
  await expect(extensionsTab).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Manage extensions' }).click();
  const inventory = page.getByRole('region', { name: 'Built-in' });
  await expect(inventory).toBeVisible();
  await expect(inventory.locator('[data-video-editor-built-in-extension]')).toHaveCount(EXTENSION_COUNT);
  // The dialog zooms in on open, so a box measured mid-animation is scaled (23.99 px for a 24 px
  // control). Target sizes are measured only once every animation has finished.
  // A cancelled animation (a transition replaced by the next one) rejects `finished` with AbortError; it is over.
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))));
  return inventory;
}

async function expectViewportContained(page: Page, width: number): Promise<void> {
  const geometry = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(geometry.viewportWidth).toBe(width);
  expect(geometry.bodyWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(width + 1);
  expect(geometry.documentWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(width + 1);
}

async function expectToggleSemantics(inventory: Locator): Promise<void> {
  const rows = inventory.locator('[data-video-editor-built-in-extension]');
  const toggles = inventory.locator('[data-video-editor-built-in-toggle]');
  const ids = await rows.evaluateAll((elements) => elements.map((element) => (
    element.getAttribute('data-video-editor-built-in-extension')
  )));
  expect(ids).toHaveLength(EXTENSION_COUNT);
  expect(new Set(ids).size).toBe(EXTENSION_COUNT);
  await expect(toggles).toHaveCount(EXTENSION_COUNT);

  for (let index = 0; index < EXTENSION_COUNT; index += 1) {
    const id = ids[index];
    expect(id).not.toBeNull();
    const toggle = toggles.nth(index);
    await expect(toggle).toHaveAccessibleName(`Disable ${id}`);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const box = await toggle.boundingBox();
    expect(box, id ?? `toggle ${index}`).not.toBeNull();
    expect(box!.height, `${id} target height`).toBeGreaterThanOrEqual(24);
    expect(box!.width, `${id} target width`).toBeGreaterThanOrEqual(24);
  }
}

async function saveScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
}

test('the bundled extensions expose state and retain keyboard focus through disable and re-enable', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const issues = await openComposedEditor(page);
  const inventory = await openExtensionsPanel(page);
  await expectToggleSemantics(inventory);

  const transcriptId = 'haus.astrid.transcript-lane';
  const toggle = inventory.locator(`[data-video-editor-built-in-toggle="${transcriptId}"]`);
  // WebKit models Safari's macOS default, where Option+Tab reaches every
  // control while plain Tab follows the system's reduced tab-stop preference.
  const tabKey = testInfo.project.name === 'webkit' ? 'Alt+Tab' : 'Tab';
  for (let attempt = 0; attempt < 20 && !(await toggle.evaluate((element) => element === document.activeElement)); attempt += 1) {
    await page.keyboard.press(tabKey);
  }
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAccessibleName(`Enable ${transcriptId}`);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAccessibleName(`Disable ${transcriptId}`);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toBeFocused();

  const focusStyle = await toggle.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow };
  });
  expect(
    focusStyle.outlineStyle !== 'none' && focusStyle.outlineWidth !== '0px'
      || focusStyle.boxShadow !== 'none',
    JSON.stringify(focusStyle),
  ).toBe(true);
  expect(issues).toEqual([]);
  await saveScreenshot(page, testInfo, 'bundled-extensions-keyboard-focus.png');
});

for (const viewport of [
  { name: 'tablet', width: 834, height: 1194 },
  { name: 'phone', width: 420, height: 820 },
] as const) {
  test(`bundled extension states remain reachable at ${viewport.name} size`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const issues = await openComposedEditor(page);
    const inventory = await openExtensionsPanel(page);
    await expectToggleSemantics(inventory);
    await expectViewportContained(page, viewport.width);
    expect(issues).toEqual([]);
    await saveScreenshot(page, testInfo, `bundled-extensions-${viewport.name}.png`);
  });
}

// The app's palette follows the sky unless a time is chosen (useAppTheme's APP_THEME_TIME_KEY), so each
// palette is chosen here rather than left to the wall clock: noon is the light palette, midnight the dark one.
for (const palette of [
  { name: 'light (midday)', hour: 12, dark: false },
  { name: 'dark (midnight)', hour: 0, dark: true },
] as const) {
test(`200% CSS page-content zoom, reduced motion, names, expanded state, and contrast remain accessible in the ${palette.name} palette`, async ({ page }, testInfo) => {
  // Hang ceilings, not timing bounds: the first harness load of a run is a cold dev server compiling the route.
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const issues = collectIssues(page);
  await page.addInitScript((hour) => localStorage.setItem('theme-hour', String(hour)), palette.hour);
  await page.goto(HARNESS_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveClass(palette.dark ? /\bdark\b/ : /^(?!.*\bdark\b)/);
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });

  const manager = page.locator('[data-video-editor-harness-scenario="populated"]');
  await expect(manager).toBeVisible({ timeout: 90_000 });
  const diagnostics = manager.locator('[data-video-editor-extension-diagnostics-toggle="ext.inspector-tools"]');
  await diagnostics.focus();
  await expect(diagnostics).toBeFocused();
  await expect(diagnostics).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(diagnostics).toHaveAccessibleName('Hide diagnostics for Inspector Tools');
  await expect(diagnostics).toHaveAttribute('aria-expanded', 'true');
  await expect(diagnostics).toBeFocused();
  await expect(manager.getByRole('log', { name: '1 diagnostic for Inspector Tools' })).toBeVisible();

  const motion = await manager.locator('button').evaluateAll((buttons) => buttons.map((button) => {
    const style = getComputedStyle(button);
    return {
      name: button.getAttribute('aria-label') ?? button.textContent?.trim(),
      animationName: style.animationName,
      transitionProperty: style.transitionProperty,
    };
  }));
  expect(motion.filter((item) => item.animationName !== 'none' || item.transitionProperty !== 'none')).toEqual([]);

  const contrast = await manager.evaluate((root) => {
    type Rgba = { r: number; g: number; b: number; a: number };
    const parse = (value: string): Rgba => {
      const values = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return { r: values[0] ?? 0, g: values[1] ?? 0, b: values[2] ?? 0, a: values[3] ?? 1 };
    };
    const composite = (foreground: Rgba, background: Rgba): Rgba => {
      const alpha = foreground.a + background.a * (1 - foreground.a);
      if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
        g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
        b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
        a: alpha,
      };
    };
    const luminance = (color: Rgba): number => {
      const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    };
    const ratio = (left: Rgba, right: Rgba): number => {
      const a = luminance(left);
      const b = luminance(right);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const backgroundFor = (element: Element): Rgba => {
      const chain: Element[] = [];
      for (let current: Element | null = element; current; current = current.parentElement) chain.unshift(current);
      return chain.reduce(
        (background, current) => composite(parse(getComputedStyle(current).backgroundColor), background),
        { r: 255, g: 255, b: 255, a: 1 },
      );
    };
    const selectors = [
      '[data-video-editor-extension-toggle] span',
      '[data-video-editor-extension-diagnostics-toggle] span:first-of-type',
      '[data-video-editor-extension-state-badge]',
      '[aria-label^="Extension summary"] span',
      '[data-video-editor-extension-diag-count]',
      // The expanded diagnostic row: message, [code] and "in <contribution>".
      '[role="log"] [data-video-editor-extension-diag-item] span',
    ];
    return selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)).map((element) => {
      const background = backgroundFor(element);
      const foreground = composite(parse(getComputedStyle(element).color), background);
      return { text: element.textContent?.trim() ?? selector, ratio: ratio(foreground, background) };
    }));
  });
  expect(contrast.length).toBeGreaterThan(0);
  // The coloured diagnostic text is in the sample, not just the neutral chrome around it.
  const sampled = contrast.map((sample) => sample.text);
  expect(sampled).toEqual(expect.arrayContaining(['All systems operational.', '[inspector/ready]', 'in inspector.sections']));
  for (const sample of contrast) {
    expect(sample.ratio, JSON.stringify(sample)).toBeGreaterThanOrEqual(4.5);
  }

  const geometry = await manager.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width, viewportWidth: window.innerWidth };
  });
  expect(geometry.left, JSON.stringify(geometry)).toBeGreaterThanOrEqual(0);
  expect(geometry.right, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.width).toBeGreaterThan(0);
  expect(issues).toEqual([]);
  await diagnostics.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`zoom-200-reduced-motion-${palette.dark ? 'dark' : 'light'}.png`) });
});
}
