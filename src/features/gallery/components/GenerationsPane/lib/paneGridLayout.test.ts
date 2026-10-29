import { describe, expect, it } from 'vitest';
import { computePaneLayout, parseProjectRatio, type PaneLayoutInput } from './paneGridLayout';

const GAP = 8;
const CHROME = 40;
const PAD = 8;
const RATIOS: Array<[string, number]> = [
  ['16:9', 16 / 9],
  ['9:16', 9 / 16],
  ['1:1', 1],
];

function base(overrides: Partial<PaneLayoutInput> = {}): PaneLayoutInput {
  return {
    width: 1200,
    ratio: 16 / 9,
    gap: GAP,
    baseCols: 4,
    maxRows: 3,
    itemCount: 8,
    chromeHeight: CHROME,
    topPadding: PAD,
    bottomPadding: PAD,
    cap: Number.POSITIVE_INFINITY,
    ...overrides,
  };
}

describe('computePaneLayout', () => {
  describe('natural layout', () => {
    for (const [label, ratio] of RATIOS) {
      it(`hugs 2 rows at baseCols for ${label}`, () => {
        const layout = computePaneLayout(base({ ratio, itemCount: 8 }));
        const cellWidth = (1200 - 3 * GAP) / 4;
        expect(layout.cols).toBe(4);
        expect(layout.rows).toBe(2);
        expect(layout.cellWidth).toBeCloseTo(cellWidth, 9);
        expect(layout.cellHeight).toBeCloseTo(cellWidth / ratio, 9);
        expect(layout.gridWidth).toBe(1200);
        expect(layout.gridHeight).toBeCloseTo(2 * (cellWidth / ratio) + GAP, 9);
        expect(layout.paneHeight).toBeCloseTo(CHROME + PAD + layout.gridHeight + PAD, 9);
        expect(layout.constrained).toBe(false);
      });
    }
  });

  it('uses one row for 5 items with baseCols 6', () => {
    const layout = computePaneLayout(base({ baseCols: 6, itemCount: 5, maxRows: 6 }));
    expect(layout.rows).toBe(1);
  });

  it('uses one row for an empty view', () => {
    const layout = computePaneLayout(base({ itemCount: 0 }));
    expect(layout.rows).toBe(1);
    const oneItem = computePaneLayout(base({ itemCount: 1 }));
    expect(layout.paneHeight).toBeCloseTo(oneItem.paneHeight, 9);
  });

  it('does not let itemCount change itemsPerPage', () => {
    const small = computePaneLayout(base({ itemCount: 1 }));
    const large = computePaneLayout(base({ itemCount: 500 }));
    expect(small.itemsPerPage).toBe(4 * 3);
    expect(large.itemsPerPage).toBe(small.itemsPerPage);
  });

  it('gives the same paneHeight for the same itemCount on every page', () => {
    const page1 = computePaneLayout(base({ itemCount: 40 }));
    const page2 = computePaneLayout(base({ itemCount: 40 }));
    expect(page2.paneHeight).toBe(page1.paneHeight);
    expect(page2.rows).toBe(page1.rows);
  });

  it('caps rows at maxRows', () => {
    const three = computePaneLayout(base({ maxRows: 3, itemCount: 100 }));
    const two = computePaneLayout(base({ maxRows: 2, itemCount: 100 }));
    expect(three.rows).toBe(3);
    expect(two.rows).toBe(2);
    expect(three.itemsPerPage).toBe(4 * 3);
    expect(two.itemsPerPage).toBe(4 * 2);
  });

  it('shrinks tiles when natural height exceeds the cap, keeping the ratio', () => {
    for (const [, ratio] of RATIOS) {
      const natural = computePaneLayout(base({ ratio, itemCount: 8 }));
      const cap = 300;
      expect(natural.paneHeight).toBeGreaterThan(cap);
      const layout = computePaneLayout(base({ ratio, itemCount: 8, cap }));
      expect(layout.constrained).toBe(true);
      expect(layout.paneHeight).toBeLessThanOrEqual(cap + 1e-6);
      expect(layout.cellWidth / layout.cellHeight).toBeCloseTo(ratio, 9);
      expect(layout.gridWidth).toBeLessThanOrEqual(1200 + 1e-6);
      expect(layout.cols).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(layout.paneHeight)).toBe(true);
    }
  });

  it('stays unconstrained with an Infinity cap', () => {
    const layout = computePaneLayout(base({ cap: Number.POSITIVE_INFINITY }));
    expect(layout.constrained).toBe(false);
  });

  it('treats a NaN cap as no cap', () => {
    const layout = computePaneLayout(base({ cap: Number.NaN }));
    expect(layout.constrained).toBe(false);
    expect(Number.isFinite(layout.paneHeight)).toBe(true);
  });

  it('returns finite numbers for zero or invalid size with no NaN', () => {
    const inputs: Array<Partial<PaneLayoutInput>> = [
      { width: 0 },
      { width: -10 },
      { width: Number.NaN },
      { width: Number.POSITIVE_INFINITY },
      { width: 0, cap: 100 },
    ];
    for (const override of inputs) {
      const layout = computePaneLayout(base(override));
      for (const value of Object.values(layout)) {
        if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
      }
      expect(layout.cols).toBe(1);
      expect(layout.cellWidth).toBe(0);
      expect(layout.cellHeight).toBe(0);
    }
  });

  it('falls back to 16:9 for an invalid ratio', () => {
    const fallback = computePaneLayout(base({ ratio: 16 / 9 }));
    expect(computePaneLayout(base({ ratio: 0 }))).toEqual(fallback);
    expect(computePaneLayout(base({ ratio: Number.NaN }))).toEqual(fallback);
  });
});

describe('parseProjectRatio', () => {
  it('parses 16:9 and 9:16', () => {
    expect(parseProjectRatio('16:9')).toBeCloseTo(16 / 9, 10);
    expect(parseProjectRatio('9:16')).toBe(0.5625);
  });

  it('falls back to 16:9 for invalid input', () => {
    expect(parseProjectRatio(undefined)).toBeCloseTo(16 / 9, 10);
    expect(parseProjectRatio(null)).toBeCloseTo(16 / 9, 10);
    expect(parseProjectRatio('')).toBeCloseTo(16 / 9, 10);
    expect(parseProjectRatio('wide')).toBeCloseTo(16 / 9, 10);
    expect(parseProjectRatio('0:9')).toBeCloseTo(16 / 9, 10);
  });
});
