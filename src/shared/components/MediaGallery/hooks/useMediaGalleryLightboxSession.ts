import { useCallback, useMemo, useState } from 'react';
import type { TaskDetailsData } from '@/shared/lib/taskDetails/taskDetailsContract';
import type { MediaGalleryLightboxSession } from '../components/MediaGalleryLightbox';
import type { GeneratedImageWithMetadata } from '../types';
import { buildMediaGalleryLightboxMedia } from '../utils/lightboxMedia';
import {
  buildTaskDetailsPayload,
  useGenerationNavigationController,
  useLightboxNavigationState,
  useShotAssociationState,
} from './useMediaGalleryLightboxControllers';

interface MediaGalleryLightboxSessionStateHook {
  state: {
    activeLightboxMedia: GeneratedImageWithMetadata | null;
    selectedShotIdLocal: string;
    showTickForImageId: string | null;
    showTickForSecondaryImageId: string | null;
    optimisticPositionedIds: Set<string>;
    optimisticUnpositionedIds: Set<string>;
    showTaskDetailsModal: boolean;
    selectedImageForDetails: MediaGalleryLightboxSession['selectedImageForDetails'];
  };
  setShowTickForImageId: (id: string | null) => void;
  setShowTickForSecondaryImageId: (id: string | null) => void;
  setShowTaskDetailsModal: (show: boolean) => void;
  setSelectedImageForDetails: (
    image: MediaGalleryLightboxSession['selectedImageForDetails']
  ) => void;
  markOptimisticPositioned: (imageId: string, shotId: string) => void;
  markOptimisticUnpositioned: (imageId: string, shotId: string) => void;
}

interface MediaGalleryLightboxSessionActionsHook {
  handleCloseLightbox: MediaGalleryLightboxSession['onClose'];
  handleOptimisticDelete: NonNullable<MediaGalleryLightboxSession['onDelete']>;
  handleShotChange: NonNullable<MediaGalleryLightboxSession['onShotChange']>;
}

interface MediaGalleryLightboxSessionFiltersHook {
  filteredImages: MediaGalleryLightboxSession['filteredImages'];
}

interface MediaGalleryLightboxSessionPaginationHook {
  isServerPagination: boolean;
  totalPages: number;
}

interface UseMediaGalleryLightboxSessionParams {
  stateHook: MediaGalleryLightboxSessionStateHook;
  actionsHook: MediaGalleryLightboxSessionActionsHook;
  filtersHook: MediaGalleryLightboxSessionFiltersHook;
  paginationHook: MediaGalleryLightboxSessionPaginationHook;
  serverPage?: number;
  handleNextImage: () => void;
  handlePreviousImage: () => void;
  handleSetActiveLightboxIndex: (index: number) => void;
  lightboxDeletingId: string | null;
  simplifiedShotOptions: MediaGalleryLightboxSession['simplifiedShotOptions'];
  onAddToLastShot?: MediaGalleryLightboxSession['onAddToShot'];
  onAddToLastShotWithoutPosition?: MediaGalleryLightboxSession['onAddToShotWithoutPosition'];
  task: MediaGalleryLightboxSession['task'];
  taskDetailsLoading: boolean;
  taskError: MediaGalleryLightboxSession['taskError'];
  inputImages: NonNullable<MediaGalleryLightboxSession['inputImages']>;
  lightboxTaskMapping: MediaGalleryLightboxSession['lightboxTaskMapping'];
  handleNavigateToShot: NonNullable<MediaGalleryLightboxSession['onNavigateToShot']>;
  showDelete: boolean;
}

