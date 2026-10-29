import { useMemo } from 'react';
import type {
  ItemActions,
  ItemFeatures,
  ItemLoading,
  ItemMobileInteraction,
  ItemShotWorkflow,
} from '@/shared/components/MediaGalleryItem/types';
import type { DisplayableMetadata, GeneratedImageWithMetadata, SimplifiedShotOption } from '../types';
import type { AddToShotHandler } from '@/shared/types/imageHandlers';
import type { MouseEvent } from 'react';

function resolveLightboxDeletingId(
  isDeleting: string | boolean | null | undefined,
  activeMediaId: string | undefined,
): string | null {
  if (typeof isDeleting === 'string') {
    return isDeleting;
  }
  if (isDeleting && activeMediaId) {
    return activeMediaId;
  }
  return null;
}

interface UseMediaGalleryItemShotOptionsProps {
  simplifiedShotOptions: SimplifiedShotOption[];
  currentViewingShotId?: string;
  onAddToLastShot?: AddToShotHandler;
  onAddToLastShotWithoutPosition?: AddToShotHandler;
}

interface UseMediaGalleryItemFeaturesProps {
  showDelete: boolean;
  showDownload: boolean;
  showStar: boolean;
  showAddToShot: boolean;
  enableSingleClick: boolean;
  videosAsThumbnails: boolean;
  onToggleStar?: (id: string, starred: boolean) => void;
  onApplySettings?: (metadata: DisplayableMetadata | undefined) => void;
  onImageClick?: (image: GeneratedImageWithMetadata, modifiers?: { multiSelect: boolean }) => void;
  onContextMenu?: (event: MouseEvent, image: GeneratedImageWithMetadata) => void;
  onAddToTimeline?: (generationId: string) => void;
  addToTimelineDisabledReason?: string;
  isDeleting?: string | boolean | null;
}

interface UseMediaGalleryItemShotWorkflowProps {
  selectedShotIdLocal: string;
  setSelectedShotIdLocal: (id: string) => void;
  onShotChange: (shotId: string) => void;
  showTickForImageId: string | null;
  onShowTick: (imageId: string) => void;
  showTickForSecondaryImageId: string | null;
  onShowSecondaryTick: (imageId: string) => void;
  optimisticUnpositionedIds: Set<string>;
  optimisticPositionedIds: Set<string>;
  optimisticDeletedIds: Set<string>;
  onOptimisticUnpositioned: (imageId: string, shotId: string) => void;
  onOptimisticPositioned: (imageId: string, shotId: string) => void;
  addingToShotImageId: string | null;
  setAddingToShotImageId: (id: string | null) => void;
  addingToShotWithoutPositionImageId: string | null;
  setAddingToShotWithoutPositionImageId: (id: string | null) => void;
}

interface UseMediaGalleryItemMobileProps {
  mobileActiveImageId: string | null;
  mobilePopoverOpenImageId: string | null;
  onMobileTap: (image: GeneratedImageWithMetadata) => void;
  setMobilePopoverOpenImageId: (id: string | null) => void;
}

interface UseMediaGalleryItemActionsProps {
  onOpenLightbox: (image: GeneratedImageWithMetadata) => void;
  onDelete?: (id: string) => void;
  onDownloadImage: (
    rawUrl: string,
    filename: string,
    imageId?: string,
    isVideo?: boolean,
    originalContentType?: string,
  ) => void;
}

interface UseMediaGalleryItemLoadingProps {
  activeLightboxMediaId?: string;
  downloadingImageId: string | null;
}

type UseMediaGalleryItemPropsParams = UseMediaGalleryItemShotOptionsProps &
  UseMediaGalleryItemFeaturesProps &
  UseMediaGalleryItemShotWorkflowProps &
  UseMediaGalleryItemMobileProps &
  UseMediaGalleryItemActionsProps &
  UseMediaGalleryItemLoadingProps;

