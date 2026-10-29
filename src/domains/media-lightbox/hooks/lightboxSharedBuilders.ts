import type { GenerationRow } from '@/domains/generation/types';
import type {
  LightboxActionHandlers,
  LightboxFeatureFlags,
  LightboxNavigationProps,
  LightboxShotWorkflowProps,
  VideoLightboxPropsWithMedia,
} from '../types';
import type { ImageLightboxEnvironment } from './useImageLightboxEnvironment';
import type { VideoLightboxEnvironment, VideoLightboxModeModel } from './videoLightbox/useVideoLightboxEnvironment';
import type { useSharedLightboxState } from './useSharedLightboxState';

type SharedLightboxInput = Parameters<typeof useSharedLightboxState>[0];

interface BuildImageSharedLightboxInputArgs {
  props: {
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
  };
  env: ImageLightboxEnvironment;
  handleSlotNavNext: () => void;
  handleSlotNavPrev: () => void;
}

export function buildImageSharedLightboxInput({
  props,
  env,
  handleSlotNavNext,
  handleSlotNavPrev,
}: BuildImageSharedLightboxInputArgs): SharedLightboxInput {
  return {
    core: {
      media: props.media,
      isVideo: false,
      selectedProjectId: env.selectedProjectId,
      isMobile: env.isMobile,
      isFormOnlyMode: false,
      onClose: props.onClose,
      readOnly: props.readOnly ?? false,
      variantFetchGenerationId: env.variantFetchGenerationId,
      initialVariantId: props.initialVariantId,
    },
    navigation: {
      showNavigation: props.navigation?.showNavigation,
      hasNext: props.navigation?.hasNext ?? false,
      hasPrevious: props.navigation?.hasPrevious ?? false,
      handleSlotNavNext,
      handleSlotNavPrev,
      swipeDisabled: props.readOnly ?? false,
    },
    shots: {
      shotId: props.shotId,
      shotWorkflow: props.shotWorkflow,
    },
    layout: {
      showTaskDetails: props.features?.showTaskDetails ?? true,
    },
    actions: {
      isCloudMode: env.isCloudMode,
      showDownload: props.features?.showDownload,
      isDownloading: env.isDownloading,
      setIsDownloading: env.setIsDownloading,
      onDelete: props.actions?.onDelete,
      isDeleting: props.actions?.isDeleting,
    },
    media: {
      effectiveImageUrl: props.media.imageUrl || props.media.location || '',
      imageDimensions: env.imageDimensions || { width: 1024, height: 1024 },
      projectAspectRatio: env.projectAspectRatio,
    },
    onOpenExternalGeneration: props.onOpenExternalGeneration,
  };
}

export function buildVideoSharedLightboxInput(params: {
  props: VideoLightboxPropsWithMedia;
  modeModel: VideoLightboxModeModel;
  env: VideoLightboxEnvironment;
}): SharedLightboxInput {
  const { props, modeModel, env } = params;
  const nav = props.navigation;
  const sw = props.shotWorkflow;
  const feat = props.features;
  const act = props.actions;
  const readOnly = props.readOnly ?? false;

  return {
    core: {
      media: props.media,
      isVideo: true,
      selectedProjectId: env.selectedProjectId,
      isMobile: env.isMobile,
      isFormOnlyMode: modeModel.isFormOnlyMode,
      onClose: props.onClose,
      readOnly,
      variantFetchGenerationId: env.variantFetchGenerationId,
      initialVariantId: props.initialVariantId,
    },
    navigation: {
      showNavigation: nav?.showNavigation ?? true,
      hasNext: modeModel.hasNext,
      hasPrevious: modeModel.hasPrevious,
      handleSlotNavNext: modeModel.handleSlotNavNext,
      handleSlotNavPrev: modeModel.handleSlotNavPrev,
      swipeDisabled: readOnly,
    },
    shots: {
      shotId: props.shotId,
      shotWorkflow: sw,
    },
    layout: {
      showTaskDetails: feat?.showTaskDetails ?? true,
    },
    actions: {
      isCloudMode: env.isCloudMode,
      showDownload: feat?.showDownload ?? true,
      isDownloading: env.isDownloading,
      setIsDownloading: env.setIsDownloading,
      onDelete: act?.onDelete,
      isDeleting: act?.isDeleting,
    },
    media: {
      effectiveImageUrl: env.effectiveImageUrl,
      imageDimensions: env.imageDimensions || { width: 1024, height: 576 },
      projectAspectRatio: env.projectAspectRatio,
    },
    onOpenExternalGeneration: props.onOpenExternalGeneration,
  };
}
