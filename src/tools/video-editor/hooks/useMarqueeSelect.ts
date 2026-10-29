import { flushSync } from 'react-dom';
import { getMarqueePlane } from '@/tools/video-editor/lib/marquee-geometry.ts';
import { useCallback, useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { isAdditiveSelectionEvent, isPrimaryPointer } from '@/shared/lib/interactions/selectionGesture.ts';
import { editorClearTimelineSelection, userClearAllSelection, userSelectTimelineItems, timelineDataItemKey, type TimelineItemSelection, type TimelineDataItemRef } from '@/shared/state/selectionStore.ts';
import { createAutoScroller } from '@/tools/video-editor/lib/auto-scroll.ts';
import {
  CLIP_ACTION_WITH_ID_SELECTOR,
  CLIP_ID_DATASET_KEY,
  MARQUEE_IGNORE_SELECTOR,
  DATA_LANE_ITEM_SELECTOR,
} from '@/tools/video-editor/lib/timeline-dom.ts';
import {
  isTouchTimelineInput,
  type TimelineDeviceClass,
  type TimelineGestureOwner,
  type TimelineInputModality,
} from '@/tools/video-editor/lib/mobile-interaction-model.ts';

const MARQUEE_THRESHOLD_PX = 4;

export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseMarqueeSelectArgs {
  editAreaRef: MutableRefObject<HTMLElement | null>;
  selectionOwner?: symbol;
  deviceClass: TimelineDeviceClass;
  gestureOwner: TimelineGestureOwner;
  setGestureOwner: (owner: TimelineGestureOwner) => void;
  /** Clear host-owned inspector/context targets together with clip selection. */
  onClearSelection?: () => void;
  setInputModalityFromPointerType: (pointerType: string | null | undefined) => TimelineInputModality;
}

interface MarqueeSession {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCanvasX: number;
  startCanvasY: number;
  additive: boolean;
  hasMoved: boolean;
  claimedOwnership: boolean;
  moveListener: (event: PointerEvent) => void;
  upListener: (event: PointerEvent) => void;
  cancelListener: (event: PointerEvent) => void;
  disposeSampling: () => void;
  previousUserSelect: string;
  previousWebkitUserSelect: string;
}

const intersects = (
  left: number,
  top: number,
  right: number,
  bottom: number,
  boxLeft: number,
  boxTop: number,
  boxRight: number,
  boxBottom: number,
): boolean => {
  return left < boxRight
    && right > boxLeft
    && top < boxBottom
    && bottom > boxTop;
};

export function useMarqueeSelect({
  editAreaRef,
  selectionOwner,
  deviceClass,
  gestureOwner,
  setGestureOwner,
  onClearSelection,
  setInputModalityFromPointerType,
}: UseMarqueeSelectArgs) {
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const sessionRef = useRef<MarqueeSession | null>(null);
  const intersectedItemsRef = useRef<TimelineItemSelection>({ clipIds: [], dataItems: [] });
  const autoScrollerRef = useRef<ReturnType<typeof createAutoScroller> | null>(null);
  const gestureOwnerRef = useRef(gestureOwner);
  gestureOwnerRef.current = gestureOwner;

  const clearSession = useCallback((session: MarqueeSession | null) => {
    autoScrollerRef.current?.stop();
    autoScrollerRef.current = null;
    if (!session) {
      setMarqueeRect(null);
      intersectedItemsRef.current = { clipIds: [], dataItems: [] };
      return;
    }

    session.disposeSampling();
    window.removeEventListener('pointermove', session.moveListener);
    window.removeEventListener('pointerup', session.upListener);
    window.removeEventListener('pointercancel', session.cancelListener);
    document.body.style.userSelect = session.previousUserSelect;
    document.body.style.webkitUserSelect = session.previousWebkitUserSelect;
    if (session.claimedOwnership) {
      setGestureOwner('none');
    }
    sessionRef.current = null;
    setMarqueeRect(null);
    intersectedItemsRef.current = { clipIds: [], dataItems: [] };
  }, [setGestureOwner]);

  const clearSessionRef = useRef(clearSession);
  clearSessionRef.current = clearSession;
  useEffect(() => () => clearSessionRef.current(sessionRef.current), [selectionOwner]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!isPrimaryPointer(event.nativeEvent)) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element) || target.closest(MARQUEE_IGNORE_SELECTOR)) {
      return;
    }

    if (gestureOwnerRef.current !== 'none' && gestureOwnerRef.current !== 'timeline') {
      return;
    }

    const inputModality = setInputModalityFromPointerType(event.pointerType);
    if (isTouchTimelineInput(deviceClass, inputModality)) {
      return;
    }

    const editArea = editAreaRef.current;
    if (!editArea) {
      return;
    }

    clearSession(sessionRef.current);
    const initialPlane = getMarqueePlane(editArea);
    const observed = new Map<string, { clipId?: string; dataItem?: TimelineDataItemRef; x: number; y: number; width: number; height: number }>();
    let lastPoint = { x: event.clientX, y: event.clientY };
    const areaRect = editArea.getBoundingClientRect();
    const startCanvasX = event.clientX - areaRect.left + editArea.scrollLeft;
    const startCanvasY = event.clientY - areaRect.top + editArea.scrollTop;

    const updateSelection = (clientX: number, clientY: number) => {
      const currentEditArea = editAreaRef.current;
      if (!currentEditArea) {
        return;
      }

      const currentPlane = getMarqueePlane(currentEditArea);
      if (initialPlane && currentPlane?.layoutKey !== initialPlane.layoutKey) {
        clearSession(sessionRef.current);
        return;
      }
      lastPoint = { x: clientX, y: clientY };
      const currentRect = currentEditArea.getBoundingClientRect();
      const currentCanvasX = clientX - currentRect.left + currentEditArea.scrollLeft;
      const currentCanvasY = clientY - currentRect.top + currentEditArea.scrollTop;
      const nextRect = {
        x: Math.min(startCanvasX, currentCanvasX),
        y: Math.min(startCanvasY, currentCanvasY),
        width: Math.abs(currentCanvasX - startCanvasX),
        height: Math.abs(currentCanvasY - startCanvasY),
      };

      setMarqueeRect((current) => current && current.x === nextRect.x && current.y === nextRect.y
        && current.width === nextRect.width && current.height === nextRect.height ? current : nextRect);

      // Intersect in canvas space, the same space `nextRect` is drawn in. The
      // pointerdown anchor is pinned to the canvas, so during autoscroll the
      // content moves under a viewport-space anchor and the highlighted
      // rectangle and the selected set drift apart.
      const left = nextRect.x;
      const right = nextRect.x + nextRect.width;
      const top = nextRect.y;
      const bottom = nextRect.y + nextRect.height;
      const validData = currentPlane ? new Set(currentPlane.dataItems.map(timelineDataItemKey)) : undefined;
      const validClips = currentPlane?.clipIds ? new Set(currentPlane.clipIds) : undefined;
      const sample = (element: HTMLElement, identity: {clipId?: string; dataItem?: TimelineDataItemRef}) => {
        if (identity.dataItem && validData && !validData.has(timelineDataItemKey(identity.dataItem))) return;
        if (identity.clipId && validClips && !validClips.has(identity.clipId)) return;
        if (element.closest('[role="tooltip"], [role="menu"], [data-drag-clone], [data-lane-header]')) return;
        const rect = element.getBoundingClientRect();
        if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return;
        const key = identity.dataItem ? `data:${timelineDataItemKey(identity.dataItem)}` : `clip:${JSON.stringify(identity.clipId)}`;
        observed.set(key, { ...identity,
          x: rect.left - currentRect.left + currentEditArea.scrollLeft,
          y: rect.top - currentRect.top + currentEditArea.scrollTop,
          width: rect.width, height: rect.height });
      };
      for (const element of currentEditArea.querySelectorAll<HTMLElement>(CLIP_ACTION_WITH_ID_SELECTOR)) {
        const clipId = element.dataset[CLIP_ID_DATASET_KEY];
        if (clipId && !element.closest('[data-lane-id]')) sample(element, { clipId });
      }
      for (const element of currentEditArea.querySelectorAll<HTMLElement>(DATA_LANE_ITEM_SELECTOR)) {
        const laneRoot = element.closest<HTMLElement>('[data-lane-id]');
        const laneId = laneRoot?.dataset.laneId;
        const itemId = element.dataset.itemId;
        if (laneId && itemId && laneRoot && currentEditArea.contains(laneRoot)) sample(element, { dataItem: { laneId, itemId } });
      }
      // DOM absence is not deletion: virtualized controls can unmount while
      // their last box is still beneath the sticky label gutter. Keep actual
      // encountered geometry until this gesture ends, or identity/layout is
      // invalidated. A currently painted copy replaces its previous rectangle.
      for (const [key, box] of observed) {
        if (box.dataItem && validData && !validData.has(timelineDataItemKey(box.dataItem))
          || box.clipId && validClips && !validClips.has(box.clipId)) observed.delete(key);
      }
      // The authoritative plane bounds the cache; retain every encountered
      // valid occurrence rather than silently evicting early selected items.
      const clipIds: string[] = [];
      const dataItems: TimelineDataItemRef[] = [];
      for (const box of observed.values()) {
        if (!intersects(left, top, right, bottom, box.x, box.y, box.x + box.width, box.y + box.height)) continue;
        if (box.clipId) clipIds.push(box.clipId);
        if (box.dataItem && (!validData || validData.has(timelineDataItemKey(box.dataItem)))) dataItems.push(box.dataItem);
      }
      intersectedItemsRef.current = { clipIds, dataItems };
    };
    autoScrollerRef.current = createAutoScroller(editArea, (clientX, clientY) => {
      updateSelection(clientX, clientY);
    });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || moveEvent.pointerId !== session.pointerId) {
        return;
      }

      if (gestureOwnerRef.current === 'clip') {
        clearSession(session);
        return;
      }

      const dx = moveEvent.clientX - session.startClientX;
      const dy = moveEvent.clientY - session.startClientY;
      if (!session.hasMoved && Math.hypot(dx, dy) < MARQUEE_THRESHOLD_PX) {
        return;
      }

      if (!session.hasMoved) {
        if (gestureOwnerRef.current !== 'none' && gestureOwnerRef.current !== 'timeline') {
          clearSession(session);
          return;
        }
        if (!session.additive) onClearSelection?.();
        session.hasMoved = true;
        session.claimedOwnership = true;
        setGestureOwner('timeline');
        // Prevent text selection while dragging the marquee
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
      }
      moveEvent.preventDefault();
      autoScrollerRef.current?.update(moveEvent.clientX, moveEvent.clientY);
      updateSelection(moveEvent.clientX, moveEvent.clientY);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || upEvent.pointerId !== session.pointerId) {
        return;
      }

      if (session.hasMoved) {
        // Autoscroll may have queued a virtual window update. Commit pending
        // React work before taking the final painted-rectangle sample.
        flushSync(() => {});
        updateSelection(upEvent.clientX, upEvent.clientY);
        if (sessionRef.current !== session) return;
        userSelectTimelineItems(intersectedItemsRef.current, { additive: session.additive }, selectionOwner);
      } else if (!session.additive) {
        // Only clear selection if the pointer-up landed inside the edit area.
        // Portal menus (context menus, lightboxes) live outside the edit area DOM,
        // so a pointer-up there should not be treated as "click on empty timeline".
        const upTarget = upEvent.target;
        if (upTarget instanceof Element && editArea.contains(upTarget) && !upTarget.closest(MARQUEE_IGNORE_SELECTOR)) {
          if (onClearSelection) onClearSelection();
          else if (selectionOwner) editorClearTimelineSelection(selectionOwner);
          else userClearAllSelection();
        }
      }

      clearSession(session);
    };

    const handlePointerCancel = (cancelEvent: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || cancelEvent.pointerId !== session.pointerId) {
        return;
      }

      clearSession(session);
    };

    // Render-window changes can happen after autoscroll returns. Sampling on
    // the following animation frame observes the committed window, including
    // controls that were not mounted during the scroll callback itself.
    let frame = 0;
    const tick = () => {
      const session = sessionRef.current;
      if (!session) return;
      if (initialPlane && getMarqueePlane(editArea)?.layoutKey !== initialPlane.layoutKey) { clearSession(session); return; }
      if (session.hasMoved) updateSelection(lastPoint.x, lastPoint.y);
      if (sessionRef.current) frame = requestAnimationFrame(tick);
    };
    sessionRef.current = {
      disposeSampling: () => cancelAnimationFrame(frame),
      previousUserSelect: document.body.style.userSelect,
      previousWebkitUserSelect: document.body.style.webkitUserSelect,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCanvasX,
      startCanvasY,
      additive: isAdditiveSelectionEvent(event),
      hasMoved: false,
      claimedOwnership: false,
      moveListener: handlePointerMove,
      upListener: handlePointerUp,
      cancelListener: handlePointerCancel,
    };

    frame = requestAnimationFrame(tick);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
  }, [
    clearSession,
    selectionOwner,
    deviceClass,
    editAreaRef,
    onClearSelection,
    setGestureOwner,
    setInputModalityFromPointerType,
  ]);

  return {
    marqueeRect,
    onPointerDown,
  };
}
