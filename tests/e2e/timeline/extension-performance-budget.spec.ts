import { expect, test, type BrowserContext } from '@playwright/test';
import { PROJECT_ID, TIMELINE_SLUG, editorPath, isAbsentWorldLibraryRead, resetFakeRuntimeBaseline } from './support';

const EDITOR_URL = editorPath({
  params: { transcriptLaneFixture: 'render-matrix' },
});
// Timeline hydration reads the head composition from the Runtime (`composition-revisions/<head>`, through the
// Vite proxy at `/api/runtime`).
const PROJECT_DATA_PATH = new RegExp(
  `^/api/runtime/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_SLUG}/composition-revisions/[^/]+$`,
);
const DATA_REQUEST_PATH = PROJECT_DATA_PATH;

function collectIssues(page: import('@playwright/test').Page): string[] {
  const issues: string[] = [];
  page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
  page.on('console', (message) => {
    // Failed-resource console messages have no portable URL. HTTP and failed
    // request events below perform the URL-aware classification.
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

const BUDGET = {
  serializedProjectDataBytes: 1 * 1024 * 1024,
  contributionCount: 128,
  quietWindowMs: 5_000,
  quietDataRequests: 4,
  burstDataRequests: 4,
  domNodes: 5_000,
  heapBytes: 256 * 1024 * 1024,
  heapGrowthBytes: 64 * 1024 * 1024,
} as const;

type PerformanceMetric = { name: string; value: number };

async function readHeapBytes(
  cdp: Awaited<ReturnType<BrowserContext['newCDPSession']>>,
): Promise<number | null> {
  try {
    await cdp.send('HeapProfiler.collectGarbage');
  } catch {
    // HeapProfiler is Chromium-specific; keep the absolute metric assertion
    // when forced GC is unavailable in another browser.
  }
  const rawMetrics = await cdp.send('Performance.getMetrics');
  const metrics = Object.fromEntries(
    (rawMetrics.metrics as PerformanceMetric[]).map(({ name, value }) => [name, value]),
  );
  return typeof metrics.JSHeapUsedSize === 'number' ? metrics.JSHeapUsedSize : null;
}

test.describe('extension performance and resource budgets', () => {
  test.use({ viewport: { width: 1_440, height: 900 } });

  test('bounds startup, activation, command search, virtualization, DOM, and heap', async ({ context, page }, testInfo) => {
    // Hang ceiling, not a timing bound: the first load of a cold dev server compiles the whole editor route.
    test.setTimeout(180_000);
    expect(await resetFakeRuntimeBaseline()).toBeNull();
    await page.addInitScript(() => localStorage.removeItem('astrid.dev-extensions.disabled'));

    const issues = collectIssues(page);
    const dataRequests: string[] = [];
    const projectDataBodies: Promise<number>[] = [];
    page.on('request', (request) => {
      if (DATA_REQUEST_PATH.test(new URL(request.url()).pathname)) {
        dataRequests.push(request.url());
      }
    });
    page.on('response', (response) => {
      if (response.request().method() === 'GET'
        && PROJECT_DATA_PATH.test(new URL(response.url()).pathname)) {
        projectDataBodies.push(response.body().then((body) => body.byteLength).catch(() => 0));
      }
    });

    const response = await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    expect(response?.ok()).toBe(true);
    await expect(page.locator('[data-lane-kind="astrid.transcript"]')).toBeVisible({ timeout: 90_000 });
    await expect.poll(() => projectDataBodies.length, {
      message: 'the Runtime must serve a serialized timeline payload',
      timeout: 5_000,
    }).toBeGreaterThan(0);
    const projectDataBytes = Math.max(0, ...(await Promise.all(projectDataBodies)));
    expect(projectDataBytes, 'timeline project data must have a measurable serialized payload').toBeGreaterThan(0);
    expect(projectDataBytes).toBeLessThanOrEqual(BUDGET.serializedProjectDataBytes);

    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const heapBeforeBytes = await readHeapBytes(cdp);

    await page.locator('.timeline-canvas-edit-area').evaluate((scroller) => {
      scroller.scrollLeft = scroller.scrollWidth;
      scroller.dispatchEvent(new Event('scroll'));
    });

    // The Extension Manager is the dialog behind the Extensions tab's Manage control.
    await page.getByRole('tab', { name: 'Extensions' }).click();
    await page.getByRole('button', { name: 'Manage extensions' }).click();
    const manager = page.getByRole('dialog', { name: 'Extensions' });
    await expect(manager.getByRole('button', { name: /^(Disable|Enable) haus\.astrid\./ })).toHaveCount(2);

    // The manager's package-card data attribute is intentionally an internal
    // implementation hook; the rendered contribution badge is the stable
    // user-facing contract and remains present across manager layouts.
    const contributionCount = (await manager.getByText(/\b\d+ contributions?\b/).allTextContents())
      .reduce((total, text) => total + [...text.matchAll(/\b(\d+) contributions?\b/g)]
        .reduce((subtotal, match) => subtotal + Number(match[1]), 0), 0);
    expect(contributionCount).toBeGreaterThan(0);
    expect(contributionCount).toBeLessThanOrEqual(BUDGET.contributionCount);
    await manager.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(manager).toBeHidden();

    const requestsBeforeBurst = dataRequests.length;
    await page.locator('.timeline-canvas-edit-area').evaluate((scroller) => {
      const end = scroller.scrollWidth;
      for (let index = 0; index < 24; index += 1) {
        // Keep the burst at the already-realized end position so the assertion
        // remains about request coalescing, not a race with window relocation.
        scroller.scrollLeft = index === 23 ? end : Math.max(0, end - (index % 3));
        scroller.dispatchEvent(new Event('scroll'));
      }
    });
    const burstDataRequests = dataRequests.length - requestsBeforeBurst;
    expect(burstDataRequests).toBeLessThanOrEqual(BUDGET.burstDataRequests);

    const quietWindowStart = dataRequests.length;
    await page.waitForTimeout(BUDGET.quietWindowMs);
    const quietDataRequests = dataRequests.length - quietWindowStart;
    expect(quietDataRequests).toBeLessThanOrEqual(BUDGET.quietDataRequests);

    const dom = await page.evaluate(() => ({
      nodes: document.getElementsByTagName('*').length,
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    const heapAfterBytes = await readHeapBytes(cdp);
    const heapGrowthBytes = heapBeforeBytes === null || heapAfterBytes === null
      ? null
      : Math.max(0, heapAfterBytes - heapBeforeBytes);
    if (heapGrowthBytes !== null) {
      expect(heapGrowthBytes).toBeLessThanOrEqual(BUDGET.heapGrowthBytes);
    }
    await cdp.detach();

    const evidence = {
      budgets: BUDGET,
      observed: {
        serializedProjectDataBytes: projectDataBytes,
        contributionCount,
        burstDataRequests,
        quietDataRequests,
        domNodes: dom.nodes,
        heapBytes: heapAfterBytes,
        heapGrowthBytes,
      },
    };
    await testInfo.attach('extension-performance-budget.json', {
      body: Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`),
      contentType: 'application/json',
    });
    console.info(`[extension-performance] ${JSON.stringify(evidence.observed)}`);

    expect(dom.nodes, JSON.stringify(evidence)).toBeLessThanOrEqual(BUDGET.domNodes);
    expect(dom.bodyWidth).toBeLessThanOrEqual(dom.viewportWidth);
    if (heapAfterBytes !== null) {
      expect(heapAfterBytes, JSON.stringify(evidence)).toBeLessThanOrEqual(BUDGET.heapBytes);
    }
    expect(issues).toEqual([]);
  });

});
