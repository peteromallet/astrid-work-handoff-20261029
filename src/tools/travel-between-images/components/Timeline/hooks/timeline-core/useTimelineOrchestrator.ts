import { useEffect, useRef } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { useGallerySelectionBridge } from '@/shared/hooks/gallery/useGallerySelectionBridge';
import { useIsMobile, useIsTablet } from '@/shared/hooks/mobile';
import { usePrefetchTaskData } from '@/shared/hooks/tasks/useTaskPrefetch';
import {
  getTrailingEffectiveEnd,
  getPairInfo,
  getTimelineDimensions,
} from '../../utils/timeline-utils';
import { useTimelineDrag } from '../drag/useTimelineDrag';
import { useTimelineSelection } from '../useTimelineSelection';
import { usePendingFrames } from '../segment/usePendingFrames';
import { useComputedTimelineData } from './useComputedTimelineData';
import { useTimelineUiState } from './useTimelineUiState';
import {
  useTimelineViewportController,
  type TimelineViewportControllerResult,
} from './useTimelineViewportController';
import { useUnifiedDrop } from '../drag/useUnifiedDrop';
import type { GenerationRow } from '@/domains/generation/types';
import type { DragType } from '@/shared/lib/dnd/dragDrop';
import { useTimelineOrchestratorActions } from './useTimelineOrchestratorActions';
import { useModelSettings } from '@/tools/travel-between-images/providers';
import { MODEL_DEFAULTS } from '@/tools/travel-between-images/settings';

interface TimelineOrchestratorCoreProps {
  shotId: string;
  images: GenerationRow[];
  framePositions: Map<string, number>;
  setFramePositions: (positions: Map<string, number>) => Promise<void>;
}

interface TimelineOrchestratorDropHandlers {
  onImageReorder: (orderedIds: string[], draggedItemId?: string) => void;
  onFileDrop?: (files: File[], targetFrame?: number, handles?: Array<FileSystemFileHandle | null>) => Promise<void>;
  onGenerationDrop?: (
    generationId: string,
    imageUrl: string,
    thumbUrl: string | undefined,
    targetFrame?: number,
  ) => Promise<void>;
}

interface TimelineOrchestratorInteractionProps {
  setIsDragInProgress: (dragging: boolean) => void;
  readOnly?: boolean;
  isUploadingImage?: boolean;
  maxFrameLimit?: number;
  hasExistingTrailingVideo?: boolean;
}

type UseTimelineOrchestratorProps = TimelineOrchestratorCoreProps &
  TimelineOrchestratorDropHandlers &
  TimelineOrchestratorInteractionProps;

interface UseTimelineOrchestratorReturn {
  refs: {
    timelineRef: RefObject<HTMLDivElement>;
    containerRef: RefObject<HTMLDivElement>;
  };
  viewport: Omit<TimelineViewportControllerResult, 'dragStartDimensionsRef'>;
  drag: {
    state: { isDragging: boolean; activeId: string | null };
    dragOffset: { x: number; y: number } | null;
    currentDragFrame: number | null;
    swapTargetId: string | null;
    pushMode: 'right' | 'left' | null;
    handleMouseDown: (e: ReactMouseEvent, id: string, containerRef: RefObject<HTMLDivElement>) => void;
  };
  selection: {
    selectedIds: string[];
    showSelectionBar: boolean;
    isSelected: (id: string) => boolean;
    toggleSelection: (id: string) => void;
    clearSelection: () => void;
  };
  pending: {
    pendingDropFrame: number | null;
    pendingExternalAddFrame: number | null;
    activePendingFrame: number | null;
    isInternalDropProcessing: boolean;
  };
  drop: {
    isFileOver: boolean;
    dropTargetFrame: number | null;
    dragType: DragType;
    handleDragEnter: (e: DragEvent<HTMLDivElement>) => void;
    handleDragOver: (e: DragEvent<HTMLDivElement>, containerRef: RefObject<HTMLDivElement>) => void;
    handleDragLeave: (e: DragEvent<HTMLDivElement>) => void;
    handleDrop: (e: DragEvent<HTMLDivElement>, containerRef: RefObject<HTMLDivElement>) => Promise<void>;
  };
  computed: {
    currentPositions: Map<string, number>;
    pairInfo: ReturnType<typeof getPairInfo>;
    localShotGenPositions: Map<string, number>;
    showPairLabels: boolean;
  };
  actions: {
    handleImageDropInterceptor: (files: File[], targetFrame?: number) => Promise<void>;
    handleGenerationDropInterceptor: (
      generationId: string,
      imageUrl: string,
      thumbUrl: string | undefined,
      targetFrame?: number,
    ) => Promise<void>;
    handleTapToMoveAction: (imageId: string, targetFrame: number) => Promise<void>;
    handleTapToMoveMultiAction: (imageIds: string[], targetFrame: number) => Promise<void>;
    handleTimelineTapToMove: (clientX: number) => void;
  };
  uiState: {
    resetGap: number;
    setResetGap: (value: number) => void;
    maxGap: number;
  };
  device: {
    isMobile: boolean;
    isTablet: boolean;
    enableTapToMove: boolean;
    prefetchTaskData: (generationId: string) => void;
  };
}

