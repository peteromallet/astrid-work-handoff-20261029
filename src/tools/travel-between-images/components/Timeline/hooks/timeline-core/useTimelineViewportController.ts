import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { getTimelineDimensions, getTrailingEffectiveEnd } from '../../utils/timeline-utils';
import { useZoom } from '../useZoom';
import { useGlobalEvents } from '../useGlobalEvents';

interface TimelineDragStateLike {
  isDragging: boolean;
  activeId: string | null;
}

interface UseTimelineViewportControllerInput {
  framePositions: Map<string, number>;
  pendingDropFrame: number | null;
  pendingExternalAddFrame: number | null;
  imagesCount: number;
  hasExistingTrailingVideo: boolean;
  timelineRef: RefObject<HTMLDivElement>;
  containerRef: RefObject<HTMLDivElement>;
  dragState: TimelineDragStateLike;
  shotId: string;
  handleMouseMove: (event: MouseEvent) => void;
  handleMouseUp: (event: MouseEvent) => void;
}

export interface TimelineViewportControllerResult {
  fullMin: number;
  fullMax: number;
  fullRange: number;
  containerWidth: number;
  zoomLevel: number;
  handleZoomInToCenter: () => void;
  handleZoomOutFromCenter: () => void;
  handleZoomReset: () => void;
  handleZoomToStart: () => void;
  handleTimelineDoubleClick: (
    e: ReactMouseEvent<HTMLDivElement>,
    containerRef: RefObject<HTMLDivElement>,
  ) => void;
  dragStartDimensionsRef: RefObject<{ fullMin: number; fullMax: number; fullRange: number } | null>;
}

function resolveViewportCenterFrame(input: {
  timelineRef: RefObject<HTMLDivElement>;
  containerRef: RefObject<HTMLDivElement>;
  fullMin: number;
  fullRange: number;
}): number | null {
  const scrollContainer = input.timelineRef.current;
  const timelineContainer = input.containerRef.current;
  if (!scrollContainer || !timelineContainer) {
    return null;
  }

  const viewportCenterPixel = scrollContainer.scrollLeft + (scrollContainer.clientWidth / 2);
  const viewportCenterFraction = timelineContainer.scrollWidth > 0
    ? viewportCenterPixel / timelineContainer.scrollWidth
    : 0;
  return input.fullMin + (viewportCenterFraction * input.fullRange);
}

function useDragJustEndedState(dragState: TimelineDragStateLike): RefObject<boolean> {
  const dragJustEndedRef = useRef(false);
  const dragEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!dragState.isDragging && dragState.activeId === null) {
      dragJustEndedRef.current = true;
      if (dragEndTimeoutRef.current) {
        clearTimeout(dragEndTimeoutRef.current);
      }
      dragEndTimeoutRef.current = setTimeout(() => {
        dragJustEndedRef.current = false;
      }, 500);
    }
    return () => {
      if (dragEndTimeoutRef.current) {
        clearTimeout(dragEndTimeoutRef.current);
      }
    };
  }, [dragState.activeId, dragState.isDragging]);

  return dragJustEndedRef as RefObject<boolean>;
}

function useZoomCenteringScroll(input: {
  isZooming: boolean;
  zoomLevel: number;
  zoomCenter: number;
  dragState: TimelineDragStateLike;
  dragJustEndedRef: RefObject<boolean>;
  timelineRef: RefObject<HTMLDivElement>;
  containerRef: RefObject<HTMLDivElement>;
  fullMin: number;
  fullRange: number;
}): void {
  const {
    isZooming,
    zoomLevel,
    zoomCenter,
    dragState,
    dragJustEndedRef,
    timelineRef,
    containerRef,
    fullMin,
    fullRange,
  } = input;

  useEffect(() => {
    if (!isZooming || dragState.isDragging || dragJustEndedRef.current || zoomLevel <= 1) {
      return;
    }
    if (!timelineRef.current || !containerRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      if (dragJustEndedRef.current) {
        return;
      }
      const scrollContainer = timelineRef.current;
      const timelineContainer = containerRef.current;
      if (!scrollContainer || !timelineContainer) {
        return;
      }
      const centerFraction = (zoomCenter - fullMin) / fullRange;
      const centerPixelInZoomedTimeline = centerFraction * timelineContainer.scrollWidth;
      const targetScroll = centerPixelInZoomedTimeline - (scrollContainer.clientWidth / 2);
      scrollContainer.scrollTo({ left: Math.max(0, targetScroll), behavior: 'instant' });
    }, 10);

    return () => clearTimeout(timer);
  }, [containerRef, dragState.isDragging, dragJustEndedRef, fullMin, fullRange, isZooming, timelineRef, zoomCenter, zoomLevel]);
}

