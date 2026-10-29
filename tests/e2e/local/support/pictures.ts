/**
 * Comparing two pictures that come from different pipelines (the editor's preview and a rendered film) without a pixel diff.
 *
 * Both sides go through the same in-page pipeline: decode the PNG a Playwright element screenshot made with `createImageBitmap`,
 * crop to the rectangle that holds the picture (the screenshot also holds letterbox bars and chrome), and reduce it to a grid
 * of cells of mean RGB. Two pictures that show the same film agree cell by cell within codec and scaling noise; two that show
 * different films do not. The thresholds belong to the caller and are never loosened to make a pair agree.
 */
import type { Page } from '@playwright/test';

/** A rectangle in CSS pixels, relative to the screenshotted element's top-left corner. */
export interface Rect { x: number; y: number; width: number; height: number }

/** Mean RGB (0..255) of each cell, row by row: `cells[row * columns + column] = [r, g, b]`. */
export interface PictureGrid { columns: number; rows: number; cells: Array<[number, number, number]>; crop: Rect; bitmap: { width: number; height: number } }

/**
 * Where `object-fit: contain` puts a picture of `natural` size inside a box of `box` size: the whole picture, centred, with bars
 * where the aspect ratios differ. This is how a `<video>` without `object-fit` draws its frame.
 */
export function letterbox(natural: { width: number; height: number }, box: { width: number; height: number }): Rect {
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

/**
 * Reduces `png` (an element screenshot of a box of `element` CSS pixels) to `columns` by `rows` cells of mean RGB over `crop`.
 * `crop` is in the element's CSS pixels; the bitmap's own scale (the device pixel ratio) is read from the decoded image.
 */
export async function pictureGrid(page: Page, png: Buffer, crop: Rect, element: { width: number; height: number }, columns = 16, rows = 9): Promise<PictureGrid> {
  return page.evaluate(async ({ base64, crop, element, columns, rows }) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const scaleX = bitmap.width / element.width;
    const scaleY = bitmap.height / element.height;
    const sx = Math.round(crop.x * scaleX);
    const sy = Math.round(crop.y * scaleY);
    const sw = Math.max(1, Math.min(bitmap.width - sx, Math.round(crop.width * scaleX)));
    const sh = Math.max(1, Math.min(bitmap.height - sy, Math.round(crop.height * scaleY)));
    const canvas = new OffscreenCanvas(sw, sh);
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    const { data } = context.getImageData(0, 0, sw, sh);
    const cells: Array<[number, number, number]> = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x0 = Math.floor((column * sw) / columns);
        const x1 = Math.max(x0 + 1, Math.floor(((column + 1) * sw) / columns));
        const y0 = Math.floor((row * sh) / rows);
        const y1 = Math.max(y0 + 1, Math.floor(((row + 1) * sh) / rows));
        const sum = [0, 0, 0];
        let count = 0;
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const at = (y * sw + x) * 4;
            sum[0] += data[at]; sum[1] += data[at + 1]; sum[2] += data[at + 2];
            count += 1;
          }
        }
        cells.push([sum[0] / count, sum[1] / count, sum[2] / count]);
      }
    }
    return { columns, rows, cells, crop, bitmap: { width: bitmap.width, height: bitmap.height } };
  }, { base64: png.toString('base64'), crop, element, columns, rows });
}

export interface GridDifference {
  /** Mean absolute difference over all cells, per channel (r, g, b), in levels of 255. */
  meanPerChannel: [number, number, number];
  /** The largest per-cell mean absolute difference over the three channels, in levels of 255. */
  worstCell: number;
}

export function gridDifference(left: PictureGrid, right: PictureGrid): GridDifference {
  if (left.cells.length !== right.cells.length) throw new Error(`cannot compare a ${left.columns}x${left.rows} grid with a ${right.columns}x${right.rows} one`);
  const total = [0, 0, 0];
  let worstCell = 0;
  left.cells.forEach((cell, index) => {
    const other = right.cells[index];
    const differences = cell.map((value, channel) => Math.abs(value - other[channel]));
    differences.forEach((value, channel) => { total[channel] += value; });
    worstCell = Math.max(worstCell, (differences[0] + differences[1] + differences[2]) / 3);
  });
  return { meanPerChannel: total.map((value) => value / left.cells.length) as [number, number, number], worstCell };
}

/**
 * The match rule of the preview-versus-render comparison (levels of 255). It is the bar a colour-management fault must clear, so it
 * sits just above what the recorded runs show for pictures that agree and well under what the faults it exists to catch cost.
 * Recorded matching pairs (test-results/three-products/three-products-summary.json, 20 Oct): at most 5.7 mean per channel (the
 * blue channel of the test pattern, from the codec and the 4:2:0 chroma) and a worst cell of 4.7. The negative control, a film
 * against another film's preview, is 61 to 102 mean and 82 worst. A limited/full range error or a BT.601/709 matrix shift
 * confined to one region moves that region's cells by tens of levels (green 255 -> 217 for a saturated colour), well over 12;
 * a mean of 8 leaves 2.3 levels above the largest recorded mean and a worst cell of 12 leaves 7.3 above the largest recorded cell.
 */
export const MATCH = { meanPerChannel: 8, worstCell: 12 } as const;

export const matches = (difference: GridDifference): boolean => difference.meanPerChannel.every((value) => value <= MATCH.meanPerChannel) && difference.worstCell <= MATCH.worstCell;

/** The cell at the middle of a grid (its centre cell), as [r, g, b]. */
export function centreCell(grid: PictureGrid): [number, number, number] {
  return grid.cells[Math.floor(grid.rows / 2) * grid.columns + Math.floor(grid.columns / 2)];
}