export function useMediaGalleryLightboxSession(params: UseMediaGalleryLightboxSessionParams): MediaGalleryLightboxSession {
  const {
    stateHook,
    actionsHook,
    filtersHook,
    paginationHook,
    serverPage,
    handleNextImage,
    handlePreviousImage,
    handleSetActiveLightboxIndex,
    lightboxDeletingId,
    simplifiedShotOptions,
    onAddToLastShot,
    onAddToLastShotWithoutPosition,
    task,
    taskDetailsLoading,
    taskError,
    inputImages,
    lightboxTaskMapping,
    handleNavigateToShot,
    showDelete,
  } = params;
  const [lightboxShotOverrideId, setLightboxShotOverrideId] = useState<string | null>(null);

  const selectedShotIdFromGallery = stateHook.state.selectedShotIdLocal !== 'all'
    ? stateHook.state.selectedShotIdLocal
    : undefined;
  const selectedShotIdForLightbox = lightboxShotOverrideId ?? selectedShotIdFromGallery;

  const hasNextPrevious = useLightboxNavigationState({
    activeLightboxMedia: stateHook.state.activeLightboxMedia,
    filteredImages: filtersHook.filteredImages,
    isServerPagination: paginationHook.isServerPagination,
    serverPage,
    totalPages: paginationHook.totalPages,
  });

  const sourceRecord = useMemo(() => {
    return filtersHook.filteredImages.find((img) => img.id === stateHook.state.activeLightboxMedia?.id);
  }, [filtersHook.filteredImages, stateHook.state.activeLightboxMedia?.id]);

  const {
    positionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
  } = useShotAssociationState({
    sourceRecord,
    effectiveShotId: selectedShotIdForLightbox,
  });
  const closeLightboxAction = actionsHook.handleCloseLightbox;
  const deleteLightboxAction = actionsHook.handleOptimisticDelete;
  const shotChangeAction = actionsHook.handleShotChange;

  const { handleNavigateToGeneration, handleOpenExternalGeneration } = useGenerationNavigationController({
    filteredImages: filtersHook.filteredImages,
    setActiveLightboxIndex: handleSetActiveLightboxIndex,
  });

  const lightboxMedia = useMemo(() => {
    const activeMedia = stateHook.state.activeLightboxMedia;
    if (!activeMedia) {
      return null;
    }

    const sourceMedia = filtersHook.filteredImages.find((img) => img.id === activeMedia.id) ?? activeMedia;
    return buildMediaGalleryLightboxMedia({
      activeMedia,
      sourceMedia,
    });
  }, [filtersHook.filteredImages, stateHook.state.activeLightboxMedia]);

  const handleLightboxClose = useCallback(() => {
    setLightboxShotOverrideId(null);
    closeLightboxAction();
  }, [closeLightboxAction]);

  const handleLightboxShotChange = useCallback((shotId: string) => {
    setLightboxShotOverrideId(shotId);
    shotChangeAction(shotId);
  }, [shotChangeAction]);

  const taskDetailsData = useMemo<TaskDetailsData>(() => buildTaskDetailsPayload({
    task,
    isLoadingTask: taskDetailsLoading,
    taskError,
    inputImages,
    taskId: lightboxTaskMapping?.taskId ?? null,
    onClose: handleLightboxClose,
  }), [
    handleLightboxClose,
    inputImages,
    lightboxTaskMapping?.taskId,
    task,
    taskDetailsLoading,
    taskError,
  ]);

  return useMemo<MediaGalleryLightboxSession>(() => ({
    lightboxMedia,
    onClose: handleLightboxClose,
    filteredImages: filtersHook.filteredImages,
    isServerPagination: paginationHook.isServerPagination,
    serverPage,
    totalPages: paginationHook.totalPages,
    onNext: handleNextImage,
    onPrevious: handlePreviousImage,
    hasNext: hasNextPrevious.hasNext,
    hasPrevious: hasNextPrevious.hasPrevious,
    handleNavigateToGeneration,
    handleOpenExternalGeneration,
    onDelete: showDelete ? deleteLightboxAction : undefined,
    isDeleting: lightboxDeletingId,
    simplifiedShotOptions,
    selectedShotIdLocal: stateHook.state.selectedShotIdLocal,
    selectedShotIdForLightbox,
    onShotChange: handleLightboxShotChange,
    onAddToShot: onAddToLastShot,
    onAddToShotWithoutPosition: onAddToLastShotWithoutPosition,
    positionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
    showTickForImageId: stateHook.state.showTickForImageId,
    setShowTickForImageId: stateHook.setShowTickForImageId,
    showTickForSecondaryImageId: stateHook.state.showTickForSecondaryImageId,
    setShowTickForSecondaryImageId: stateHook.setShowTickForSecondaryImageId,
    optimisticPositionedIds: stateHook.state.optimisticPositionedIds,
    optimisticUnpositionedIds: stateHook.state.optimisticUnpositionedIds,
    onOptimisticPositioned: stateHook.markOptimisticPositioned,
    onOptimisticUnpositioned: stateHook.markOptimisticUnpositioned,
    showTaskDetailsModal: stateHook.state.showTaskDetailsModal,
    setShowTaskDetailsModal: stateHook.setShowTaskDetailsModal,
    selectedImageForDetails: stateHook.state.selectedImageForDetails,
    setSelectedImageForDetails: stateHook.setSelectedImageForDetails,
    task,
    isLoadingTask: taskDetailsLoading,
    taskError,
    inputImages,
    lightboxTaskMapping,
    taskDetailsData,
    onNavigateToShot: handleNavigateToShot,
    setActiveLightboxIndex: handleSetActiveLightboxIndex,
  }), [
    deleteLightboxAction,
    filtersHook.filteredImages,
    handleLightboxClose,
    handleLightboxShotChange,
    handleNavigateToGeneration,
    handleNavigateToShot,
    handleNextImage,
    handleOpenExternalGeneration,
    handlePreviousImage,
    handleSetActiveLightboxIndex,
    hasNextPrevious.hasNext,
    hasNextPrevious.hasPrevious,
    inputImages,
    lightboxDeletingId,
    lightboxMedia,
    lightboxTaskMapping,
    onAddToLastShot,
    onAddToLastShotWithoutPosition,
    paginationHook.isServerPagination,
    paginationHook.totalPages,
    serverPage,
    showDelete,
    simplifiedShotOptions,
    stateHook.markOptimisticPositioned,
    stateHook.markOptimisticUnpositioned,
    stateHook.setSelectedImageForDetails,
    stateHook.setShowTaskDetailsModal,
    stateHook.setShowTickForImageId,
    stateHook.setShowTickForSecondaryImageId,
    stateHook.state.optimisticPositionedIds,
    stateHook.state.optimisticUnpositionedIds,
    stateHook.state.selectedImageForDetails,
    stateHook.state.selectedShotIdLocal,
    stateHook.state.showTaskDetailsModal,
    stateHook.state.showTickForImageId,
    stateHook.state.showTickForSecondaryImageId,
    positionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
    selectedShotIdForLightbox,
    task,
    taskDetailsData,
    taskDetailsLoading,
    taskError,
  ]);
}
