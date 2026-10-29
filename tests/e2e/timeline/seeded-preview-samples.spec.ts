import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test } from '@playwright/test';
import { getTimelineLabelWidth } from '../../../src/tools/video-editor/lib/coordinate-utils.ts';
import { PREVIEW_SURFACE, RULER, calibrateRuler, seekRulerToFrame } from '../support/previewRuler';
import { BASELINE_CLIPS, PROJECT_SLUG, TIMELINE_SLUG, browserEvidencePath, openEditor } from './support';

const FPS = 30;
/** This spec runs on a desktop viewport, where the track-name column (the timeline's `startLeft`) is 144px. */
const TIMELINE_START_LEFT = getTimelineLabelWidth('desktop');
const HERO_CLIP = '[data-clip-id="clip-hero"][role="button"]';
/** Ends the composition (at 6.5s, held 4s): its right edge is where the preview stops being seekable. */
const LAST_CLIP = '[data-clip-id="clip-detail"][role="button"]';

/** The seeded fixture's geometry for the shared ruler seek (tests/e2e/support/previewRuler.ts). */
const TIMELINE = { fps: FPS, startLeft: TIMELINE_START_LEFT, lastClipSelector: LAST_CLIP };

test.describe('seeded browser preview samples', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('asserts eight distinct observed frames across zoom and blend boundaries', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await openEditor(page);
    await expect(page.locator(RULER)).toBeVisible();
    await expect(page.locator(PREVIEW_SURFACE)).toBeVisible();

    // The deterministic fixture has a V2 video clip over V1 from frame 45
    // (1.5s) through frame 194; frame 195 starts the next V1 still. The
    // samples straddle both ends of that compositing interval. The middle
    // samples are seed-derived and the later boundaries run after a zoom-in.
    const seed = 'timeline-preview-seed-20261005';
    let seedState = [...seed].reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16_777_619), 2_166_136_261) >>> 0;
    const nextSeededFrame = (min: number, max: number): number => {
      seedState ^= seedState << 13;
      seedState ^= seedState >>> 17;
      seedState ^= seedState << 5;
      return min + ((seedState >>> 0) % (max - min + 1));
    };
    const seededFrames = [
      nextSeededFrame(5, 35),
      44, 45, 46,
      nextSeededFrame(70, 170),
      194, 195,
      nextSeededFrame(240, 300),
    ];
    const labels = [
      'seed-interior-before-blend',
      'blend-entry-before',
      'blend-entry',
      'blend-entry-after',
      'seed-interior-during-blend',
      'blend-exit-before',
      'blend-exit',
      'seed-interior-after-blend',
    ];
    const baselineExtent = BASELINE_CLIPS.reduce((end, clip) => Math.max(end, clip.at + clip.hold), 0);
    expect(seededFrames.every((frame) => frame / FPS < baselineExtent)).toBe(true);
    expect(new Set(seededFrames).size).toBe(8);

    const records: Array<Record<string, unknown>> = [];
    let calibration = await calibrateRuler(page, TIMELINE);
    let zoomBefore = await page.locator(HERO_CLIP).evaluate((el) => el.getBoundingClientRect().width);

    for (let index = 0; index < seededFrames.length; index += 1) {
      if (index === 4) {
        await page.getByRole('button', { name: 'Zoom in timeline' }).first().click();
        await expect.poll(
          () => page.locator(HERO_CLIP).evaluate((el) => el.getBoundingClientRect().width),
          { timeout: 5_000 },
        ).toBeGreaterThan(zoomBefore);
        zoomBefore = await page.locator(HERO_CLIP).evaluate((el) => el.getBoundingClientRect().width);
        calibration = await calibrateRuler(page, TIMELINE);
      }

      const requestedFrame = seededFrames[index]!;
      const label = labels[index]!;
      const { requestedTime, observedTime, observedFrame, adjustments } = await seekRulerToFrame(page, calibration, requestedFrame, FPS, label);

      expect(
        Math.abs(observedTime - requestedTime),
        `${label}: requested ${requestedTime.toFixed(6)}s/frame ${requestedFrame}, observed ${observedTime.toFixed(6)}s/frame ${observedFrame}`,
      ).toBeLessThan(0.5 / FPS);
      expect(observedFrame, `${label}: requested frame ${requestedFrame}, observed frame ${observedFrame}`).toBe(requestedFrame);
      expect(adjustments).toBeLessThan(4);

      const screenshotPath = browserEvidencePath(testInfo, `seeded-preview/${String(index + 1).padStart(2, '0')}-${label}.png`);
      await mkdir(dirname(screenshotPath), { recursive: true });
      await page.locator(PREVIEW_SURFACE).screenshot({ path: screenshotPath, animations: 'disabled' });
      records.push({
        index: index + 1,
        label,
        seed,
        requestedFrame,
        requestedTime,
        observedTime,
        observedFrame,
        zoomPixelsPerSecond: calibration.pixelsPerSecond,
        correctionClicks: adjustments,
        screenshot: screenshotPath,
      });
    }

    expect(new Set(records.map((sample) => sample.observedFrame)).size).toBe(8);
    const manifestPath = browserEvidencePath(testInfo, 'seeded-preview/manifest.json');
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify({
      seed,
      project: PROJECT_SLUG,
      timeline: TIMELINE_SLUG,
      fps: FPS,
      timelineExtentSeconds: baselineExtent,
      zoomLevels: [...new Set(records.map((sample) => sample.zoomPixelsPerSecond))],
      sampleCount: records.length,
      samples: records,
    }, null, 2)}\n`);
  });
});
