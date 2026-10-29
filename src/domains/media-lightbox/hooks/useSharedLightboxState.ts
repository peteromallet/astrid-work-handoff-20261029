/**
 * useSharedLightboxState
 *
 * Shared state orchestrator for ImageLightbox and VideoLightbox.
 */

import { useCallback, useMemo } from 'react';
import { useJoinClips } from './useJoinClips';
import { useGenerationLineage } from './useGenerationLineage';
import { useLightboxNavigation } from './useLightboxNavigation';
import { useSwipeNavigation } from './useSwipeNavigation';
import { useEffectiveMedia } from './useEffectiveMedia';
import { useLayoutMode } from './useLayoutMode';
import { invokeLightboxDelete } from '../utils/lightboxDelete';
import { useSharedLightboxShotState } from './sharedLightbox/useSharedLightboxShotState';
import { useSharedLightboxVariantState } from './sharedLightbox/useSharedLightboxVariantState';
import type {
  LightboxButtonGroupProps,
  UseSharedLightboxStateInput,
  UseSharedLightboxStateReturn,
} from './types';

export type { LightboxButtonGroupProps } from './types';

export function useSharedLightboxState(input: UseSharedLightboxStateInput): UseSharedLightboxStateReturn {
  const { core, navigation: navInput, shots: shotsInput, layout: layoutInput, actions, media: mediaInput } = input;
  const { media, isVideo, selectedProjectId, isMobile, isFormOnlyMode, onClose, readOnly } = core;
  const shotWorkflow = shotsInput.shotWorkflow;

  // --- Variants ---

  const variantState = useSharedLightboxVariantState({
    media,
    variantFetchGenerationId: core.variantFetchGenerationId,
    initialVariantId: core.initialVariantId,
    isFormOnlyMode,
  });

  // --- Join clips ---

  const joinState = useJoinClips({ media, isVideo, selectedProjectId });

  // --- Lineage ---

  const lineageState = useGenerationLineage({ media, enabled: !isFormOnlyMode });

  // --- Shots ---

  const shotState = useSharedLightboxShotState({
    media,
    shotWorkflow,
    onClose,
  });

  // --- Navigation ---

  const { hasNext = false, hasPrevious = false, handleSlotNavNext, handleSlotNavPrev, swipeDisabled, showNavigation } = navInput;

  const { safeClose, activateClickShield } = useLightboxNavigation({
    onNext: handleSlotNavNext,
    onPrevious: handleSlotNavPrev,
    onClose,
  });

  const swipeNavigation = useSwipeNavigation({
    onSwipeLeft: () => {
      if (hasNext) handleSlotNavNext();
    },
    onSwipeRight: () => {
      if (hasPrevious) handleSlotNavPrev();
    },
    disabled: swipeDisabled || readOnly || !showNavigation,
    hasNext,
    hasPrevious,
    threshold: 50,
    velocityThreshold: 0.3,
  });

  // --- Effective media & layout ---

  const { effectiveVideoUrl, effectiveMediaUrl, effectiveImageDimensions } = useEffectiveMedia({
    isVideo,
    activeVariant: variantState.activeVariant,
    effectiveImageUrl: mediaInput.effectiveImageUrl,
    imageDimensions: mediaInput.imageDimensions,
    projectAspectRatio: mediaInput.projectAspectRatio,
  });

  const layout = useLayoutMode({
    isMobile,
    showTaskDetails: layoutInput.showTaskDetails ?? false,
    isVideo,
  });

  // --- Button group ---

  const { showDownload, isDownloading, onDelete, isDeleting } = actions;

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    await invokeLightboxDelete(onDelete, media.id, 'MediaLightbox.delete');
  }, [onDelete, media.id]);

  const buttonGroupProps = useMemo<LightboxButtonGroupProps>(
    () => ({
      topRight: {
        showDownload: !!showDownload,
        isDownloading,
        onDelete,
        handleDelete,
        isDeleting,
        onClose,
      },
      bottomRight: {
        handleAddToJoin: joinState.handleAddToJoin,
        isAddingToJoin: joinState.isAddingToJoin,
        addToJoinSuccess: joinState.addToJoinSuccess,
        onGoToJoin: joinState.handleGoToJoin,
      },
    }),
    [
      showDownload,
      isDownloading,
      onDelete,
      handleDelete,
      isDeleting,
      onClose,
      joinState.handleAddToJoin,
      joinState.isAddingToJoin,
      joinState.addToJoinSuccess,
      joinState.handleGoToJoin,
    ],
  );

  // --- Return ---

  return {
    variants: {
      list: variantState.variants || [],
      primaryVariant: variantState.primaryVariant,
      activeVariant: variantState.activeVariant,
      isLoading: variantState.isLoadingVariants,
      setActiveVariantId: variantState.setActiveVariantId,
      refetch: variantState.refetchVariants,
      setPrimaryVariant: variantState.setPrimaryVariant,
      deleteVariant: variantState.deleteVariant,
    },
    intendedActiveVariantIdRef: variantState.intendedActiveVariantIdRef,
    navigation: {
      safeClose,
      activateClickShield,
      swipeNavigation,
    },
    references: {
      isAddingToJoin: joinState.isAddingToJoin,
      addToJoinSuccess: joinState.addToJoinSuccess,
      handleAddToJoin: joinState.handleAddToJoin,
      handleGoToJoin: joinState.handleGoToJoin,
    },
    lineage: {
      derivedItems: lineageState.derivedItems || [],
      derivedGenerations: lineageState.derivedGenerations || [],
      derivedPage: lineageState.derivedPage,
      derivedTotalPages: lineageState.derivedTotalPages,
      paginatedDerived: lineageState.paginatedDerived || [],
      setDerivedPage: lineageState.setDerivedPage,
    },
    shots: {
      isAlreadyPositionedInSelectedShot: shotState.isAlreadyPositionedInSelectedShot,
      isAlreadyAssociatedWithoutPosition: shotState.isAlreadyAssociatedWithoutPosition,
      handleAddToShot: shotState.handleAddToShot,
      handleAddToShotWithoutPosition: shotState.handleAddToShotWithoutPosition,
    },
    effectiveMedia: {
      videoUrl: effectiveVideoUrl,
      mediaUrl: effectiveMediaUrl,
      imageDimensions: effectiveImageDimensions,
    },
    layout: {
      isTabletOrLarger: layout.isTabletOrLarger,
      isTouchLikeDevice: layout.isTouchLikeDevice,
      shouldShowSidePanel: layout.shouldShowSidePanel,
      isPortraitMode: layout.isPortraitMode,
    },
    buttonGroupProps,
  };
}
