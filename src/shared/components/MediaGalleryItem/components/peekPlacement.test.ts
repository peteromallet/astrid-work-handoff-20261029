import { describe, expect, it } from 'vitest';
import { connectorFor, placePeek, type PeekAnchor, type PeekPlacement } from './peekPlacement';

const anchorAt = (left: number, top: number, width = 28, height = 28): PeekAnchor => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

function expectInsideMargins(placement: PeekPlacement, viewport: { width: number; height: number }, margin = 12) {
  expect(placement.left).toBeGreaterThanOrEqual(margin);
  expect(placement.top).toBeGreaterThanOrEqual(margin);
  expect(placement.left + placement.width).toBeLessThanOrEqual(viewport.width - margin);
  expect(placement.top + placement.height).toBeLessThanOrEqual(viewport.height - margin);
}

function expectOutsideAnchorGap(placement: PeekPlacement, anchor: PeekAnchor, gap = 14) {
  const separated = placement.side === 'top'
    ? placement.top + placement.height <= anchor.top - gap
    : placement.side === 'bottom'
      ? placement.top >= anchor.bottom + gap
      : placement.side === 'left'
        ? placement.left + placement.width <= anchor.left - gap
        : placement.left >= anchor.right + gap;
  expect(separated).toBe(true);
}

describe('placePeek', () => {
  it('opens a 16:9 image above an eye in a bottom gallery pane on a 16:9 screen', () => {
    const placement = placePeek(anchorAt(946, 900), { width: 1920, height: 1080 }, 16 / 9);

    expect(placement.side).toBe('top');
  });

  it('opens a portrait image to the right when the eye is on the left', () => {
    const placement = placePeek(anchorAt(24, 500), { width: 1920, height: 1080 }, 9 / 16);

    expect(placement.side).toBe('right');
  });

  it('centres a 16:9 peek above a bottom-pane eye when the straight edge spans it', () => {
    const viewport = { width: 1144, height: 716 };
    const anchor = anchorAt(340, 458, 24, 24);
    const placement = placePeek(anchor, viewport, 16 / 9);

    expect(placement.side).toBe('top');
    expect(placement.width).toBeCloseTo(768);
    expect(placement.height).toBeCloseTo(432);
    expect(placement.left + placement.width / 2).toBeCloseTo(viewport.width / 2);
    expect(placement.top).toBe(12);
    expectInsideMargins(placement, viewport);
    expectOutsideAnchorGap(placement, anchor);
  });

  it('centres a portrait peek vertically and moves it toward the middle from a left eye', () => {
    const viewport = { width: 1144, height: 716 };
    const anchor = anchorAt(50, 344);
    const placement = placePeek(anchor, viewport, 9 / 16);
    const connector = connectorFor(anchor, placement, 8);

    expect(placement.side).toBe('right');
    expect(placement.top + placement.height / 2).toBeCloseTo(viewport.height / 2);
    expect(placement.left).toBeGreaterThan(anchor.right + 14);
    expect(placement.left + placement.width / 2).toBeCloseTo(viewport.width / 2);
    expect(connector?.length).toBeCloseTo(placement.left - anchor.right);
    expect(connector?.length).toBeGreaterThan(14);
    expectInsideMargins(placement, viewport);
    expectOutsideAnchorGap(placement, anchor);
  });

  it('chooses the left side for an anchor at the right edge', () => {
    const placement = placePeek(anchorAt(1880, 500), { width: 1920, height: 1080 }, 16 / 9);

    expect(placement.side).toBe('left');
  });

  it('chooses the bottom side for an anchor near the top', () => {
    const placement = placePeek(anchorAt(900, 16), { width: 1920, height: 1080 }, 16 / 9);

    expect(placement.side).toBe('bottom');
  });

  it('keeps the box outside the anchor and inside viewport margins', () => {
    const viewport = { width: 640, height: 480 };
    const anchor = anchorAt(250, 210);
    const placement = placePeek(anchor, viewport, 4 / 3);
    const gap = 14;

    expectInsideMargins(placement, viewport);
    expectOutsideAnchorGap(placement, anchor, gap);
  });

  it('moves a corner-clamped peek just far enough to keep the eye on its straight edge', () => {
    const viewport = { width: 800, height: 1000 };
    const anchor = anchorAt(556, 950);
    const placement = placePeek(anchor, viewport, 9 / 16);
    const connector = connectorFor(anchor, placement, 8);

    expect(placement.side).toBe('left');
    expect(placement.top).toBeCloseTo((anchor.top + anchor.bottom) / 2 - placement.height + 12);
    expect(connector?.crossOffset).toBe(14);
    expect(connector?.length).toBe(14);
    expectInsideMargins(placement, viewport);
    expectOutsideAnchorGap(placement, anchor);
  });

  it.each([
    {
      placement: { side: 'top', left: 90, top: 40, width: 100, height: 46 },
      orientation: 'vertical',
      transformOrigin: 'center bottom',
    },
    {
      placement: { side: 'right', left: 142, top: 80, width: 100, height: 56 },
      orientation: 'horizontal',
      transformOrigin: 'left center',
    },
    {
      placement: { side: 'bottom', left: 90, top: 142, width: 100, height: 56 },
      orientation: 'vertical',
      transformOrigin: 'center top',
    },
    {
      placement: { side: 'left', left: -14, top: 80, width: 100, height: 56 },
      orientation: 'horizontal',
      transformOrigin: 'right center',
    },
  ] as const)('builds a $orientation connector for the $placement.side side', ({ placement, orientation, transformOrigin }) => {
    const connector = connectorFor(anchorAt(100, 100), placement as PeekPlacement, 8);

    expect(connector).toEqual({
      orientation,
      crossOffset: 14,
      length: 14,
      transformOrigin,
    });
  });

  it('clamps the connector centre to the peek edge straight part near a corner', () => {
    const placement: PeekPlacement = {
      side: 'top',
      left: 110,
      top: 40,
      width: 100,
      height: 46,
    };

    expect(connectorFor(anchorAt(100, 100), placement, 8)?.crossOffset).toBe(22);
  });

  it('skips the connector when the clamped position falls outside the eye span', () => {
    const placement: PeekPlacement = {
      side: 'top',
      left: 130,
      top: 40,
      width: 100,
      height: 46,
    };

    expect(connectorFor(anchorAt(100, 100), placement, 8)).toBeNull();
  });

  it('clamps the cross-axis position at viewport corners', () => {
    const leftCorner = placePeek(anchorAt(20, 20), { width: 800, height: 600 }, 16 / 9);
    const rightCorner = placePeek(anchorAt(752, 552), { width: 800, height: 600 }, 16 / 9);

    expect(leftCorner.left).toBeGreaterThanOrEqual(12);
    expect(leftCorner.top).toBeGreaterThanOrEqual(12);
    expect(rightCorner.left + rightCorner.width).toBeLessThanOrEqual(788);
    expect(rightCorner.top + rightCorner.height).toBeLessThanOrEqual(588);
  });

  it.each([0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'falls back safely for aspect ratio %s',
    (aspectRatio) => {
      const placement = placePeek(anchorAt(0, 0), { width: 1, height: 1 }, aspectRatio);

      expect(Object.values(placement).slice(1).every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    },
  );

  it('returns finite non-negative geometry for tiny and invalid viewports', () => {
    for (const viewport of [{ width: 0, height: 0 }, { width: Number.NaN, height: Number.POSITIVE_INFINITY }]) {
      const placement = placePeek(anchorAt(0, 0), viewport, 16 / 9);
      expect(Object.values(placement).slice(1).every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    }
  });
});
