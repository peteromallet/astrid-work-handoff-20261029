import { expect, test } from '@playwright/test';
import { CLIP_BODY_SELECTOR } from '../../../src/tools/video-editor/lib/timeline-dom.ts';
import { openEditor, resetFakeRuntimeBaseline } from './support';

/**
 * On a narrow window the right panel starts closed (the Inspector default is a viewport-width choice:
 * open from 1024px up), so the preview and the timeline are what a user sees first. The touch editor
 * (phone and tablet) shows its Video | Inspector | Extensions tabs in place of the picture, on Video. Either
 * way nothing floats over the preview, the ruler or the first clip: each is the topmost element at its
 * own centre, so a tap there reaches it.
 *
 * The desktop case sits at 900px, the narrowest band that is still the desktop editor with a mouse:
 * below 768px the app counts any window as a phone and mounts the touch shell instead.
 */
const NARROW_VIEWPORTS = [
  { name: 'condensed desktop', width: 900, height: 760, touch: false },
  { name: 'phone', width: 390, height: 844, touch: true },
] as const;

for (const viewport of NARROW_VIEWPORTS) {
  test.describe(viewport.name, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      ...(viewport.touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}),
    });

    test('starts with the right panel closed, so the preview and the timeline are reachable', async ({ page }) => {
      test.setTimeout(150_000);
      await resetFakeRuntimeBaseline();
      await openEditor(page);

      const dock = page.getByTestId('video-editor-right-panel-dock');
      if (viewport.touch) {
        // The touch editor puts Video | Inspector | Extensions in the picture's own box (8a8a3218) and opens on
        // Video, so the Inspector and the extension panels are a tab away, never a layer over the editor.
        await expect(dock).toHaveCount(1);
        await expect(dock).toHaveAttribute('data-placement', 'picture');
        await expect(dock.getByRole('tab', { name: 'Video' })).toHaveAttribute('aria-selected', 'true');
      } else {
        // The condensed desktop dock is a sidebar column of the grid, never a layer over the editor.
        await expect(dock).toHaveAttribute('data-responsive', 'false');
        await expect(dock).toHaveAttribute('data-open', 'false');
      }

      for (const selector of [
        '[data-testid="video-editor-preview-surface"]',
        '[data-testid="timeline-ruler"]',
        '[data-clip-id="clip-hero"]',
      ]) {
        const target = page.locator(selector).first();
        await expect(target, selector).toBeVisible();
        const reachable = await target.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return top !== null && element.contains(top);
        });
        expect(reachable, `${selector} is not covered`).toBe(true);
      }
    });
  });
}

/**
 * The touch editor's way into what goes in the film is its thumb bar: the gallery and "Ask Astrid…" (text is
 * added by asking Astrid; the bar has no Text button since 17e46de9).
 * It is in the layout flow below the timeline, so it is on screen the moment the editor opens, fully
 * inside the viewport, on top of whatever is at its centre, covers no part of the timeline, and every
 * target is a finger-sized 44px.
 */
const TOUCH_DEVICES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet portrait', width: 834, height: 1194 },
  { name: 'tablet landscape', width: 1180, height: 820 },
] as const;
const THUMB_BAR_BUTTONS = [
  { name: 'Open gallery' },
  { name: /Ask Astrid|Astrid is working/ },
] as const;

for (const device of TOUCH_DEVICES) {
  test.describe(`thumb bar on ${device.name}`, () => {
    test.use({
      viewport: { width: device.width, height: device.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });

    test('thumb bar reachable without scrolling', async ({ page }) => {
      test.setTimeout(150_000);
      await resetFakeRuntimeBaseline();
      await openEditor(page);

      const bar = page.getByTestId('touch-agent-bar');
      await expect(bar).toHaveCount(1);
      // The create tools are gone from the touch timeline: adding elements is the agent's job there.
      await expect(page.getByTestId('timeline-tool-buttons')).toHaveCount(0);

      // Nothing was scrolled to get here.
      const scroll = await page.evaluate(() => ({
        editArea: document.querySelector('.timeline-canvas-edit-area')?.scrollTop ?? -1,
        window: window.scrollY,
      }));
      expect(scroll, 'edit area and window are unscrolled at open').toEqual({ editArea: 0, window: 0 });

      for (const { name } of THUMB_BAR_BUTTONS) {
        const button = bar.getByRole('button', { name });
        await expect(button, String(name)).toHaveCount(1);
        const box = await button.evaluate((element, clipSelector) => {
          const intersects = (a: DOMRect, b: DOMRect) => (
            a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
          );
          const rect = element.getBoundingClientRect();
          const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          const covered = [
            document.querySelector('[data-testid="timeline-ruler"]'),
            document.querySelector('.timeline-canvas-edit-area'),
            ...Array.from(document.querySelectorAll(clipSelector)),
          ].filter((entry): entry is Element => entry !== null);
          return {
            w: rect.width,
            h: rect.height,
            inViewport: rect.left >= 0 && rect.top >= 0
              && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight,
            topmost: top !== null && element.contains(top),
            overlapsTimeline: covered.some((entry) => intersects(rect, entry.getBoundingClientRect())),
          };
        }, CLIP_BODY_SELECTOR as string);

        expect(box.w, `${String(name)} width`).toBeGreaterThanOrEqual(44);
        expect(box.h, `${String(name)} height`).toBeGreaterThanOrEqual(44);
        expect(box.inViewport, `${String(name)} lies inside the viewport`).toBe(true);
        expect(box.topmost, `${String(name)} is the topmost element at its centre`).toBe(true);
        expect(box.overlapsTimeline, `${String(name)} covers nothing of the timeline`).toBe(false);
      }

      // The touch rows keep their shape: the playback row (undo, redo, readout, scrubber) and the
      // document row each stay on one line, so undo is never split from the scrubber it belongs with.
      const rows = await page.evaluate(() => {
        const spread = (selector: string) => {
          const row = document.querySelector(selector);
          if (!row) return null;
          const centres = Array.from(row.querySelectorAll('button, [role="slider"], span'))
            .map((element) => element.getBoundingClientRect())
            .filter((box) => box.width > 0 && box.height > 0)
            .map((box) => box.top + box.height / 2);
          return { count: centres.length, spread: Math.max(...centres) - Math.min(...centres) };
        };
        return {
          playback: spread('[data-testid="touch-playback-row"]'),
          toolbar: spread('[data-toolbar-layout="touch"]'),
        };
      });
      expect(rows.playback, 'the touch playback row is mounted').not.toBeNull();
      expect(rows.playback!.count, 'the playback row has controls').toBeGreaterThan(0);
      expect(rows.playback!.spread, 'playback row controls share a line').toBeLessThan(6);
      if (rows.toolbar && rows.toolbar.count > 0) {
        expect(rows.toolbar.spread, 'toolbar row controls share a line').toBeLessThan(6);
      }

      // Text goes in by asking Astrid on touch: the bar offers no Text button.
      await expect(bar.getByRole('button', { name: 'Add text' })).toHaveCount(0);
    });
  });
}
