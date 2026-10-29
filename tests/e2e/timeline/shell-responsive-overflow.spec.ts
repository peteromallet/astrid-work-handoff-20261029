import { expect, test } from "@playwright/test";
import { browserEvidencePath, openEditor, resetFakeRuntimeBaseline } from "./support";

/**
 * The composed editor shell stays inside its viewport at the three device classes: the page never widens, the
 * main grid, timeline and preview lie inside the viewport width, the touch rows and thumb bar fit, and the
 * project and timeline pickers are not pushed off an edge.
 */
const VIEWPORTS = [
  {
    name: "desktop",
    width: 1600,
    height: 1000,
    touch: false,
    screenshot: "25-shell-desktop-node20.png",
  },
  {
    name: "tablet-portrait",
    width: 834,
    height: 1194,
    touch: true,
    screenshot: "26-shell-tablet-portrait-node20.png",
  },
  {
    name: "phone",
    width: 420,
    height: 820,
    touch: true,
    screenshot: "27-shell-phone-node20.png",
  },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(viewport.name, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      ...(viewport.touch
        ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
        : {}),
    });

    test(`keeps composed editor shell inside the ${viewport.name} viewport`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      await resetFakeRuntimeBaseline();
      await openEditor(page);

      const geometry = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const box = element.getBoundingClientRect();
          return {
            x: Math.round(box.x),
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: Math.round(box.height),
            right: Math.round(box.right),
            bottom: Math.round(box.bottom),
          };
        };
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          page: {
            bodyWidth: document.body.scrollWidth,
            documentWidth: document.documentElement.scrollWidth,
          },
          main: rect("main.grid"),
          toolbarNavigation: rect(
            '[data-testid="toolbar-navigation-controls"]',
          ),
          phoneTopRow: rect('[data-toolbar-layout="touch"]'),
          phonePlaybackRow: rect('[data-testid="touch-playback-row"]'),
          touchAgentBar: rect('[data-testid="touch-agent-bar"]'),
          removedModeUi: document.querySelectorAll(
            '[data-timeline-mode-switcher], [aria-label="Phone timeline mode bar"], [aria-label="Timeline mode switcher"]',
          ).length,
          editArea: rect(".timeline-canvas-edit-area"),
          preview: rect('[data-testid="video-editor-preview-surface"]'),
          selectors: Array.from(
            document.querySelectorAll(
              '[data-testid="editor-project-timeline-selectors"] [role="combobox"]',
            ),
          ).map((element) => {
            const box = element.getBoundingClientRect();
            return { left: Math.round(box.left), right: Math.round(box.right) };
          }),
        };
      });

      expect(
        geometry.page.bodyWidth,
        JSON.stringify(geometry),
      ).toBeLessThanOrEqual(viewport.width);
      expect(
        geometry.page.documentWidth,
        JSON.stringify(geometry),
      ).toBeLessThanOrEqual(viewport.width);
      for (const region of [
        geometry.main,
        geometry.editArea,
        geometry.preview,
      ]) {
        expect(region, JSON.stringify(geometry)).not.toBeNull();
        expect(region!.x, JSON.stringify(geometry)).toBeGreaterThanOrEqual(0);
        expect(region!.right, JSON.stringify(geometry)).toBeLessThanOrEqual(
          viewport.width,
        );
      }
      for (const selector of geometry.selectors) {
        expect(selector.left, JSON.stringify(geometry)).toBeGreaterThanOrEqual(
          0,
        );
        expect(selector.right, JSON.stringify(geometry)).toBeLessThanOrEqual(
          viewport.width,
        );
      }

      // The touch editor's thumb bar (gallery, Text, Ask Astrid…) must fit the viewport width: a button
      // pushed off the right edge is a button nobody can tap.
      if (viewport.touch) {
        expect(geometry.touchAgentBar, JSON.stringify(geometry)).not.toBeNull();
        expect(geometry.touchAgentBar!.x, JSON.stringify(geometry)).toBeGreaterThanOrEqual(0);
        expect(geometry.touchAgentBar!.right, JSON.stringify(geometry)).toBeLessThanOrEqual(
          viewport.width,
        );
      }

      // The touch mode switcher is gone on every device.
      expect(geometry.removedModeUi, JSON.stringify(geometry)).toBe(0);
      if (viewport.name === "phone") {
        for (const row of [geometry.phoneTopRow, geometry.phonePlaybackRow]) {
          expect(row, JSON.stringify(geometry)).not.toBeNull();
          expect(row!.x, JSON.stringify(geometry)).toBeGreaterThanOrEqual(0);
          expect(row!.right, JSON.stringify(geometry)).toBeLessThanOrEqual(
            viewport.width,
          );
        }
      }

      await page.screenshot({
        path: browserEvidencePath(testInfo, `chrome-acceptance/${viewport.screenshot}`),
        fullPage: true,
        animations: "disabled",
      });
    });
  });
}
