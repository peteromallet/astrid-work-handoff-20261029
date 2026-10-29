import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { PortionSelection, HandleDragState, DragOffset } from '../types';
import { registerWindowDragListeners } from './windowDragListeners';

interface UseHandleDragOptions {
  duration: number;
  selections: PortionSelection[];
  fps: number | null;
  maxGapFrames?: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  trackRef: React.RefObject<HTMLDivElement | null>;
  onSelectionChange: (id: string, start: number, end: number) => void;
  onSelectionClick: (id: string | null) => void;
}

interface UseHandleDragReturn {
  dragging: HandleDragState | null;
  selectedHandle: HandleDragState | null;
  dragOffsetRef: React.RefObject<DragOffset | null>;
  isDragExceedingMax: boolean;
  startDrag: (e: React.MouseEvent | React.TouchEvent, id: string, handle: 'start' | 'end') => void;
  handleHandleTap: (e: React.MouseEvent | React.TouchEvent, id: string, handle: 'start' | 'end') => void;
  handleTrackTap: (e: React.MouseEvent | React.TouchEvent) => void;
}

// Get position from mouse or touch event
function getClientX(e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent): number {
  if ('touches' in e) {
    return e.touches[0]?.clientX ?? (e as TouchEvent).changedTouches?.[0]?.clientX ?? 0;
  }
  return (e as MouseEvent).clientX;
}

