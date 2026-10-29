import { useAdjustedTaskDetails } from '../useAdjustedTaskDetails';
import { useLightboxVariantBadges } from '../useLightboxVariantBadges';
import { buildVideoSharedLightboxInput } from '../lightboxSharedBuilders';
import { useSharedLightboxState } from '../useSharedLightboxState';
import type { VideoLightboxEnvironment, VideoLightboxModeModel } from './useVideoLightboxEnvironment';
import type { VideoLightboxPropsWithMedia } from '../../types';

export function useVideoLightboxSharedState(
  props: VideoLightboxPropsWithMedia,
  modeModel: VideoLightboxModeModel,
  env: VideoLightboxEnvironment,
) {
  const input = buildVideoSharedLightboxInput({ props, modeModel, env });
  return useSharedLightboxState(input);
}

export function useVideoLightboxInfo(
  props: VideoLightboxPropsWithMedia,
  env: VideoLightboxEnvironment,
  sharedState: ReturnType<typeof useVideoLightboxSharedState>,
) {
  const { adjustedTaskDetailsData } = useAdjustedTaskDetails({
    projectId: env.selectedProjectId ?? null,
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
    adjustedTaskDetailsData,
    variantBadges,
  };
}

export type VideoLightboxSharedStateModel = ReturnType<typeof useVideoLightboxSharedState>;
export type VideoLightboxInfoModel = ReturnType<typeof useVideoLightboxInfo>;
