import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useGallerySelectionBridge } from '@/shared/hooks/gallery/useGallerySelectionBridge';
import { isPositioned, isVideoGeneration } from '@/shared/lib/typeGuards';
import { usePendingSegmentTasks } from '@/shared/hooks/tasks/usePendingSegmentTasks';
import { useSegmentOutputsForShot } from '@/shared/hooks/segments';
import { MediaLightbox } from '@/domains/media-lightbox/MediaLightbox';
import { DEFAULT_BATCH_VIDEO_FRAMES } from './constants';
import { ShotImageManagerDesktop } from './ShotImageManagerDesktop.tsx';
import { ShotImageManagerMobileWrapper } from './ShotImageManagerMobileWrapper.tsx';
import { EmptyState } from './components/EmptyState';
import { useBatchOperations } from './hooks/useBatchOperations';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useExternalGenerations } from './hooks/useExternalGenerations';
import { useLightbox } from './hooks/useLightbox';
import { useMobileGestures } from './hooks/useMobileGestures';
import { useOptimisticOrder } from './hooks/useOptimisticOrder';
import { useSelection } from './hooks/useSelection';
import { getFramePositionForIndex } from './utils/image-utils';
import type { ShotImageManagerProps } from './types';

type SegmentOutputHookResult = ReturnType<typeof useSegmentOutputsForShot>;
type SegmentSlot = SegmentOutputHookResult['segmentSlots'][number];

interface SegmentLightboxState {
  segmentLightboxIndex: number | null;
  currentSegmentSlot: SegmentSlot | null;
  currentSegmentMedia: GenerationRow | null;
  segmentChildSlotIndices: number[];
  handleSegmentClick: (slotIndex: number) => void;
  handleSegmentLightboxNext: () => void;
  handleSegmentLightboxPrev: () => void;
  closeSegmentLightbox: () => void;
}

interface SelectionOrderController {
  optimistic: ReturnType<typeof useOptimisticOrder>;
  selection: ReturnType<typeof useSelection>;
  dragAndDrop: ReturnType<typeof useDragAndDrop>;
  batchOps: ReturnType<typeof useBatchOperations>;
  mobileGestures: ReturnType<typeof useMobileGestures>;
  getFramePosition: (index: number) => number | undefined;
}

interface NavigationController {
  lightbox: ReturnType<typeof useLightbox>;
  externalGens: ReturnType<typeof useExternalGenerations>;
  shotSelector: {
    lightboxSelectedShotId: string | undefined;
    setLightboxSelectedShotId: React.Dispatch<React.SetStateAction<string | undefined>>;
  };
}

interface SegmentController {
  segmentSlots: SegmentSlot[];
  selectedParentId: string | null;
  hasPendingTask: (pairShotGenerationId: string | null | undefined) => boolean;
  segmentLightbox: SegmentLightboxState;
}

interface ShotImageManagerContainerState {
  selectionOrder: SelectionOrderController;
  navigation: NavigationController;
  segments: SegmentController;
}

interface ShotImageManagerContentProps {
  isMobile: boolean;
  props: ShotImageManagerProps;
  state: ShotImageManagerContainerState;
}