export function useHandleDrag({
  duration,
  selections,
  fps,
  maxGapFrames,
  videoRef,
  trackRef,
  onSelectionChange,
  onSelectionClick,
}: UseHandleDragOptions): UseHandleDragReturn {
  const [dragging, setDragging] = useState<HandleDragState | null>(null);

  // Tap-to-move mode: tap a handle to select it, tap track to move it
  const [selectedHandle, setSelectedHandle] = useState<HandleDragState | null>(null);

  // Store video playing state before drag
  const wasPlayingRef = useRef(false);

  // Store drag offset for immediate visual feedback (avoids React re-render lag on mobile)
  const dragOffsetRef = useRef<DragOffset | null>(null);
  // Lightweight state to trigger re-render for transform updates
  const [, setDragTick] = useState(0);
  // Store current drag time for video seeking (avoids closure issues)
  const currentDragTimeRef = useRef<number | null>(null);

  // Track if current drag exceeds max gap (for showing warning only during active violation)
  const [isDragExceedingMax, setIsDragExceedingMax] = useState(false);

  // Keep a ref to selections so handleMove doesn't need to depend on it
  const selectionsRef = useRef(selections);
  selectionsRef.current = selections;

  // Throttle state updates using requestAnimationFrame
  const rafIdRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<{ id: string; handle: 'start' | 'end'; time: number } | null>(null);

  // Start dragging (mouse or touch)
  const startDrag = (e: React.MouseEvent | React.TouchEvent, id: string, handle: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();

    // Pause video and remember state
    if (videoRef.current) {
      wasPlayingRef.current = !videoRef.current.paused;
      videoRef.current.pause();

      // Seek to current handle position
      const selection = selections.find(s => s.id === id);
      if (selection) {
        videoRef.current.currentTime = handle === 'start' ? selection.start : selection.end;
      }
    }

    setDragging({ id, handle });
    setSelectedHandle({ id, handle }); // Also select for tap-to-move mode
    onSelectionClick(id);
  };

  // Handle tap on handle (for tap-to-move mode on mobile)
  const handleHandleTap = (_e: React.MouseEvent | React.TouchEvent, id: string, handle: 'start' | 'end') => {
    // If already selected, deselect
    if (selectedHandle?.id === id && selectedHandle?.handle === handle) {
      setSelectedHandle(null);
      return;
    }

    // Select this handle
    setSelectedHandle({ id, handle });
    onSelectionClick(id);

    // Seek to handle position
    const selection = selections.find(s => s.id === id);
    if (selection && videoRef.current) {
      videoRef.current.currentTime = handle === 'start' ? selection.start : selection.end;
    }
  };

  // Handle tap on track to move selected handle
  const handleTrackTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!selectedHandle || !trackRef.current) {
      onSelectionClick(null);
      return;
    }

    const selection = selections.find(s => s.id === selectedHandle.id);
    if (!selection) return;

    const rect = trackRef.current.getBoundingClientRect();
    const clientX = getClientX(e);
    const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const time = (percent / 100) * duration;

    // Only enforce min gap (2 frames) - allow exceeding max, will show warning
    const minGapTime = fps ? 2 / fps : 0.1;

    let newTime: number;
    if (selectedHandle.handle === 'start') {
      const maxStart = selection.end - minGapTime;
      newTime = Math.max(0, Math.min(time, maxStart));
      onSelectionChange(selectedHandle.id, newTime, selection.end);
    } else {
      const minEnd = selection.start + minGapTime;
      newTime = Math.min(duration, Math.max(time, minEnd));
      onSelectionChange(selectedHandle.id, selection.start, newTime);
    }

    // Seek video to show current frame
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }

    // Clear selection after moving
    setSelectedHandle(null);
  }, [selectedHandle, onSelectionClick, selections, duration, fps, onSelectionChange, videoRef, trackRef]);

  const handleMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragging || !trackRef.current) return;

    e.preventDefault(); // Prevent scrolling on mobile

    // Use ref to get current selections (avoids dependency on selections array)
    const selection = selectionsRef.current.find(s => s.id === dragging.id);
    if (!selection) return;

    const rect = trackRef.current.getBoundingClientRect();
    const clientX = getClientX(e);
    const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const time = (percent / 100) * duration;

    // Only enforce min gap (2 frames) - allow exceeding max, will show warning
    const minGapTime = fps ? 2 / fps : 0.1;

    let newTime: number;
    if (dragging.handle === 'start') {
      // Start can't go past end - minGap
      const maxStart = selection.end - minGapTime;
      newTime = Math.max(0, Math.min(time, maxStart));
    } else {
      // End can't go before start + minGap
      const minEnd = selection.start + minGapTime;
      newTime = Math.min(duration, Math.max(time, minEnd));
    }

    // Check if this drag position would exceed max gap
    if (fps && maxGapFrames) {
      const newGapTime = dragging.handle === 'start'
        ? selection.end - newTime
        : newTime - selection.start;
      const newGapFrames = Math.round(newGapTime * fps);
      setIsDragExceedingMax(newGapFrames > maxGapFrames);
    }

    // Calculate drag offset based on new position for accurate visual feedback
    const currentPercent = dragging.handle === 'start'
      ? (selection.start / duration) * 100
      : (selection.end / duration) * 100;
    const newPercent = (newTime / duration) * 100;
    const currentPx = (currentPercent / 100) * rect.width;
    const newPx = (newPercent / 100) * rect.width;
    const offsetPx = newPx - currentPx;

    // Store offset for immediate visual update via CSS transform
    dragOffsetRef.current = { id: dragging.id, handle: dragging.handle, offsetPx };

    // Trigger lightweight re-render to apply transform immediately
    setDragTick(t => t + 1);
    pendingUpdateRef.current = { id: dragging.id, handle: dragging.handle, time: newTime };
    currentDragTimeRef.current = newTime;

    // Immediately seek video (before RAF throttle)
    if (videoRef?.current) {
      videoRef.current.currentTime = newTime;
    }

    // Throttle actual state updates using RAF (reduces re-renders)
    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const update = pendingUpdateRef.current;
        if (update && dragging) {
          const sel = selectionsRef.current.find(s => s.id === update.id);
          if (sel) {
            if (update.handle === 'start') {
              onSelectionChange(update.id, update.time, sel.end);
            } else {
              onSelectionChange(update.id, sel.start, update.time);
            }
          }
        }
        pendingUpdateRef.current = null;
      });
    }
  }, [dragging, duration, fps, maxGapFrames, onSelectionChange, videoRef, trackRef]);

  const handleEnd = useCallback(() => {
    // Clear any pending RAF
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // Reset exceeding max warning
    setIsDragExceedingMax(false);

    // Apply final pending update if any
    if (pendingUpdateRef.current && dragging) {
      const update = pendingUpdateRef.current;
      const sel = selectionsRef.current.find(s => s.id === update.id);
      if (sel) {
        if (update.handle === 'start') {
          onSelectionChange(update.id, update.time, sel.end);
        } else {
          onSelectionChange(update.id, sel.start, update.time);
        }
      }
      pendingUpdateRef.current = null;
    }

    // Clear drag offset
    dragOffsetRef.current = null;

    // Resume playing if it was playing before
    if (wasPlayingRef.current && videoRef.current) {
      videoRef.current.play();
    }
    setDragging(null);
  }, [videoRef, dragging, onSelectionChange]);

  // Attach window-level drag event listeners
  useEffect(() => {
    if (dragging) {
      return registerWindowDragListeners(handleMove, handleEnd);
    }
  }, [dragging, handleMove, handleEnd]);

  return {
    dragging,
    selectedHandle,
    dragOffsetRef,
    isDragExceedingMax,
    startDrag,
    handleHandleTap,
    handleTrackTap,
  };
}
