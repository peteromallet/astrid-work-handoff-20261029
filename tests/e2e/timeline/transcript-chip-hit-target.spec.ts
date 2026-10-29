import { expect, test } from '@playwright/test';
import { editorUrl } from './support.ts';

const EXPECTED_CAPTIONS = 4;
const EXPECTED_RENDERED_SEGMENTS = 5;
const EDITOR_URL = editorUrl({ params: { transcriptLaneFixture: 'render-matrix' } });

test.describe('transcript overlap hit targets', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('keeps four overlapping Unicode chips readable and independently selectable', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => localStorage.removeItem('astrid.dev-extensions.disabled'));
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    const transcriptRow = page.locator('[data-lane-kind="astrid.transcript"]');
    await expect(transcriptRow).toBeVisible({ timeout: 30_000 });
    await page.locator('.timeline-canvas-edit-area').evaluate((scroller) => {
      scroller.scrollTop = scroller.scrollHeight;
    });
    const chips = transcriptRow.getByTestId('transcript-lane-occurrence');
    // The matrix includes one intentional whitespace-only source segment to
    // prove the materializer's empty-text filter. The lane keeps that source
    // visible as a diagnostic `(no text)` chip; the four meaningful Unicode
    // chips below are the hit-target contract under test.
    await expect(chips).toHaveCount(EXPECTED_RENDERED_SEGMENTS, { timeout: 20_000 });

    const chipData = await chips.evaluateAll((elements) => elements.map((element) => ({
      id: element.getAttribute('data-item-id'),
      label: element.getAttribute('aria-label'),
      rect: (() => {
        const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
        return { left, right, top, bottom, width, height };
      })(),
      // The text span's box. Its overflow clip is what the reader sees, so a span wider than its chip (padding that
      // keeps it at least 12px wide) shows a sliced fragment of the first glyphs in a 3-7px chip.
      textRect: (() => {
        const span = element.querySelector('span');
        if (!span) return null;
        const { left, right, top, bottom } = span.getBoundingClientRect();
        return { left, right, top, bottom };
      })(),
      style: {
        top: (element as HTMLElement).style.top,
        height: (element as HTMLElement).style.height,
        width: (element as HTMLElement).style.width,
      },
    })));
    expect(chipData.every(({ id, label }) => Boolean(id && label && label.includes('Transcript segment: ')))).toBe(true);
    const diagnosticChipData = chipData.filter(({ label }) => label?.includes('(no text)'));
    expect(diagnosticChipData).toHaveLength(1);
    const meaningfulChipData = chipData.filter(({ label }) => !label?.includes('(no text)'));
    expect(meaningfulChipData).toHaveLength(EXPECTED_CAPTIONS);
    expect(chipData.every(({ rect }) => rect.width > 0 && rect.height > 0)).toBe(true);
    // A chip's box is exactly its host-mapped interval: no padding or minimum width may widen it past the
    // interval, or chips that do not overlap in time overlap on screen (jsdom cannot see this).
    for (const { label, rect, style } of chipData) {
      expect(
        Math.abs(rect.width - Number.parseFloat(style.width)),
        `${label}: rendered width ${rect.width}px must equal its interval width ${style.width}`,
      ).toBeLessThanOrEqual(0.5);
    }
    for (const { label, rect, textRect } of chipData) {
      expect(textRect, `${label}: the chip has a text span`).not.toBeNull();
      expect(
        textRect!.left >= rect.left - 0.5 && textRect!.right <= rect.right + 0.5
          && textRect!.top >= rect.top - 0.5 && textRect!.bottom <= rect.bottom + 0.5,
        `${label}: the text span ${JSON.stringify(textRect)} must lie inside its chip ${JSON.stringify(rect)}`,
      ).toBe(true);
    }
    const rowBox = await transcriptRow.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(chipData.every(({ rect }) => (
      rect.top >= rowBox!.y - 1
      && rect.bottom <= rowBox!.y + rowBox!.height + 1
    ))).toBe(true);
    expect(new Set(meaningfulChipData.map(({ style }) => `${style.top}:${style.height}`)).size).toBeGreaterThan(1);
    // Every chip, the diagnostic `(no text)` one included: where two chips share any horizontal span they must be
    // in different rows.
    for (let leftIndex = 0; leftIndex < chipData.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < chipData.length; rightIndex += 1) {
        const left = chipData[leftIndex]!.rect;
        const right = chipData[rightIndex]!.rect;
        const horizontallyOverlaps = left.left < right.right - 0.5 && right.left < left.right - 0.5;
        if (!horizontallyOverlaps) continue;
        expect(
          left.bottom <= right.top + 0.5 || right.bottom <= left.top + 0.5,
          `overlapping interval hit targets must not overlap vertically: ${JSON.stringify({ left, right })}`,
        ).toBe(true);
      }
    }

    for (const { label } of chipData) {
      await page.getByLabel(label!, { exact: true }).click();
      await expect(page.getByLabel(label!, { exact: true })).toHaveAttribute('aria-pressed', 'true');
      // The click focuses the chip, which opens its hoverable tooltip. It must not sit over any chip, or a pointer
      // heading for that chip would land on the tooltip and keep it open.
      await expect(page.getByRole('tooltip')).not.toHaveCount(0);
      const covered = await page.evaluate(() => {
        const boxes = (selector: string) => [...document.querySelectorAll(selector)].map((element) => {
          const { left, right, top, bottom } = element.getBoundingClientRect();
          return { label: element.getAttribute('aria-label') ?? element.textContent, left, right, top, bottom };
        });
        const occurrences = boxes('[data-testid="transcript-lane-occurrence"]');
        return boxes('[role="tooltip"]').flatMap((tooltip) => occurrences
          .filter((chip) => tooltip.left < chip.right && chip.left < tooltip.right
            && tooltip.top < chip.bottom && chip.top < tooltip.bottom)
          .map((chip) => ({ tooltip, chip })));
      });
      expect(covered, `an open tooltip must not cover any transcript chip after clicking ${label}`).toEqual([]);
    }
    await testInfo.attach('transcript-overlap-hit-targets', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
});
