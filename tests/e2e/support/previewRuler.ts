/**
 * Seeking the editor's preview by clicking its ruler, shared by every browser spec that needs "the preview at about time T".
 *
 * A ruler click names a raw pointer time and the preview later reports the snapped frame time, so a position is found in
 * two steps: two clicks calibrate the screen-x to rendered-time mapping for the current zoom, then a click at the calibrated
 * x is corrected by the frames it missed. Moved out of timeline/seeded-preview-samples.spec.ts so the three-products journey
 * seeks the same way (a copy would drift).
 */
import { expect, type Page } from '@playwright/test';

export const PREVIEW_SURFACE = '[data-testid="video-editor-preview-surface"]';
export const RULER = '[data-testid="timeline-ruler"]';

export type RulerCalibration = {
  x1: number;
  time1: number;
  x2: number;
  time2: number;
  pixelsPerSecond: number;
};

/** What a spec knows about the timeline it seeks in. */
export interface RulerTimeline {
  fps: number;
  /** The track-name column's width (the timeline's `startLeft`): the ruler's first pixels are a gutter where time is clamped to 0. */
  startLeft: number;
  /** The element whose right edge ends the composition: the preview stops being seekable there. */
  lastClipSelector: string;
}

export async function currentPreviewTime(page: Page): Promise<number> {
  const raw = await page.locator(PREVIEW_SURFACE).getAttribute('data-current-time');
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`preview has no finite data-current-time: ${String(raw)}`);
  return value;
}

/**
 * Click the ruler at `x` and return the playhead time the click produced. A ruler click sets the raw
 * pointer time at once and the preview later reports the snapped frame time; both name the same frame
 * (`seek` rounds to the nearest frame), so the click has landed exactly when the *frame* differs from
 * the one before it. Waiting on the frame also ignores a late snapped update from the previous click.
 *
 * Every click, correction clicks included, must change the frame. That holds for a fixed seed: a
 * correction moves the pointer by at least one frame of pixels and `seek` rounds to the nearest frame.
 * It would fail (a 5 s poll timeout, not a retry) if a sampled frame equalled the frame the preceding
 * calibration click left, or if the zoom were low enough that a correction moved less than half a frame.
 */
export async function clickRulerAndReadTime(page: Page, x: number, fps: number): Promise<number> {
  const ruler = await page.locator(RULER).boundingBox();
  if (!ruler) throw new Error('timeline ruler has no browser box');
  const beforeFrame = Math.round((await currentPreviewTime(page)) * fps);
  await page.mouse.click(x, ruler.y + ruler.height / 2);
  await expect.poll(
    async () => Math.round((await currentPreviewTime(page)) * fps),
    { timeout: 5_000, message: `ruler click at x=${x.toFixed(2)} must move the playhead off frame ${beforeFrame}` },
  ).not.toBe(beforeFrame);
  return currentPreviewTime(page);
}

export async function calibrateRuler(page: Page, timeline: RulerTimeline): Promise<RulerCalibration> {
  const ruler = await page.locator(RULER).boundingBox();
  if (!ruler) throw new Error('timeline ruler has no browser box');
  // Two real pointer clicks establish the screen-x to rendered-time mapping
  // for the current zoom. Anchoring from observed frame times accounts for
  // Remotion's frame snapping and avoids relying on stale pixel geometry.
  // The ruler's first `startLeft` pixels are the track-label gutter, where time is clamped to 0.
  // The ruler runs on past the end of the composition, but the preview cannot: a click there reports the
  // raw ruler time at once and then the clamped last-frame time, so which of the two a read lands on is a
  // race and a mapping built from it is wrong. Both calibration points therefore sit inside the
  // composition, found from the rendered right edge of its last clip, whatever width the shell leaves the ruler.
  const lastClip = await page.locator(timeline.lastClipSelector).boundingBox();
  if (!lastClip) throw new Error('last clip has no browser box');
  const axisStart = ruler.x + timeline.startLeft;
  const playableEnd = Math.min(lastClip.x + lastClip.width, ruler.x + ruler.width);
  const playableWidth = playableEnd - axisStart;
  const x1 = axisStart + playableWidth * 0.12;
  const x2 = axisStart + playableWidth * 0.42;
  const time1 = await clickRulerAndReadTime(page, x1, timeline.fps);
  const time2 = await clickRulerAndReadTime(page, x2, timeline.fps);
  const pixelsPerSecond = (x2 - x1) / (time2 - time1);
  if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) {
    throw new Error(`ruler calibration did not advance: ${JSON.stringify({ x1, time1, x2, time2 })}`);
  }
  return { x1, time1, x2, time2, pixelsPerSecond };
}

export interface RulerSeek {
  requestedFrame: number;
  requestedTime: number;
  observedTime: number;
  observedFrame: number;
  /** Correction clicks it took after the first (a bound, not a retry: the loop is capped and a miss fails the caller's assertions). */
  adjustments: number;
}

/**
 * Click the ruler where the calibration says `requestedFrame` is, correcting by the frames the click missed (at most four
 * corrections), and return what the preview observed. The caller asserts the observed frame.
 */
export async function seekRulerToFrame(page: Page, calibration: RulerCalibration, requestedFrame: number, fps: number, label: string): Promise<RulerSeek> {
  const requestedTime = requestedFrame / fps;
  let x = calibration.x1 + ((requestedTime - calibration.time1) * calibration.pixelsPerSecond);
  const rulerBox = await page.locator(RULER).boundingBox();
  if (!rulerBox) throw new Error(`no ruler box for ${label}`);
  expect(x, `${label}: requested frame ${requestedFrame} must be reachable on the visible ruler`).toBeGreaterThan(rulerBox.x + 2);
  expect(x, `${label}: requested frame ${requestedFrame} must be reachable on the visible ruler`).toBeLessThan(rulerBox.x + rulerBox.width - 2);

  let observedTime = -1;
  let observedFrame = -1;
  let adjustments = 0;
  for (; adjustments < 4; adjustments += 1) {
    observedTime = await clickRulerAndReadTime(page, x, fps);
    observedFrame = Math.round(observedTime * fps);
    if (observedFrame === requestedFrame) break;
    x += (requestedTime - observedTime) * calibration.pixelsPerSecond;
    expect(x, `${label}: calibrated correction must stay on the visible ruler`).toBeGreaterThan(rulerBox.x + 2);
    expect(x, `${label}: calibrated correction must stay on the visible ruler`).toBeLessThan(rulerBox.x + rulerBox.width - 2);
  }
  return { requestedFrame, requestedTime, observedTime, observedFrame, adjustments };
}
