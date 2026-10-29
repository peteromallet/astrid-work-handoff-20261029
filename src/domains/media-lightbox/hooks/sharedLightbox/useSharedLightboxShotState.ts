import { useMemo } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import type { LightboxShotWorkflowProps } from '../../types';
import { useShotPositioning } from '../useShotPositioning';

interface UseSharedLightboxShotStateInput {
  media: GenerationRow;
  shotWorkflow?: LightboxShotWorkflowProps;
  onClose: () => void;
}

export function useSharedLightboxShotState(input: UseSharedLightboxShotStateInput) {
  const { media, shotWorkflow, onClose } = input;
  const {
    allShots,
    onNavigateToShot,
    selectedShotId,
    positionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    onAddToShot,
    onAddToShotWithoutPosition,
    onShowTick,
    onShowSecondaryTick,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
  } = shotWorkflow ?? {};

  const computedPositionedInSelectedShot = useMemo(
    () => (typeof positionedInSelectedShot === 'boolean' ? positionedInSelectedShot : undefined),
    [positionedInSelectedShot],
  );

  const {
    isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition,
    handleAddToShot,
    handleAddToShotWithoutPosition,
  } = useShotPositioning({
    media,
    selectedShotId,
    allShots: allShots || [],
    positionedInSelectedShot: computedPositionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    onNavigateToShot,
    onClose,
    onAddToShot,
    onAddToShotWithoutPosition,
    onShowTick,
    onShowSecondaryTick,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
  });

  return {
    selectedShotId,
    isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition,
    handleAddToShot,
    handleAddToShotWithoutPosition,
  };
}