export function useMediaGalleryItemProps({
  simplifiedShotOptions,
  currentViewingShotId,
  onAddToLastShot,
  onAddToLastShotWithoutPosition,
  showDelete,
  showDownload,
  showStar,
  showAddToShot,
  enableSingleClick,
  videosAsThumbnails,
  onToggleStar,
  onApplySettings,
  onImageClick,
  onContextMenu,
  onAddToTimeline,
  addToTimelineDisabledReason,
  isDeleting,
  selectedShotIdLocal,
  setSelectedShotIdLocal,
  onShotChange,
  showTickForImageId,
  onShowTick,
  showTickForSecondaryImageId,
  onShowSecondaryTick,
  optimisticUnpositionedIds,
  optimisticPositionedIds,
  optimisticDeletedIds,
  onOptimisticUnpositioned,
  onOptimisticPositioned,
  addingToShotImageId,
  setAddingToShotImageId,
  addingToShotWithoutPositionImageId,
  setAddingToShotWithoutPositionImageId,
  mobileActiveImageId,
  mobilePopoverOpenImageId,
  onMobileTap,
  setMobilePopoverOpenImageId,
  onOpenLightbox,
  onDelete,
  onDownloadImage,
  activeLightboxMediaId,
  downloadingImageId,
}: UseMediaGalleryItemPropsParams) {
  const itemShotWorkflow = useMemo<ItemShotWorkflow>(
    () => ({
      selectedShotIdLocal,
      simplifiedShotOptions,
      setSelectedShotIdLocal,
      setLastAffectedShotId: onShotChange,
      showTickForImageId,
      onShowTick,
      showTickForSecondaryImageId,
      onShowSecondaryTick,
      optimisticUnpositionedIds,
      optimisticPositionedIds,
      optimisticDeletedIds,
      onOptimisticUnpositioned,
      onOptimisticPositioned,
      addingToShotImageId,
      setAddingToShotImageId,
      addingToShotWithoutPositionImageId,
      setAddingToShotWithoutPositionImageId,
      currentViewingShotId,
      onAddToLastShot,
      onAddToLastShotWithoutPosition,
    }),
    [
      selectedShotIdLocal,
      simplifiedShotOptions,
      setSelectedShotIdLocal,
      onShotChange,
      showTickForImageId,
      onShowTick,
      showTickForSecondaryImageId,
      onShowSecondaryTick,
      optimisticUnpositionedIds,
      optimisticPositionedIds,
      optimisticDeletedIds,
      onOptimisticUnpositioned,
      onOptimisticPositioned,
      addingToShotImageId,
      setAddingToShotImageId,
      addingToShotWithoutPositionImageId,
      setAddingToShotWithoutPositionImageId,
      currentViewingShotId,
      onAddToLastShot,
      onAddToLastShotWithoutPosition,
    ],
  );

  const itemMobileInteraction = useMemo<Omit<ItemMobileInteraction, 'isMobile'>>(
    () => ({
      mobileActiveImageId,
      mobilePopoverOpenImageId,
      onMobileTap,
      setMobilePopoverOpenImageId,
    }),
    [mobileActiveImageId, mobilePopoverOpenImageId, onMobileTap, setMobilePopoverOpenImageId],
  );

  const itemFeatures = useMemo<ItemFeatures>(
    () => ({
      showDelete,
      showDownload,
      showStar: showStar && typeof onToggleStar === 'function',
      showAddToShot,
      enableSingleClick,
      videosAsThumbnails,
    }),
    [
      showDelete,
      showDownload,
      showStar,
      onToggleStar,
      showAddToShot,
      enableSingleClick,
      videosAsThumbnails,
    ],
  );

  const itemActions = useMemo<ItemActions>(
    () => ({
      onOpenLightbox,
      onDelete,
      onApplySettings,
      onDownloadImage,
      onToggleStar,
      onImageClick,
      onContextMenu,
      onAddToTimeline,
      addToTimelineDisabledReason,
    }),
    [
      onOpenLightbox,
      onDelete,
      onApplySettings,
      onDownloadImage,
      onToggleStar,
      onImageClick,
      onContextMenu,
      onAddToTimeline,
      addToTimelineDisabledReason,
    ],
  );

  const itemLoading = useMemo<Omit<ItemLoading, 'shouldLoad' | 'isPriority' | 'isGalleryLoading'>>(
    () => ({
      isDeleting,
      downloadingImageId,
    }),
    [isDeleting, downloadingImageId],
  );

  const lightboxDeletingId = useMemo(
    () => resolveLightboxDeletingId(isDeleting, activeLightboxMediaId),
    [isDeleting, activeLightboxMediaId],
  );

  return {
    itemShotWorkflow,
    itemMobileInteraction,
    itemFeatures,
    itemActions,
    itemLoading,
    lightboxDeletingId,
  };
}
