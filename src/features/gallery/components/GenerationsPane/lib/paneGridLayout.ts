/**
 * "Hug the content" layout for the Generations pane.
 *
 * The caller supplies a width-based column count. Tiles keep the project
 * ratio at a size derived from that width. The pane is as tall as its rows
 * need; only when that exceeds `cap` do tiles shrink (aspect preserved) and
 * the column count is re-derived to fit the narrower tiles.
 */

export interface PaneLayoutInput {
  /** Content box width in px. */
  width: number;
  /** Tile aspect ratio, width / height (e.g. 16 / 9). Invalid falls back to 16:9. */
  ratio: number;
  /** Gap between cells in px (both axes). */
  gap: number;
  /** Columns derived by the caller from width. */
  baseCols: number;
  /** Upper bound on rows. Also sets the page size. */
  maxRows: number;
  /** Size of the whole filtered set, not the current page. 0 means an empty view. */
  itemCount: number;
  /** Fixed header/toolbar height in px above the grid. */
  chromeHeight: number;
  /** Padding in px above the grid. */
  topPadding: number;
  /** Padding in px below the grid. */
  bottomPadding: number;
  /** Maximum pane height in px. Infinity disables the constraint. */
  cap: number;
  /** Smallest tile height allowed when shrinking to the cap. Defaults to 48. */
  minCellHeight?: number;
}

export interface PaneLayout {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  gridWidth: number;
  gridHeight: number;
  paneHeight: number;
  itemsPerPage: number;
  /** True when the natural pane height exceeded `cap` and tiles were shrunk. */
  constrained: boolean;
}

const DEFAULT_RATIO = 16 / 9;
const DEFAULT_MIN_CELL_HEIGHT = 48;

/** Non-negative finite number, or 0 for anything else. */
function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Computes the pane layout. Invalid inputs never produce NaN:
 * - zero or invalid width gives one column and zero-size cells;
 * - an invalid ratio falls back to 16:9;
 * - a non-finite or negative gap, padding or chrome height is treated as 0;
 * - a NaN cap is treated as no cap.
 */
export function computePaneLayout(input: PaneLayoutInput): PaneLayout {
  const width = nonNegative(input.width);
  const ratio = Number.isFinite(input.ratio) && input.ratio > 0 ? input.ratio : DEFAULT_RATIO;
  const gap = nonNegative(input.gap);
  const baseCols = Math.max(1, Math.floor(nonNegative(input.baseCols)) || 1);
  const maxRows = Math.max(1, Math.floor(nonNegative(input.maxRows)) || 1);
  const itemCount = Math.floor(nonNegative(input.itemCount));
  const chrome = nonNegative(input.chromeHeight) + nonNegative(input.topPadding) + nonNegative(input.bottomPadding);
  const cap = Number.isNaN(input.cap) ? Number.POSITIVE_INFINITY : input.cap;
  const minCellHeight = nonNegative(input.minCellHeight ?? DEFAULT_MIN_CELL_HEIGHT);

  const naturalCellWidth = Math.max(0, (width - (baseCols - 1) * gap) / baseCols);
  const naturalCellHeight = naturalCellWidth / ratio;
  const rows = itemCount > 0 ? Math.min(maxRows, Math.max(1, Math.ceil(itemCount / baseCols))) : 1;
  const naturalGridHeight = rows * naturalCellHeight + (rows - 1) * gap;
  const naturalPaneHeight = chrome + naturalGridHeight;
  const itemsPerPage = baseCols * maxRows;

  if (naturalPaneHeight <= cap) {
    return {
      cols: width > 0 ? baseCols : 1,
      rows,
      cellWidth: naturalCellWidth,
      cellHeight: naturalCellHeight,
      gridWidth: width,
      gridHeight: naturalGridHeight,
      paneHeight: naturalPaneHeight,
      itemsPerPage,
      constrained: false,
    };
  }

  const available = cap - chrome;
  const cellHeight = Math.max(minCellHeight, (available - (rows - 1) * gap) / rows);
  const cellWidth = cellHeight * ratio;
  const cellStep = cellWidth + gap;
  const cols = cellStep > 0 ? Math.max(1, Math.floor((width + gap) / cellStep)) : 1;
  const gridHeight = rows * cellHeight + (rows - 1) * gap;
  return {
    cols,
    rows,
    cellWidth,
    cellHeight,
    gridWidth: cols * cellWidth + (cols - 1) * gap,
    gridHeight,
    paneHeight: chrome + gridHeight,
    itemsPerPage,
    constrained: true,
  };
}

/**
 * Parses a project ratio string such as "16:9" or "9:16" into width / height.
 * Anything missing or malformed falls back to 16:9.
 */
export function parseProjectRatio(str: string | undefined | null): number {
  if (typeof str !== 'string') return DEFAULT_RATIO;
  const match = /^\s*(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)\s*$/i.exec(str);
  if (!match) return DEFAULT_RATIO;
  const w = Number(match[1]);
  const h = Number(match[2]);
  return w > 0 && h > 0 ? w / h : DEFAULT_RATIO;
}
