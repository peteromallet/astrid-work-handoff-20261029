/**
 * Tablet timeline: the phone's touch shell on iPad-sized screens, in both
 * orientations. Armed move/trim reachability and touch clip-drag.
 *
 * Ported from the untracked `node_modules/.probe/ipad.mjs` device probe. Tablets
 * get the same touch shell as phones. The picture area holds the Video | Inspector |
 * Extensions tab surface, so there is no separate dock. Tapping a clip selects it
 * and switches to the Inspector tab. Move and Trim are armed from the Inspector's
 * clip actions and are released with Done in the document row. There is no touch
 * marquee: select mode is not reachable from any touch UI.
 */
import { expect, test, type Page } from '@playwright/test';
import { CLIP_BODY_SELECTOR } from '../../../src/tools/video-editor/lib/timeline-dom.ts';
import {
  collectPageLogs,
  countSelectedClips,
  createTouchInput,
  openEditor,
  pickFreeDraggableClip,
  resetFakeRuntimeBaseline,
} from './support';

const IPAD_USER_AGENT = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
  + ' (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const ORIENTATIONS = [
  { name: 'portrait', viewport: { width: 834, height: 1194 }, tag: 'ipad-port' },
  { name: 'landscape', viewport: { width: 1180, height: 820 }, tag: 'ipad-land' },
] as const;