function useSegmentController(
  props: ShotImageManagerProps,
  currentImages: GenerationRow[],
): SegmentController {
  const localShotGenPositions = useMemo(() => {
    if (props.generationMode === 'timeline') {
      return undefined;
    }

    const orderedImages = currentImages.filter(
      (image) => isPositioned(image) && !isVideoGeneration(image)
    );
    if (orderedImages.length === 0) {
      return undefined;
    }

    const positions = new Map<string, number>();
    orderedImages.forEach((image, index) => {
      if (image.id) {
        positions.set(image.id, index);
      }
    });
    return positions;
  }, [currentImages, props.generationMode]);

  const shouldDeriveSegments = props.generationMode !== 'timeline' &&
    (!props.segmentSlots || (localShotGenPositions && localShotGenPositions.size > 0));

  const hookResult = useSegmentOutputsForShot(
    shouldDeriveSegments ? props.shotId || null : null,
    shouldDeriveSegments ? localShotGenPositions : undefined
  );

  const rawSegmentSlots = (localShotGenPositions && localShotGenPositions.size > 0)
    ? (hookResult.segmentSlots.length > 0 ? hookResult.segmentSlots : props.segmentSlots ?? [])
    : (props.segmentSlots ?? hookResult.segmentSlots);

  // When the shot has ≤2 positioned timeline images, the segment video IS
  // the final video — don't render inline segments between batch items.
  // Reactive: a 3rd image flips this back.
  const positionedImageCount = localShotGenPositions?.size ?? 0;
  const segmentSlots = positionedImageCount > 0 && positionedImageCount <= 2
    ? []
    : rawSegmentSlots;

  const selectedParentId = hookResult.selectedParentId;
  const { hasPendingTask } = usePendingSegmentTasks(
    props.generationMode !== 'timeline' ? props.shotId || null : null,
    props.generationMode !== 'timeline' ? props.projectId || null : null
  );

  const segmentLightbox = useSegmentLightboxState(segmentSlots, props.onPairClick);

  return {
    segmentSlots,
    selectedParentId,
    hasPendingTask,
    segmentLightbox,
  };
}

export function useSegmentLightboxState(
  segmentSlots: SegmentSlot[],
  onPairClick?: ShotImageManagerProps['onPairClick']
): SegmentLightboxState {
  const [segmentLightboxIndex, setSegmentLightboxIndex] = useState<number | null>(null);

  const handleSegmentClick = useCallback((slotIndex: number) => {
    const slot = segmentSlots[slotIndex];
    if (onPairClick && slot) {
      onPairClick(slot.index);
      return;
    }

    setSegmentLightboxIndex(slotIndex);
  }, [onPairClick, segmentSlots]);

  const currentSegmentSlot = segmentLightboxIndex !== null ? segmentSlots[segmentLightboxIndex] : null;
  const currentSegmentMedia = currentSegmentSlot?.type === 'child'
    ? currentSegmentSlot.child
    : null;

  const segmentChildSlotIndices = useMemo(
    () =>
      segmentSlots
        .map((slot, idx) => (slot.type === 'child' && slot.child.location ? idx : null))
        .filter((idx): idx is number => idx !== null),
    [segmentSlots]
  );

  const handleSegmentLightboxNext = useCallback(() => {
    if (segmentLightboxIndex === null || segmentChildSlotIndices.length === 0) {
      return;
    }

    const currentPos = segmentChildSlotIndices.indexOf(segmentLightboxIndex);
    const nextPos = (currentPos + 1) % segmentChildSlotIndices.length;
    setSegmentLightboxIndex(segmentChildSlotIndices[nextPos]);
  }, [segmentChildSlotIndices, segmentLightboxIndex]);

  const handleSegmentLightboxPrev = useCallback(() => {
    if (segmentLightboxIndex === null || segmentChildSlotIndices.length === 0) {
      return;
    }

    const currentPos = segmentChildSlotIndices.indexOf(segmentLightboxIndex);
    const prevPos = (currentPos - 1 + segmentChildSlotIndices.length) % segmentChildSlotIndices.length;
    setSegmentLightboxIndex(segmentChildSlotIndices[prevPos]);
  }, [segmentChildSlotIndices, segmentLightboxIndex]);

  const closeSegmentLightbox = useCallback(() => {
    setSegmentLightboxIndex(null);
  }, []);

  return {
    segmentLightboxIndex,
    currentSegmentSlot,
    currentSegmentMedia,
    segmentChildSlotIndices,
    handleSegmentClick,
    handleSegmentLightboxNext,
    handleSegmentLightboxPrev,
    closeSegmentLightbox,
  };
}

