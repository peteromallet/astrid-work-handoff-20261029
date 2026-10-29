// Shared spec for the per-clip painted bounds that BoundsProbe logs from the
// page and astrid-frame-worker.mjs writes as frame-<n>.bounds.json.
// Pure on purpose: no React or remotion imports, so node tests can load it.
// The worker re-implements parseBoundsLine inline (it cannot import this file);
// keep the two in step.

export type Rect = {x: number; y: number; w: number; h: number};

// box is [x, y, w, h] in canvas px.
export type ClipBounds = {
  id: string;
  box: [number, number, number, number] | null;
  opacity: number;
  order: number;
  source: 'marked' | 'painted' | 'none';
};

const hasArea = (r: Rect): boolean => r.w > 0 && r.h > 0;

export const unionRects = (rects: Rect[]): Rect | null => {
  const live = rects.filter(hasArea);
  if (live.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of live) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
};

export const clampToCanvas = (r: Rect, w: number, h: number): Rect | null => {
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(w, r.x + r.w);
  const y1 = Math.min(h, r.y + r.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
};

export const BOUNDS_MARKER = 'ASTRID_BOUNDS ';

export const formatBoundsLine = (frame: number, canvas: [number, number], clips: ClipBounds[]): string =>
  BOUNDS_MARKER + JSON.stringify({frame, canvas, clips});

export const parseBoundsLine = (
  text: string,
): {frame: number; canvas: [number, number]; clips: ClipBounds[]} | null => {
  if (typeof text !== 'string' || !text.startsWith(BOUNDS_MARKER)) return null;
  let value: unknown;
  try {
    value = JSON.parse(text.slice(BOUNDS_MARKER.length));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const {frame, canvas, clips} = value as Record<string, unknown>;
  if (typeof frame !== 'number' || !Array.isArray(canvas) || canvas.length !== 2 || !Array.isArray(clips)) {
    return null;
  }
  return {frame, canvas: [canvas[0], canvas[1]] as [number, number], clips: clips as ClipBounds[]};
};
