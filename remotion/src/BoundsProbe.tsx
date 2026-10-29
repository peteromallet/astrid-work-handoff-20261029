import type {ReactElement} from 'react';
import {useLayoutEffect} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {clampToCanvas, formatBoundsLine, unionRects} from './bounds';
import type {ClipBounds, Rect} from './bounds';

// Mounted by Root.tsx only when inputProps.astridBounds === true. At each
// rendered frame it measures every visual clip wrapper ([data-clip-id]) in the
// DOM and logs one ASTRID_BOUNDS line with the box each clip actually painted,
// in canvas px. The frame worker collects those lines from the browser log.

const PAINTING_TAGS = new Set(['IMG', 'VIDEO', 'CANVAS', 'SVG']);

const isHidden = (el: Element, style: CSSStyleDeclaration): boolean =>
  style.display === 'none' || style.visibility === 'hidden' || el.getAttribute('hidden') !== null;

const hasOwnText = (el: Element): boolean =>
  Array.from(el.childNodes).some((node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== '');

const hasVisibleBackground = (style: CSSStyleDeclaration): boolean => {
  if (style.backgroundImage && style.backgroundImage !== 'none') return true;
  const match = /rgba?\(([^)]+)\)/.exec(style.backgroundColor ?? '');
  if (!match) return false;
  const parts = match[1].split(',').map((part) => part.trim());
  const alpha = parts.length >= 4 ? Number(parts[3]) : 1;
  return Number.isFinite(alpha) && alpha > 0;
};

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return {x: r.left, y: r.top, w: r.width, h: r.height};
};

const paints = (el: Element, style: CSSStyleDeclaration): boolean =>
  PAINTING_TAGS.has(el.tagName.toUpperCase()) || hasOwnText(el) || hasVisibleBackground(style);

const measureClip = (clip: Element): {rect: Rect | null; source: ClipBounds['source']} => {
  const marked = Array.from(clip.querySelectorAll('[data-astrid-box]'));
  if (marked.length > 0) {
    const rects = marked
      .filter((el) => !isHidden(el, getComputedStyle(el)))
      .map(rectOf);
    return {rect: unionRects(rects), source: 'marked'};
  }
  const rects: Rect[] = [];
  for (const el of Array.from(clip.querySelectorAll('*'))) {
    const style = getComputedStyle(el);
    if (isHidden(el, style) || !paints(el, style)) continue;
    rects.push(rectOf(el));
  }
  const union = unionRects(rects);
  return {rect: union, source: union ? 'painted' : 'none'};
};

const opacityUpTo = (clip: Element, root: Element): number => {
  let opacity = 1;
  let el: Element | null = clip;
  while (el) {
    const value = parseFloat(getComputedStyle(el).opacity);
    if (Number.isFinite(value)) opacity *= value;
    if (el === root) break;
    el = el.parentElement;
  }
  return opacity;
};

export const BoundsProbe = (): ReactElement | null => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  useLayoutEffect(() => {
    const root = document.getElementById('root') ?? document.body;
    const rootRect = root.getBoundingClientRect();
    const scaleX = rootRect.width > 0 ? width / rootRect.width : 1;
    const scaleY = rootRect.height > 0 ? height / rootRect.height : 1;

    const clips: ClipBounds[] = [];
    const nodes = Array.from(document.querySelectorAll('[data-clip-id]'));
    nodes.forEach((clip, order) => {
      const {rect, source} = measureClip(clip);
      let box: ClipBounds['box'] = null;
      if (rect) {
        const canvasRect = clampToCanvas(
          {
            x: (rect.x - rootRect.left) * scaleX,
            y: (rect.y - rootRect.top) * scaleY,
            w: rect.w * scaleX,
            h: rect.h * scaleY,
          },
          width,
          height,
        );
        if (canvasRect) box = [canvasRect.x, canvasRect.y, canvasRect.w, canvasRect.h];
      }
      clips.push({
        id: clip.getAttribute('data-clip-id') ?? '',
        box,
        opacity: opacityUpTo(clip, root),
        order,
        source,
      });
    });

    console.log(formatBoundsLine(frame, [width, height], clips));
  }, [frame, width, height]);

  return null;
};