export function useTimelineOrchestrator({
  shotId,
  images,
  framePositions,
  setFramePositions,
  onImageReorder,
  onFileDrop,
  onGenerationDrop,
  setIsDragInProgress,
  readOnly = false,
  isUploadingImage = false,
  maxFrameLimit = 81,
  hasExistingTrailingVideo = false,
}: UseTimelineOrchestratorProps): UseTimelineOrchestratorReturn {
  const { selectedModel } = useModelSettings();
  const defaultFrameGap = MODEL_DEFAULTS[selectedModel]?.frames;

  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const enableTapToMove = isTablet && !readOnly;
  const prefetchTaskData = usePrefetchTaskData();

  const uiState = useTimelineUiState({ maxFrameLimit, defaultFrameGap });
  const {
    pendingDropFrame,
    setPendingDropFrame,
    pendingExternalAddFrame,
    isInternalDropProcessing,
    setIsInternalDropProcessing,
    activePendingFrame,
  } = usePendingFrames({ shotId, images, isUploadingImage });

  const {
    selectedIds,
    showSelectionBar,
    isSelected,
    toggleSelection,
    clearSelection,
    lockSelection,
    unlockSelection,
  } = useTimelineSelection({ isEnabled: !readOnly });

  useGallerySelectionBridge({
    selectedIds,
    images,
    clearLocalSelection: clearSelection,
  });

  const trailingEffectiveEnd = getTrailingEffectiveEnd({
    framePositions,
    imagesCount: images.length,
    hasExistingTrailingVideo,
  });
  const rawDimensions = getTimelineDimensions(
    framePositions,
    [pendingDropFrame, pendingExternalAddFrame, trailingEffectiveEnd],
  );
  const containerRect = containerRef.current?.getBoundingClientRect() || null;

  const {
    dragState,
    dragOffset,
    currentDragFrame,
    swapTargetId,
    pushMode,
    dynamicPositions,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  } = useTimelineDrag({
    framePositions,
    setFramePositions,
    images,
    onImageReorder,
    fullMin: rawDimensions.fullMin,
    fullMax: rawDimensions.fullMax,
    fullRange: rawDimensions.fullRange,
    containerRect,
    setIsDragInProgress,
    selectedIds,
    onDragStart: lockSelection,
    onDragEnd: unlockSelection,
    maxFrameLimit,
  });

  const viewport = useTimelineViewportController({
    framePositions,
    pendingDropFrame,
    pendingExternalAddFrame,
    imagesCount: images.length,
    hasExistingTrailingVideo,
    timelineRef,
    containerRef,
    dragState,
    shotId,
    handleMouseMove,
    handleMouseUp,
  });

  useEffect(() => {
    if (uiState.resetGap > uiState.maxGap) {
      uiState.setResetGap(uiState.maxGap);
    }
  }, [uiState]);

  const {
    handleImageDropInterceptor,
    handleGenerationDropInterceptor,
    handleTapToMoveAction,
    handleTapToMoveMultiAction,
    handleTimelineTapToMove,
  } = useTimelineOrchestratorActions({
    enableTapToMove,
    framePositions,
    setFramePositions,
    fullMin: viewport.fullMin,
    fullMax: viewport.fullMax,
    fullRange: viewport.fullRange,
    containerWidth: viewport.containerWidth,
    selectedIds,
    clearSelection,
    containerRef,
    onFileDrop,
    setPendingDropFrame,
    onGenerationDrop,
    setIsInternalDropProcessing,
    maxFrameLimit,
  });

  const drop = useUnifiedDrop({
    onFileDrop: handleImageDropInterceptor,
    onGenerationDrop: handleGenerationDropInterceptor,
    fullMin: viewport.fullMin,
    fullRange: viewport.fullRange,
  });

  const currentPositions = dynamicPositions();
  const {
    pairInfo,
    localShotGenPositions,
    showPairLabels,
  } = useComputedTimelineData({
    currentPositions,
    images,
    containerWidth: viewport.containerWidth,
    fullRange: viewport.fullRange,
    zoomLevel: viewport.zoomLevel,
  });

  return {
    refs: {
      timelineRef,
      containerRef,
    },
    viewport: {
      fullMin: viewport.fullMin,
      fullMax: viewport.fullMax,
      fullRange: viewport.fullRange,
      containerWidth: viewport.containerWidth,
      zoomLevel: viewport.zoomLevel,
      handleZoomInToCenter: viewport.handleZoomInToCenter,
      handleZoomOutFromCenter: viewport.handleZoomOutFromCenter,
      handleZoomReset: viewport.handleZoomReset,
      handleZoomToStart: viewport.handleZoomToStart,
      handleTimelineDoubleClick: viewport.handleTimelineDoubleClick,
    },
    drag: {
      state: dragState,
      dragOffset,
      currentDragFrame,
      swapTargetId,
      pushMode,
      handleMouseDown,
    },
    selection: {
      selectedIds,
      showSelectionBar,
      isSelected,
      toggleSelection,
      clearSelection,
    },
    pending: {
      pendingDropFrame,
      pendingExternalAddFrame,
      activePendingFrame,
      isInternalDropProcessing,
    },
    drop,
    computed: {
      currentPositions,
      pairInfo,
      localShotGenPositions,
      showPairLabels,
    },
    actions: {
      handleImageDropInterceptor,
      handleGenerationDropInterceptor,
      handleTapToMoveAction,
      handleTapToMoveMultiAction,
      handleTimelineTapToMove,
    },
    uiState,
    device: {
      isMobile,
      isTablet,
      enableTapToMove,
      prefetchTaskData,
    },
  };
}
