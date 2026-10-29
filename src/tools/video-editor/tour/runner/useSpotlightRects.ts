import { useEffect, useState } from 'react';
import { CLIP_BODY_SELECTOR } from '../../lib/timeline-dom';
import { EDITOR_TOUR_ANCHOR_ATTRIBUTE, EDITOR_TOUR_ANCHORS, EDITOR_TOUR_TRACK_ATTRIBUTE } from '../anchors';

export interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PADDING = 6;

interface Box { left: number; top: number; right: number; bottom: number }

/**
 * The part of an element its scrolling or clipping ancestors actually show (a timeline row is wider than the timeline),
 * and where its spotlight's padding may reach (`bounds`): the viewport, and a scrolling panel's own edges, so the
 * transcript's light never spills into the chat header.
 */
function visibleBox(element: Element): { visible: Box; bounds: Box } {
  const box = element.getBoundingClientRect();
  const visible = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  const own = getComputedStyle(element);
  const scrolls = /auto|scroll/.test(`${own.overflowX} ${own.overflowY}`);
  const bounds = scrolls
    ? { left: Math.max(0, box.left), top: Math.max(0, box.top), right: Math.min(window.innerWidth, box.right), bottom: Math.min(window.innerHeight, box.bottom) }
    : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(parent);
    if (overflowX === 'visible' && overflowY === 'visible') continue;
    const clip = parent.getBoundingClientRect();
    if (overflowX !== 'visible') {
      visible.left = Math.max(visible.left, clip.left);
      visible.right = Math.min(visible.right, clip.right);
    }
    if (overflowY !== 'visible') {
      visible.top = Math.max(visible.top, clip.top);
      visible.bottom = Math.min(visible.bottom, clip.bottom);
    }
  }
  return { visible, bounds };
}

const TRANSCRIPT_PADDING = 12;

/**
 * Where an element's content ends, when it is shorter than the element: a track row runs the timeline's whole width but
 * its spotlight ends with its last clip, and the chat transcript's ends below its last message. The empty rest stays
 * dimmed and free for the card.
 */
function contentExtent(element: Element, box: Box): Box {
  if (element.hasAttribute(EDITOR_TOUR_TRACK_ATTRIBUTE)) {
    const clips = Array.from(element.querySelectorAll(CLIP_BODY_SELECTOR), (clip) => clip.getBoundingClientRect().right);
    return clips.length ? { ...box, right: Math.min(box.right, Math.max(...clips)) } : box;
  }
  if (element.getAttribute(EDITOR_TOUR_ANCHOR_ATTRIBUTE) === EDITOR_TOUR_ANCHORS.chatTranscript) {
    const children = Array.from(element.children, (child) => child.getBoundingClientRect()).filter((rect) => rect.height > 0);
    const end = Math.max(...children.map((rect) => rect.bottom)) + TRANSCRIPT_PADDING;
    return children.length ? { ...box, bottom: Math.max(box.top + 2 * TRANSCRIPT_PADDING, Math.min(box.bottom, end)) } : box;
  }
  return box;
}

function measure(selectors: readonly string[]): SpotlightRect[] {
  const rects: SpotlightRect[] = [];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (!element) continue;
    const { visible, bounds } = visibleBox(element);
    const extent = contentExtent(element, visible);
    // Only the part on screen: a pane still outside it (sliding in) has nothing to light yet.
    const box = { left: Math.max(bounds.left, extent.left), top: Math.max(bounds.top, extent.top), right: Math.min(bounds.right, extent.right), bottom: Math.min(bounds.bottom, extent.bottom) };
    if (box.right - box.left <= 0 || box.bottom - box.top <= 0) continue;
    const padded = {
      left: Math.max(bounds.left, box.left - PADDING),
      top: Math.max(bounds.top, box.top - PADDING),
      right: Math.min(bounds.right, box.right + PADDING),
      bottom: Math.min(bounds.bottom, box.bottom + PADDING),
    };
    rects.push({ x: padded.left, y: padded.top, width: padded.right - padded.left, height: padded.bottom - padded.top });
  }
  return rects;
}

function sameRects(a: readonly SpotlightRect[], b: readonly SpotlightRect[]): boolean {
  return a.length === b.length
    && a.every((r, i) => r.x === b[i].x && r.y === b[i].y && r.width === b[i].width && r.height === b[i].height);
}

/** A CSS transition or animation moving a target (the chat pane sliding in) fires none of the other events. */
const MOTION_EVENTS = ['transitionrun', 'transitionend', 'animationstart', 'animationend'] as const;

/**
 * Viewport rects of the first element matching each selector. Re-measured (one frame at a time) when a
 * target resizes, when the page scrolls or resizes, when elements mount or unmount, and when a transition
 * or animation starts or ends, so the Tasks pane opening or a row sliding in keeps the spotlight on its
 * target. A target still moving is followed frame by frame until it holds still.
 */
export function useSpotlightRects(selectors: readonly string[]): SpotlightRect[] {
  const [rects, setRects] = useState<SpotlightRect[]>([]);
  const key = selectors.join('|');

  useEffect(() => {
    const targets = key ? key.split('|') : [];
    const resizeObserver = new ResizeObserver(() => schedule());
    let observed = new Set<Element>();
    let frame = 0;
    let last: SpotlightRect[] = [];

    function update() {
      frame = 0;
      const elements = new Set(targets.map((selector) => document.querySelector(selector)).filter((el): el is Element => !!el));
      observed.forEach((el) => { if (!elements.has(el)) resizeObserver.unobserve(el); });
      elements.forEach((el) => { if (!observed.has(el)) resizeObserver.observe(el); });
      observed = elements;
      const next = measure(targets);
      setRects((previous) => (sameRects(previous, next) ? previous : next));
      // Moved since the last frame: look again on the next one.
      if (!sameRects(last, next)) schedule();
      last = next;
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    MOTION_EVENTS.forEach((type) => window.addEventListener(type, schedule, { capture: true, passive: true }));
    update();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, { capture: true });
      MOTION_EVENTS.forEach((type) => window.removeEventListener(type, schedule, { capture: true }));
    };
  }, [key]);

  return rects;
}