function useShotImageManagerNavigationController(
  props: ShotImageManagerProps,
  optimisticOrder: ReturnType<typeof useOptimisticOrder>['optimisticOrder'],
): NavigationController {
  const setLightboxIndexRef = useRef<(index: number) => void>(() => {});
  const externalGens = useExternalGenerations({
    selectedShotId: props.selectedShotId,
    optimisticOrder,
    images: props.images,
    setLightboxIndexRef,
  });

  const [lightboxSelectedShotId, setLightboxSelectedShotId] = useState<string | undefined>(props.selectedShotId);
  const lightbox = useLightbox({
    images: optimisticOrder,
    externalGenerations: externalGens.externalGenerations,
    tempDerivedGenerations: externalGens.tempDerivedGenerations,
    derivedNavContext: externalGens.derivedNavContext,
    handleOpenExternalGeneration: externalGens.handleOpenExternalGeneration,
  });

  useEffect(() => {
    setLightboxIndexRef.current = lightbox.setLightboxIndex;
  }, [lightbox.setLightboxIndex]);

  return {
    lightbox,
    externalGens,
    shotSelector: {
      lightboxSelectedShotId,
      setLightboxSelectedShotId,
    },
  };
}

function useShotImageManagerSelectionOrderController(
  props: ShotImageManagerProps,
  isMobile: boolean,
  currentImages: GenerationRow[],
  optimistic: ReturnType<typeof useOptimisticOrder>,
  setLightboxIndex: ReturnType<typeof useLightbox>['setLightboxIndex'],
): SelectionOrderController {
  const selection = useSelection({
    images: optimistic.optimisticOrder,
    isMobile,
    generationMode: props.generationMode,
    onSelectionChange: props.onSelectionChange,
  });

  useGallerySelectionBridge({
    selectedIds: isMobile ? selection.mobileSelectedIds : selection.selectedIds,
    images: optimistic.optimisticOrder,
    clearLocalSelection: selection.clearSelection,
  });

  const dragAndDrop = useDragAndDrop({
    images: currentImages,
    selectedIds: selection.selectedIds,
    onImageReorder: props.onImageReorder,
    isMobile,
    setSelectedIds: selection.setSelectedIds,
    setLastSelectedIndex: selection.setLastSelectedIndex,
    setOptimisticOrder: optimistic.setOptimisticOrder,
    setIsOptimisticUpdate: optimistic.setIsOptimisticUpdate,
    setReconciliationId: optimistic.setReconciliationId,
    onDragStateChange: props.onDragStateChange,
  });

  const batchOps = useBatchOperations({
    currentImages,
    onImageDelete: props.onImageDelete,
    onBatchImageDelete: props.onBatchImageDelete,
    onSelectionChange: props.onSelectionChange,
    setSelectedIds: selection.setSelectedIds,
    setMobileSelectedIds: selection.setMobileSelectedIds,
    setLastSelectedIndex: selection.setLastSelectedIndex,
  });

  const mobileGestures = useMobileGestures({
    currentImages,
    mobileSelectedIds: selection.mobileSelectedIds,
    onImageReorder: props.onImageReorder,
    setMobileSelectedIds: selection.setMobileSelectedIds,
    setLightboxIndex,
  });

  const getFramePosition = useMemo(
    () => (index: number) =>
      getFramePositionForIndex(
        index,
        currentImages,
        props.batchVideoFrames || DEFAULT_BATCH_VIDEO_FRAMES
      ),
    [currentImages, props.batchVideoFrames]
  );

  return {
    optimistic,
    selection,
    dragAndDrop,
    batchOps,
    mobileGestures,
    getFramePosition,
  };
}

function useShotImageManagerContainerState(
  props: ShotImageManagerProps,
  isMobile: boolean
): ShotImageManagerContainerState {
  const optimistic = useOptimisticOrder({ images: props.images });
  const navigation = useShotImageManagerNavigationController(props, optimistic.optimisticOrder);
  const selectionOrder = useShotImageManagerSelectionOrderController(
    props,
    isMobile,
    navigation.lightbox.currentImages,
    optimistic,
    navigation.lightbox.setLightboxIndex,
  );
  const segments = useSegmentController(props, navigation.lightbox.currentImages);

  return {
    selectionOrder,
    navigation,
    segments,
  };
}

