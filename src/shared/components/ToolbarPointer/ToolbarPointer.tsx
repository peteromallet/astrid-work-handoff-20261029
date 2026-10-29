import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './ToolbarPointer.css';

/** Both arrows are a short gesture up and out of the card: they point the way to the toolbar's end, not all the way there. */
const POINTER_RISE = 150;
const POINTER_REACH = 96;
/** Never closer than this to the viewport's edge, so the head and the label stay on screen. */
const EDGE_MARGIN = 16;

/** Which end of the toolbar the thing to look at is: the install control is at the right, a permission bubble at the left. */
export type ToolbarPointerCorner = 'top-right' | 'top-left';

interface PointerGeometry { width: number; height: number; line: string; head: string; labelX: number; labelY: number; labelAnchor: 'start' | 'end' }

/** A curve from the card's top corner, heading up and out towards the toolbar's end, with an arrowhead along its last direction. */
function pointerGeometry(card: DOMRect, corner: ToolbarPointerCorner): PointerGeometry {
  const width = window.innerWidth;
  const side = corner === 'top-right' ? 1 : -1;
  const sx = corner === 'top-right' ? card.right - 64 : card.left + 64;
  const sy = card.top - 10;
  let ex = Math.min(width - EDGE_MARGIN, sx + POINTER_REACH);
  let ey = Math.max(EDGE_MARGIN, sy - POINTER_RISE);
  let c2x = ex - (ex - sx) * 0.4;
  let c2y = ey + (sy - ey) * 0.28;
  if (corner === 'top-left') {
    // The head aims along the line from the start to the window's top-left corner, where the prompt is. The arrow ends in
    // the direction halfway between straight up and that aim, as far out as the install arrow, so it bends once, evenly.
    const toCorner = Math.hypot(sx - EDGE_MARGIN, sy - EDGE_MARGIN) || 1;
    const [ux, uy] = [(EDGE_MARGIN - sx) / toCorner, (EDGE_MARGIN - sy) / toCorner];
    const reach = Math.hypot(POINTER_REACH, POINTER_RISE) / (Math.hypot(ux, uy - 1) || 1);
    ex = Math.max(EDGE_MARGIN, sx + ux * reach);
    ey = Math.max(EDGE_MARGIN, sy + (uy - 1) * reach);
    const bend = Math.hypot(ex - sx, ey - sy) * 0.35;
    c2x = ex - ux * bend;
    c2y = ey - uy * bend;
  }
  const c1x = sx;
  const c1y = sy - (sy - ey) * 0.55;
  const length = Math.hypot(ex - c2x, ey - c2y) || 1;
  const [dx, dy] = [(ex - c2x) / length, (ey - c2y) / length];
  const barb = (angle: number) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return `${(ex - 12 * (dx * cos - dy * sin)).toFixed(1)} ${(ey - 12 * (dx * sin + dy * cos)).toFixed(1)}`;
  };
  return {
    width,
    height: window.innerHeight,
    line: `M${sx} ${sy}C${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey}`,
    head: `M${barb(0.5)}L${ex} ${ey}L${barb(-0.5)}`,
    // The label sits beside the start of the arrow, on the side away from where it is heading.
    labelX: sx - side * 12,
    labelY: sy - 4,
    labelAnchor: side === 1 ? 'end' : 'start',
  };
}

/**
 * The install dialog's hand-drawn arrow, for any card that has to say "look up there": it leaves the card towards the
 * browser's toolbar, so it is drawn across the whole viewport and redrawn whenever the window or the card moves. Its
 * anchor stays with the card; the SVG is portaled to the body so card animations cannot change its fixed coordinates.
 *
 * `tone` is the surface it is drawn over: `backdrop` for a dialog's dimmed backdrop, `page` for the page background.
 */
export function ToolbarPointer({
  label,
  corner = 'top-right',
  tone = 'backdrop',
  className = '',
}: {
  label: string;
  corner?: ToolbarPointerCorner;
  tone?: 'backdrop' | 'page';
  className?: string;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [geometry, setGeometry] = useState<PointerGeometry | null>(null);
  useEffect(() => {
    const card = anchorRef.current?.parentElement;
    if (!card) return;
    let disposed = false;
    const measure = () => {
      if (!disposed) setGeometry(pointerGeometry(card.getBoundingClientRect(), corner));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(card);
    window.addEventListener('resize', measure);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [corner]);
  return <>
    <span ref={anchorRef} hidden />
    {createPortal(<svg
      className={`astrid-toolbar-pointer ${className}`.trim()}
      data-tone={tone}
      data-corner={corner}
      aria-hidden="true"
      // Out of flow, so a card's own spacing rules (`space-y-*` margins) must not move it.
      style={{ margin: 0, zIndex: 100101 }}
      width={geometry?.width}
      height={geometry?.height}
      fill="none"
    >
      {geometry ? (
        <>
          <path className="astrid-toolbar-pointer-line" d={geometry.line} pathLength={1} />
          <path className="astrid-toolbar-pointer-head" d={geometry.head} />
          <text className="astrid-toolbar-pointer-label" x={geometry.labelX} y={geometry.labelY} textAnchor={geometry.labelAnchor}>{label.toUpperCase()}</text>
        </>
      ) : null}
    </svg>, document.body)}
  </>;
}