for (const orientation of ORIENTATIONS) {
  test.describe(`timeline tablet gestures (${orientation.name})`, () => {
    test.use({
      viewport: orientation.viewport,
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
      userAgent: IPAD_USER_AGENT,
    });

    test(`tablet ${orientation.name}: Inspector, armed gestures and drag under touch`, async ({ context, page }, testInfo) => {
      test.setTimeout(240_000);

      const logs: string[] = [];
      const resetError = await resetFakeRuntimeBaseline();
      if (resetError) logs.push(resetError);
      logs.push(...collectPageLogs(page));

      await openEditor(page);
      const touch = await createTouchInput(context, page);

      const shot = (name: string) => page.screenshot({
        path: testInfo.outputPath(`${orientation.tag}-${name}.png`),
        animations: 'disabled',
        timeout: 20_000,
      });

      // --- structural audit ------------------------------------------------
      const structure = await page.evaluate((clipBodySelector) => {
        const rect = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
        };
        const q = (s: string) => document.querySelector(s);
        const editArea = q('.timeline-canvas-edit-area');
        const preview = q('[data-testid="video-editor-preview-surface"]');
        return {
          viewport: { w: window.innerWidth, h: window.innerHeight },
          touchShell: Boolean(q('main[data-shell-layout="touch"]')),
          touchRow: Boolean(q('[data-toolbar-layout="touch"]')),
          tabSurface: document.querySelectorAll('[data-testid="video-editor-right-panel-dock"]').length,
          modeUi: document.querySelectorAll(
            '[data-timeline-mode-switcher], [aria-label="Phone timeline mode bar"], [aria-label="Timeline mode switcher"]',
          ).length,
          clips: Array.from(document.querySelectorAll(clipBodySelector))
            .map((el) => ({ id: el.getAttribute('data-clip-id'), ...rect(el) })),
          editArea: editArea ? rect(editArea) : null,
          preview: preview ? rect(preview) : null,
        };
      }, CLIP_BODY_SELECTOR as string);

      testInfo.annotations.push({ type: 'viewport', description: JSON.stringify(structure.viewport) });
      testInfo.annotations.push({
        type: 'mode switcher elements (expected 0)',
        description: String(structure.modeUi),
      });

      await test.step('tablet uses the touch shell with one picture-area tab surface', async () => {
        expect(structure.touchShell, 'main[data-shell-layout="touch"]').toBe(true);
        expect(structure.touchRow, '[data-toolbar-layout="touch"]').toBe(true);
        expect(structure.tabSurface).toBe(1);
      });

      await test.step('clips render on tablet', async () => {
        expect(structure.clips.length, `${structure.clips.length}`).toBeGreaterThanOrEqual(3);
      });

      await test.step('preview has real height', async () => {
        expect(structure.preview?.h ?? 0, JSON.stringify(structure.preview)).toBeGreaterThan(150);
      });

      await test.step('timeline edit area visible', async () => {
        expect(structure.editArea?.h ?? 0, JSON.stringify(structure.editArea)).toBeGreaterThan(80);
      });

      await shot('base');

      await test.step('no mode switcher on tablet', async () => {
        expect(structure.modeUi).toBe(0);
      });

      // --- browse (tablet default): tap selects and opens the Inspector -----
      const surface = page.getByTestId('video-editor-right-panel-dock');
      const armedBar = page.locator('[data-armed-gesture]');
      const touchRow = page.locator('[data-toolbar-layout="touch"]');
      const done = touchRow.getByRole('button', { name: 'Done', exact: true });

      async function tapLocator(target: ReturnType<Page['locator']>): Promise<void> {
        const box = await target.boundingBox();
        if (!box) throw new Error('nothing to tap');
        await touch.tap(box.x + box.width / 2, box.y + box.height / 2);
      }

      /** Tap a clip by id; on tablet that selects it and switches the tab surface to Inspector. */
      async function tapClipForInspector(clipId: string): Promise<void> {
        await tapLocator(page.locator(`${CLIP_BODY_SELECTOR}[data-clip-id="${clipId}"]`).first());
        await expect(page.locator('[data-surface-tab="inspector"]')).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 });
      }

      /** Tap a clip, then Move/Trim in its Inspector: the gesture arms and the Inspector stays visible. */
      async function armFromInspector(clipId: string, gesture: 'move' | 'trim'): Promise<void> {
        await tapClipForInspector(clipId);
        await tapLocator(surface.getByRole('button', { name: gesture === 'move' ? 'Move' : 'Trim', exact: true }));
        await expect(armedBar).toHaveAttribute('data-armed-gesture', gesture, { timeout: 5_000 });
      }

      const c0 = structure.clips[0];
      if (c0) await touch.tap(c0.x + c0.w / 2, c0.y + c0.h / 2);
      const tapSelected = await countSelectedClips(page);

      await test.step('tablet browse: tap selects clip and opens the Inspector', async () => {
        expect(tapSelected, `${tapSelected} selected`).toBeGreaterThanOrEqual(1);
        await expect(page.locator('[data-surface-tab="inspector"]')).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 });
      });

      await shot('selected');

      await test.step('Inspector offers Move and Trim as >=44px controls', async () => {
        const moveButton = surface.getByRole('button', { name: 'Move', exact: true });
        const trimButton = surface.getByRole('button', { name: 'Trim', exact: true });
        await expect(moveButton).toBeVisible();
        await expect(trimButton).toBeVisible();
        const heights = [(await moveButton.boundingBox())?.height ?? 0, (await trimButton.boundingBox())?.height ?? 0];
        expect(heights.every((h) => h >= 44), `Move/Trim heights ${heights.join('/')}`).toBe(true);
      });

      await tapLocator(surface.getByRole('button', { name: 'Close clip' }));
      await test.step('Close clip clears the selection and returns to Video', async () => {
        await expect(page.locator('[data-surface-tab="video"]')).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 });
      });

      // --- Inspector Move arms the gesture, then drag a clip -----------------
      const beforeMove = await pickFreeDraggableClip(page);
      expect(beforeMove, 'no clip found').not.toBeNull();
      await armFromInspector(beforeMove!.id!, 'move');

      await test.step('tablet Inspector Move arms the gesture (Done shown)', async () => {
        await expect(done).toBeVisible();
      });

      const scrollLeft = () => page.evaluate(
        () => document.querySelector('.timeline-canvas-edit-area')?.scrollLeft ?? -1,
      );
      const scrollBefore = await scrollLeft();
      await touch.touchDrag(
        beforeMove!.x + beforeMove!.w / 2, beforeMove!.y + beforeMove!.h / 2,
        beforeMove!.x + beforeMove!.w / 2 + 90, beforeMove!.y + beforeMove!.h / 2,
        { steps: 16 },
      );
      const afterMove = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? { x: el.getBoundingClientRect().x } : null;
      }, `${CLIP_BODY_SELECTOR}[data-clip-id="${beforeMove!.id}"]`);
      const scrollAfter = await scrollLeft();

      await test.step('tablet armed move: touch drag moves clip', async () => {
        expect(
          Boolean(afterMove) && Math.abs(afterMove!.x - beforeMove!.x) > 25 && scrollAfter === scrollBefore,
          `${beforeMove!.id} x ${Math.round(beforeMove!.x)} -> ${afterMove ? Math.round(afterMove.x) : 'gone'}, `
            + `scrollLeft ${scrollBefore} -> ${scrollAfter}`,
        ).toBe(true);
      });

      // --- Done releases the move; Inspector Trim arms and Done releases it --
      await tapLocator(done);
      await test.step('tablet Done leaves the armed move', async () => {
        await expect(armedBar).toHaveCount(0, { timeout: 5_000 });
      });

      await armFromInspector(beforeMove!.id!, 'trim');
      await test.step('tablet Inspector Trim arms the gesture, Done releases it', async () => {
        await expect(armedBar).toHaveAttribute('data-armed-gesture', 'trim', { timeout: 5_000 });
        await tapLocator(done);
        await expect(armedBar).toHaveCount(0, { timeout: 5_000 });
      });

      await shot('final');
    });
  });
}