export function useTimelineViewportController(
  input: UseTimelineViewportControllerInput,
): TimelineViewportControllerResult {
  const {
    framePositions,
    pendingDropFrame,
    pendingExternalAddFrame,
    imagesCount,
    hasExistingTrailingVideo,
    timelineRef,
    containerRef,
    dragState,
    shotId,
    handleMouseMove,
    handleMouseUp,
  } = input;
  const dragStartDimensionsRef = useRef<{ fullMin: number; fullMax: number; fullRange: number } | null>(null);
  const dragJustEndedRef = useDragJustEndedState(dragState);

  const trailingEffectiveEnd = useMemo(() => getTrailingEffectiveEnd({
    framePositions,
    imagesCount,
    hasExistingTrailingVideo,
  }), [framePositions, hasExistingTrailingVideo, imagesCount]);

  const rawDimensions = getTimelineDimensions(
    framePositions,
    [
      pendingDropFrame,
      pendingExternalAddFrame,
      trailingEffectiveEnd,
    ],
  );

  const containerWidth = containerRef.current?.clientWidth || 1000;

  useGlobalEvents({
    isDragging: dragState.isDragging,
    activeId: dragState.activeId ?? undefined,
    shotId,
    handleMouseMove,
    handleMouseUp,
    containerRef,
  });

  useEffect(() => {
    if (dragState.isDragging && dragState.activeId && !dragStartDimensionsRef.current) {
      dragStartDimensionsRef.current = {
        fullMin: rawDimensions.fullMin,
        fullMax: rawDimensions.fullMax,
        fullRange: rawDimensions.fullRange,
      };
    } else if (!dragState.isDragging && dragStartDimensionsRef.current) {
      dragStartDimensionsRef.current = null;
    }
  }, [
    dragState.activeId,
    dragState.isDragging,
    rawDimensions.fullMax,
    rawDimensions.fullMin,
    rawDimensions.fullRange,
  ]);

  const isDraggingAnything = dragState.isDragging;

  let fullMin = rawDimensions.fullMin;
  let fullMax = rawDimensions.fullMax;
  let fullRange = rawDimensions.fullRange;
  if (isDraggingAnything && dragStartDimensionsRef.current) {
    fullMax = Math.max(rawDimensions.fullMax, dragStartDimensionsRef.current.fullMax);
    fullMin = Math.min(rawDimensions.fullMin, dragStartDimensionsRef.current.fullMin);
    fullRange = fullMax - fullMin;
  }

  const {
    zoomLevel,
    zoomCenter,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleZoomToStart,
    handleTimelineDoubleClick,
    isZooming,
  } = useZoom({ fullMin, fullMax, fullRange, containerRef: timelineRef });

  const handleZoomInToCenter = useCallback(() => {
    const viewportCenterFrame = resolveViewportCenterFrame({
      timelineRef,
      containerRef,
      fullMin,
      fullRange,
    });
    if (viewportCenterFrame === null) {
      handleZoomIn(fullMin);
      return;
    }
    handleZoomIn(viewportCenterFrame);
  }, [containerRef, fullMin, fullRange, handleZoomIn, timelineRef]);

  const handleZoomOutFromCenter = useCallback(() => {
    const viewportCenterFrame = resolveViewportCenterFrame({
      timelineRef,
      containerRef,
      fullMin,
      fullRange,
    });
    if (viewportCenterFrame === null) {
      handleZoomOut(fullMin);
      return;
    }
    handleZoomOut(viewportCenterFrame);
  }, [containerRef, fullMin, fullRange, handleZoomOut, timelineRef]);

  useZoomCenteringScroll({
    isZooming,
    zoomLevel,
    zoomCenter,
    dragState,
    dragJustEndedRef,
    timelineRef,
    containerRef,
    fullMin,
    fullRange,
  });

  return {
    fullMin,
    fullMax,
    fullRange,
    containerWidth,
    zoomLevel,
    handleZoomInToCenter,
    handleZoomOutFromCenter,
    handleZoomReset,
    handleZoomToStart,
    handleTimelineDoubleClick,
    dragStartDimensionsRef,
  };
}
