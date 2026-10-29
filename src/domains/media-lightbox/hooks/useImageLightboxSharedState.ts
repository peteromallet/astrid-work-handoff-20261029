import { useCallback, useMemo } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import type {
  LightboxActionHandlers,
  LightboxFeatureFlags,
  LightboxNavigationProps,
  LightboxShotWorkflowProps,
} from '../types';
import { buildImageSharedLightboxInput } from './lightboxSharedBuilders';
import { useSharedLightboxState } from './useSharedLightboxState';
import { useAdjustedTaskDetails } from './useAdjustedTaskDetails';
import { useLightboxVariantBadges } from './useLightboxVariantBadges';
import type { ImageLightboxEnvironment } from './useImageLightboxEnvironment';

interface UseImageLightboxSharedStateProps {
  media: GenerationRow;
  onClose: () => void;
  readOnly?: boolean;
  shotId?: string;
  initialVariantId?: string;
  navigation?: LightboxNavigationProps;
  shotWorkflow?: LightboxShotWorkflowProps;
  features?: LightboxFeatureFlags;
  actions?: LightboxActionHandlers;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  taskDetailsData?: import('../types').TaskDetailsData;
}

export function useImageLightboxSharedState(
  props: UseImageLightboxSharedStateProps,
  env: ImageLightboxEnvironment,
) {
  const navigation = props.navigation;

  const handleSlotNavNext = useCallback(() => {
    navigation?.onNext?.();
  }, [navigation]);

  const handleSlotNavPrev = useCallback(() => {
    navigation?.onPrevious?.();
  }, [navigation]);

  const sharedInput = useMemo(() => buildImageSharedLightboxInput({
    props,
    env,
    handleSlotNavNext,
    handleSlotNavPrev,
  }), [
    env,
    handleSlotNavNext,
    handleSlotNavPrev,
    props,
  ]);
  const sharedState = useSharedLightboxState(sharedInput);

  const { adjustedTaskDetailsData } = useAdjustedTaskDetails({
    projectId: env.selectedProjectId,
    activeVariant: sharedState.variants.activeVariant,
    taskDetailsData: props.taskDetailsData,
    isLoadingVariants: sharedState.variants.isLoading,
    initialVariantId: props.initialVariantId,
  });

  const variantBadges = useLightboxVariantBadges({
    pendingTaskGenerationId: env.actualGenerationId,
    selectedProjectId: env.selectedProjectId,
    variants: sharedState.variants.list,
    variantFetchGenerationId: env.variantFetchGenerationId,
  });

  return {
    sharedState,
    adjustedTaskDetailsData,
    variantBadges,
    handleSlotNavNext,
    handleSlotNavPrev,
  };
}

export type ImageLightboxSharedModel = ReturnType<typeof useImageLightboxSharedState>;