function SegmentLightboxModal({
  segmentLightbox,
  selectedParentId,
  shotId,
  readOnly,
}: {
  segmentLightbox: SegmentLightboxState;
  selectedParentId: string | null;
  shotId: string | undefined;
  readOnly: boolean | undefined;
}) {
  if (!segmentLightbox.currentSegmentMedia) return null;

  return (
    <MediaLightbox
      media={segmentLightbox.currentSegmentMedia}
      parentGenerationIdOverride={selectedParentId || undefined}
      onClose={segmentLightbox.closeSegmentLightbox}
      navigation={{
        onNext: segmentLightbox.handleSegmentLightboxNext,
        onPrevious: segmentLightbox.handleSegmentLightboxPrev,
        showNavigation: true,
        hasNext: segmentLightbox.segmentChildSlotIndices.length > 1,
        hasPrevious: segmentLightbox.segmentChildSlotIndices.length > 1,
      }}
      features={{
        showDownload: true,
        showTaskDetails: true,
      }}
      shotId={shotId}
      readOnly={readOnly}
      videoProps={{
        fetchVariantsForSelf: true,
      }}
    />
  );
}

export function ShotImageManagerContent({
  isMobile,
  props,
  state,
}: ShotImageManagerContentProps) {
  if (!props.images || props.images.length === 0) {
    return (
      <EmptyState
        onImageUpload={props.onImageUpload}
        isUploadingImage={props.isUploadingImage}
        shotId={props.selectedShotId}
        onGenerationDrop={props.onGenerationDrop
          ? (generationId, imageUrl, thumbUrl) =>
              props.onGenerationDrop!(generationId, imageUrl, thumbUrl, 0)
          : undefined}
      />
    );
  }

  if (isMobile && props.generationMode !== 'timeline') {
    return (
      <>
        <ShotImageManagerMobileWrapper
          {...props}
          selection={state.selectionOrder.selection}
          lightbox={state.navigation.lightbox}
          batchOps={state.selectionOrder.batchOps}
          mobileGestures={state.selectionOrder.mobileGestures}
          optimistic={state.selectionOrder.optimistic}
          externalGens={state.navigation.externalGens}
          lightboxSelectedShotId={state.navigation.shotSelector.lightboxSelectedShotId}
          setLightboxSelectedShotId={state.navigation.shotSelector.setLightboxSelectedShotId}
          segmentSlots={state.segments.segmentSlots}
          onSegmentClick={state.segments.segmentLightbox.handleSegmentClick}
          hasPendingTask={state.segments.hasPendingTask}
          onSegmentDelete={props.onSegmentDelete}
          deletingSegmentId={props.deletingSegmentId}
        />

        <SegmentLightboxModal
          segmentLightbox={state.segments.segmentLightbox}
          selectedParentId={state.segments.selectedParentId}
          shotId={props.shotId}
          readOnly={props.readOnly}
        />
      </>
    );
  }

  return (
    <>
      <ShotImageManagerDesktop
        {...props}
        onVariantDrop={props.onVariantDrop}
        selection={state.selectionOrder.selection}
        dragAndDrop={state.selectionOrder.dragAndDrop}
        lightbox={state.navigation.lightbox}
        batchOps={state.selectionOrder.batchOps}
        optimistic={state.selectionOrder.optimistic}
        externalGens={state.navigation.externalGens}
        getFramePosition={state.selectionOrder.getFramePosition}
        lightboxSelectedShotId={state.navigation.shotSelector.lightboxSelectedShotId}
        setLightboxSelectedShotId={state.navigation.shotSelector.setLightboxSelectedShotId}
        segmentSlots={state.segments.segmentSlots}
        onSegmentClick={state.segments.segmentLightbox.handleSegmentClick}
        hasPendingTask={state.segments.hasPendingTask}
        onSegmentDelete={props.onSegmentDelete}
        deletingSegmentId={props.deletingSegmentId}
      />

      <SegmentLightboxModal
        segmentLightbox={state.segments.segmentLightbox}
        selectedParentId={state.segments.selectedParentId}
        shotId={props.shotId}
        readOnly={props.readOnly}
      />
    </>
  );
}

/**
 * Main container component for ShotImageManager
 *
 * CRITICAL: All hooks MUST be called before any early returns to satisfy Rules of Hooks.
 * This prevents hook ordering violations that occur when responsive breakpoints change.
 */
export const ShotImageManagerContainer: React.FC<ShotImageManagerProps> = (props) => {
  const isMobile = useIsMobile();
  const state = useShotImageManagerContainerState(props, isMobile);

  return (
    <ShotImageManagerContent
      isMobile={isMobile}
      props={props}
      state={state}
    />
  );
};
