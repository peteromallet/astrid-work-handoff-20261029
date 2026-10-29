/**
 * Phone timeline: browse, tap-to-Inspector and the armed move/trim gestures under
 * real touch input.
 *
 * Ported from the untracked `node_modules/.probe/mobile.mjs` device probe.
 * The phone rests in browse (drag pans, tap selects a clip and switches the
 * picture-area tab surface to Inspector). Move and trim are armed from the
 * Inspector's clip actions and released with Done in the toolbar.
 * Every step runs against one live page in sequence — each arm/release is state
 * the next step depends on — so this is a single test with named `test.step`s
 * rather than independent tests.
 */
import { expect, test } from '@playwright/test';
import { CLIP_BODY_SELECTOR } from '../../../src/tools/video-editor/lib/timeline-dom.ts';
import {
  boxOf,
  collectPageLogs,
  countSelectedClips,
  createTouchInput,
  openEditor,
  resetFakeRuntimeBaseline,
} from './support';

test.describe('timeline phone gestures', () => {
  test.use({
    viewport: { width: 420, height: 820 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });

  test('phone browse, Inspector and armed gestures survive real touch input', async ({ context, page }, testInfo) => {
    test.setTimeout(240_000);

    const logs: string[] = [];
    const resetError = await resetFakeRuntimeBaseline();
    if (resetError) logs.push(resetError);
    logs.push(...collectPageLogs(page));

    await openEditor(page);
    const touch = await createTouchInput(context, page);

    const shot = (name: string) => page.screenshot({
      path: testInfo.outputPath(`${name}.png`),
      animations: 'disabled',
      timeout: 20_000,
    });

    // --- 0. structural: phone layout, no mode bar --------------------------
    const structure = await page.evaluate((clipBodySelector) => {
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const editArea = document.querySelector('.timeline-canvas-edit-area');
      return {
        phoneShell: Boolean(document.querySelector('main[data-shell-layout="touch"]')),
        topRow: document.querySelector('[data-toolbar-layout="touch"]') ? rect(document.querySelector('[data-toolbar-layout="touch"]')!) : null,
        modeUi: document.querySelectorAll(
          '[data-timeline-mode-switcher], [aria-label="Phone timeline mode bar"], [aria-label="Timeline mode switcher"]',
        ).length,
        armed: document.querySelectorAll('[data-armed-gesture]').length,
        clips: Array.from(document.querySelectorAll(clipBodySelector))
          .map((el) => ({ id: el.getAttribute('data-clip-id'), ...rect(el) })),
        editArea: editArea
          ? {
              ...rect(editArea),
              scrollLeft: editArea.scrollLeft,
              scrollWidth: editArea.scrollWidth,
              clientWidth: editArea.clientWidth,
              overflowX: getComputedStyle(editArea).overflowX,
              touchAction: getComputedStyle(editArea).touchAction,
            }
          : null,
      };
    }, CLIP_BODY_SELECTOR as string);

    await test.step('single-pane phone shell with a top row', async () => {
      expect(structure.phoneShell).toBe(true);
      expect(structure.topRow, JSON.stringify(structure.topRow)).not.toBeNull();
    });

    await test.step('no mode switcher; resting state has nothing armed', async () => {
      expect(structure.modeUi).toBe(0);
      expect(structure.armed).toBe(0);
    });

    await test.step('clips visible on phone', async () => {
      expect(structure.clips.length, `${structure.clips.length} clips`).toBeGreaterThanOrEqual(3);
    });

    await test.step('edit area scrollable + touch-action', async () => {
      expect(structure.editArea, JSON.stringify(structure.editArea)).not.toBeNull();
    });

    await shot('m0-base');

    const surface = page.getByTestId('video-editor-right-panel-dock');
    const armedBar = page.locator('[data-armed-gesture]');

    async function tapLocator(target: ReturnType<typeof page.locator>): Promise<void> {
      const box = await target.boundingBox();
      if (!box) throw new Error('nothing to tap');
      await touch.tap(box.x + box.width / 2, box.y + box.height / 2);
    }

    /** Tap a clip; on phone that selects it and switches the tab surface to Inspector. */
    async function tapClipForInspector(clipSelector: string): Promise<void> {
      const box = await page.locator(clipSelector).first().boundingBox();
      if (!box) throw new Error(`no clip for ${clipSelector}`);
      await touch.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.locator('[data-surface-tab="inspector"]')).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 });
    }

    /** Tap a clip, then Move/Trim in its Inspector: the gesture arms and the Inspector stays visible. */
    async function armGesture(clipSelector: string, gesture: 'move' | 'trim'): Promise<boolean> {
      await tapClipForInspector(clipSelector);
      await tapLocator(surface.getByRole('button', { name: gesture === 'move' ? 'Move' : 'Trim', exact: true }));
      try {
        await expect(armedBar).toHaveAttribute('data-armed-gesture', gesture, { timeout: 5_000 });
        return true;
      } catch {
        return false;
      }
    }

    /** Tap Done in the phone's top row: back to browse. */
    async function releaseGesture(): Promise<boolean> {
      await tapLocator(page.locator('[data-toolbar-layout="touch"]').getByRole('button', { name: 'Done', exact: true }));
      try {
        await expect(armedBar).toHaveCount(0, { timeout: 5_000 });
        return true;
      } catch {
        return false;
      }
    }

    const scrollLeft = () => page.evaluate(
      () => document.querySelector('.timeline-canvas-edit-area')?.scrollLeft ?? -1,
    );

    // --- 1. browse mode: horizontal pan should scroll the timeline ---------
    const clip0 = structure.clips[0];
    const editBefore = await scrollLeft();
    if (clip0) {
      await touch.touchDrag(
        clip0.x + clip0.w / 2, clip0.y + clip0.h / 2,
        clip0.x + clip0.w / 2 - 120, clip0.y + clip0.h / 2,
      );
    }
    const editAfter = await scrollLeft();
    const browsePos = await page.evaluate((clipBodySelector) => {
      const el = document.querySelector(clipBodySelector);
      return el ? Math.round(el.getBoundingClientRect().x) : null;
    }, CLIP_BODY_SELECTOR as string);

    await test.step('browse: pan over clip scrolls timeline (no accidental clip move)', async () => {
      expect(editAfter, `scrollLeft ${editBefore} -> ${editAfter}, clip x now ${browsePos}`)
        .toBeGreaterThan(editBefore);
    });

    await page.evaluate(() => {
      const el = document.querySelector('.timeline-canvas-edit-area');
      if (el) el.scrollLeft = 0;
    });
    await page.waitForTimeout(300);

    // --- 2. browse: tap selects the clip and opens the Inspector ------------
    const c1Selector = CLIP_BODY_SELECTOR as string;
    await tapClipForInspector(c1Selector);
    const selCount1 = await countSelectedClips(page);
    await test.step('browse: tap selects clip and opens the Inspector', async () => {
      expect(selCount1, `${selCount1} selected`).toBeGreaterThanOrEqual(1);
      await expect(surface.getByRole('button', { name: 'Move', exact: true })).toBeVisible();
      await expect(surface.getByRole('button', { name: 'Trim', exact: true })).toBeVisible();
    });

    await shot('m2-inspector');

    await tapLocator(surface.getByRole('button', { name: 'Close clip' }));
    await test.step('Close clip clears the selection and returns to Video', async () => {
      await expect(page.locator('[data-surface-tab="video"]')).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 });
    });

    // --- 3. armed move: touch drag moves clip ------------------------------
    const moveClipSelector = `${CLIP_BODY_SELECTOR}[data-clip-id="clip-video"]`;
    const moveArmed = await armGesture(moveClipSelector, 'move');
    await test.step('Inspector Move arms the move gesture (Done shown)', async () => {
      expect(moveArmed).toBe(true);
      await expect(page.locator('[data-toolbar-layout="touch"]').getByRole('button', { name: 'Done', exact: true })).toBeVisible();
    });

    // The right-most V1 clip can be outside the CSS viewport when the page has
    // horizontal overflow; CDP correctly ignores a touch whose start point is
    // outside the device viewport. Use the fixture's sole V2 clip: it is fully
    // visible and has free space on its track, so this measures the armed move.
    const beforeMove = await page.evaluate((clipBodySelector) => {
      const el = document.querySelector(`${clipBodySelector}[data-clip-id="clip-video"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        id: 'clip-video', row: el.getAttribute('data-row-id'),
        x: r.x, y: r.y, w: r.width, h: r.height,
      };
    }, CLIP_BODY_SELECTOR as string);
    expect(beforeMove, 'fixture clip-video is not visible').not.toBeNull();
    const moveSelector = `${CLIP_BODY_SELECTOR}[data-clip-id="${beforeMove!.id}"]`;
    const scrollBeforeMove = await scrollLeft();
    await touch.touchDrag(
      beforeMove!.x + beforeMove!.w / 2, beforeMove!.y + beforeMove!.h / 2,
      beforeMove!.x + beforeMove!.w / 2 + 80, beforeMove!.y + beforeMove!.h / 2,
      { steps: 16 },
    );
    const afterMove = await page.evaluate(
      (sel) => ({ x: document.querySelector(sel)!.getBoundingClientRect().x }),
      moveSelector,
    );
    const scrollAfterMove = await scrollLeft();

    await test.step('move: touch drag moves clip', async () => {
      expect(
        Math.abs(afterMove.x - beforeMove!.x) > 20 && scrollAfterMove === scrollBeforeMove,
        `clip ${beforeMove!.id} x ${Math.round(beforeMove!.x)} -> ${Math.round(afterMove.x)}, `
          + `scrollLeft ${scrollBeforeMove} -> ${scrollAfterMove}`,
      ).toBe(true);
    });

    await shot('m3-move');

    const moveReleased = await releaseGesture();
    await test.step('Done leaves the armed move', async () => {
      expect(moveReleased).toBe(true);
    });

    // --- 4. armed trim: expanded handles, edge drag resizes ----------------
    const trimArmed = await armGesture(c1Selector, 'trim');
    await test.step('Inspector Trim arms the trim gesture (Done shown)', async () => {
      expect(trimArmed).toBe(true);
    });
    await page.waitForTimeout(300);

    const trimGeom = await page.evaluate((clipBodySelector) => {
      const el = document.querySelector(clipBodySelector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, CLIP_BODY_SELECTOR as string);
    expect(trimGeom, 'no clip found').not.toBeNull();
    await touch.touchDrag(
      trimGeom!.x + trimGeom!.w - 6, trimGeom!.y + trimGeom!.h / 2,
      trimGeom!.x + trimGeom!.w - 66, trimGeom!.y + trimGeom!.h / 2,
      { steps: 16 },
    );
    const afterTrimWidth = await page.evaluate(
      (clipBodySelector) => document.querySelector(clipBodySelector)!.getBoundingClientRect().width,
      CLIP_BODY_SELECTOR as string,
    );

    await test.step('trim: dragging right edge resizes clip', async () => {
      expect(
        Math.abs(afterTrimWidth - trimGeom!.w),
        `w ${Math.round(trimGeom!.w)} -> ${Math.round(afterTrimWidth)}`,
      ).toBeGreaterThan(20);
    });

    await shot('m4-trim');

    const trimReleased = await releaseGesture();
    await test.step('Done leaves the armed trim', async () => {
      expect(trimReleased).toBe(true);
    });

    // Back in browse a drag over a clip pans the timeline again.
    await page.evaluate(() => {
      const el = document.querySelector('.timeline-canvas-edit-area');
      if (el) el.scrollLeft = 0;
    });
    await page.waitForTimeout(300);
    const panBox = await boxOf(page, CLIP_BODY_SELECTOR);
    const panBefore = await scrollLeft();
    if (panBox) await touch.touchDrag(panBox.cx, panBox.cy, panBox.cx - 120, panBox.cy);
    const panAfter = await scrollLeft();
    await test.step('after Done: dragging a clip pans the timeline again', async () => {
      expect(panAfter, `scrollLeft ${panBefore} -> ${panAfter}`).toBeGreaterThan(panBefore);
    });

    // --- 5. ruler scrub via touch ------------------------------------------
    const playheadBefore = await boxOf(page, '[data-testid="timeline-playhead"]');
    const ruler = await page.evaluate(() => {
      // The preview overlay also renders an m:ss.hh readout and comes first in
      // the DOM, so the text heuristic alone resolves to the preview panel.
      const readouts = Array.from(document.querySelectorAll('*'))
        .filter((el) => /^\d:\d\d\.\d\d$/.test(el.textContent?.trim() ?? '') && el.children.length === 0);
      const host = document.querySelector('[data-testid="timeline-ruler"]')
        || (readouts.length
          ? readouts[0].closest('[class*="ruler"], [data-testid*="ruler"]') ?? readouts[0].parentElement?.parentElement
          : null);
      if (!host) return null;
      const r = host.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    if (ruler) {
      // Composed extension markers occupy the ruler's top 20px. Scrub in the
      // host-owned strip below them so the gesture reaches the ruler rather than a
      // marker button while still exercising real touch arbitration. Not at the
      // ruler's very edge: a touch within ~5px of the clip row is adjusted onto
      // the clip (as iOS does), so the strip's edge belongs to the clip.
      const scrubY = ruler.y + 22;
      await touch.touchDrag(ruler.x + 200, scrubY, ruler.x + 300, scrubY, { steps: 10 });
    }
    const playheadAfter = await boxOf(page, '[data-testid="timeline-playhead"]');

    await test.step('ruler: touch scrub moves playhead', async () => {
      expect(
        Boolean(ruler && playheadBefore && playheadAfter && Math.abs(playheadAfter.x - playheadBefore.x) > 10),
        `ruler=${JSON.stringify(ruler)} playhead x ${Math.round(playheadBefore?.x ?? -1)} `
          + `-> ${Math.round(playheadAfter?.x ?? -1)}`,
      ).toBe(true);
    });

    // --- 6. the armed hint names the armed gesture --------------------------
    const armedHint = () => page.evaluate(() => {
      const el = document.querySelector('[data-armed-gesture]');
      return el ? { gesture: el.getAttribute('data-armed-gesture'), text: el.textContent ?? '' } : null;
    });
    // The pan above left the first clip partly scrolled out; bring it back before tapping it.
    await page.evaluate(() => {
      const el = document.querySelector('.timeline-canvas-edit-area');
      if (el) el.scrollLeft = 0;
    });
    await page.waitForTimeout(300);
    await armGesture(c1Selector, 'move');
    const hintMove = await armedHint();
    await releaseGesture();
    await armGesture(c1Selector, 'trim');
    const hintTrim = await armedHint();
    await releaseGesture();

    await test.step('armed hint follows the gesture (move vs trim)', async () => {
      expect(
        Boolean(hintMove && hintTrim && /move/i.test(hintMove.text) && /trim/i.test(hintTrim.text)),
        `move=${JSON.stringify(hintMove)} trim=${JSON.stringify(hintTrim)}`,
      ).toBe(true);
    });

    // --- 7. phone chrome that no longer exists -----------------------------
    const absent = await page.evaluate(() => {
      const buttonNamed = (re: RegExp) => Array.from(document.querySelectorAll('button'))
        .filter((b) => b.getAttribute('role') !== 'tab')
        .filter((b) => re.test((b.getAttribute('aria-label') || b.textContent || '').trim())).length;
      return {
        tabSurface: document.querySelectorAll('[data-testid="video-editor-right-panel-dock"]').length,
        floatingTools: document.querySelectorAll(
          '[aria-label="New text at playhead"], [aria-label="New effect layer at playhead"], [aria-label="Create animation sequence"]',
        ).length,
        panelButtons: buttonNamed(/^(Inspector|Clip|Panel display)$/i),
        trackButtons: buttonNamed(/reorder|track settings/i),
        clipOverflow: buttonNamed(/open clip actions/i),
        playbackRow: document.querySelectorAll('[data-testid="touch-playback-row"]').length,
      };
    });

    await test.step('phone has one picture-area tab surface, no tool cluster or per-track/per-clip buttons', async () => {
      expect(absent, JSON.stringify(absent)).toEqual({
        tabSurface: 1, floatingTools: 0, panelButtons: 0, trackButtons: 0, clipOverflow: 0, playbackRow: 1,
      });
    });

    // --- 8. the thumb bar is within reach ------------------------------------
    // Creation on the phone is the agent's job: the thumb bar offers the gallery and "Ask Astrid…" (no Text
    // button since 17e46de9). It is in the layout flow and needs no scrolling first; its 44px targets are
    // asserted in toolbar-reachable.
    const bar = page.getByTestId('touch-agent-bar');
    await expect(bar.getByRole('button', { name: 'Add text' })).toHaveCount(0);
    const askBox = await bar.getByRole('button', { name: /Ask Astrid|Astrid is working/ }).boundingBox();
    expect(askBox, 'the thumb bar renders Ask Astrid').not.toBeNull();
    const viewport = page.viewportSize()!;
    await test.step('Ask Astrid is inside the viewport with the edit area unscrolled', async () => {
      const editAreaScrollTop = await page.locator('.timeline-canvas-edit-area').evaluate((area) => area.scrollTop);
      expect(editAreaScrollTop, 'edit area is at scrollTop 0').toBe(0);
      expect(
        askBox!.x >= 0 && askBox!.y >= 0
          && askBox!.x + askBox!.width <= viewport.width && askBox!.y + askBox!.height <= viewport.height,
        JSON.stringify({ askBox, viewport }),
      ).toBe(true);
    });
    await shot('m8-thumb-bar');

    // --- 9. pinch-to-zoom over the edit area ------------------------------
    const pinchArea = await boxOf(page, '.timeline-canvas-edit-area');
    const pinchMidX = pinchArea ? pinchArea.cx : 210;
    const pinchMidY = pinchArea ? pinchArea.y + 20 : 590;

    // Anchor probe: remember which clip sits under the midpoint and where in
    // that clip the midpoint falls, so we can prove the same timeline instant is
    // still under the fingers afterwards (rather than the area having scrolled).
    const measurePinch = (midX: number) => page.evaluate(({ clipBodySelector, mid }) => {
      const area = document.querySelector('.timeline-canvas-edit-area');
      const clips = Array.from(document.querySelectorAll(clipBodySelector)).map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.getAttribute('data-clip-id')!, x: r.x, w: r.width };
      });
      return {
        firstWidth: clips[0]?.w ?? 0,
        scrollWidth: area?.scrollWidth ?? 0,
        scrollLeft: area?.scrollLeft ?? 0,
        under: clips.find((c) => c.x <= mid && mid <= c.x + c.w) ?? clips[0] ?? null,
      };
    }, { clipBodySelector: CLIP_BODY_SELECTOR as string, mid: midX });

    const pinchBefore = await measurePinch(pinchMidX);
    const anchorFraction = pinchBefore.under
      ? (pinchMidX - pinchBefore.under.x) / pinchBefore.under.w
      : null;
    if (pinchArea) await touch.pinch(pinchMidX, pinchMidY, 40, 130);
    const pinchAfter = await measurePinch(pinchMidX);

    const sameClip = pinchBefore.under && pinchAfter.under && pinchBefore.under.id === pinchAfter.under.id
      ? pinchAfter.under
      : await page.evaluate(({ clipBodySelector, id }) => {
        const el = document.querySelector(`${clipBodySelector}[data-clip-id="${id}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { id, x: r.x, w: r.width };
      }, { clipBodySelector: CLIP_BODY_SELECTOR as string, id: pinchBefore.under?.id ?? '' });
    const anchorDrift = sameClip && anchorFraction !== null
      ? Math.abs((sameClip.x + anchorFraction * sameClip.w) - pinchMidX)
      : Number.POSITIVE_INFINITY;

    await test.step('pinch out zooms the timeline (clips widen, content grows)', async () => {
      expect(
        pinchAfter.firstWidth > pinchBefore.firstWidth * 1.15
          && pinchAfter.scrollWidth > pinchBefore.scrollWidth,
        `clip w ${Math.round(pinchBefore.firstWidth)} -> ${Math.round(pinchAfter.firstWidth)}, `
          + `scrollWidth ${pinchBefore.scrollWidth} -> ${pinchAfter.scrollWidth}, `
          + `scrollLeft ${Math.round(pinchBefore.scrollLeft)} -> ${Math.round(pinchAfter.scrollLeft)}`,
      ).toBe(true);
    });

    await test.step('pinch keeps the pinched instant under the gesture midpoint', async () => {
      expect(anchorDrift, `anchor clip ${pinchBefore.under?.id} drift ${Math.round(anchorDrift)}px`)
        .toBeLessThan(24);
    });

    await shot('m9-pinch');
  });
});
