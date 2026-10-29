import { useCallback } from 'react';
import { handleLightboxDownload } from '../../utils/lightboxDownload';
import { invokeLightboxDelete } from '../../utils/lightboxDelete';
import type {
  VideoLightboxSharedStateModel,
} from './useVideoLightboxController';
import type { VideoLightboxProps } from '../../types';
import type { VideoLightboxEnvironment } from './useVideoLightboxEnvironment';

interface UseVideoLightboxActionsInput {
  props: VideoLightboxProps;
  env: VideoLightboxEnvironment;
  sharedState: VideoLightboxSharedStateModel;
}

export function useVideoLightboxActions({
  props,
  env,
  sharedState,
}: UseVideoLightboxActionsInput) {
  const { media, actions, shotWorkflow, onClose } = props;

  const handleDownload = useCallback(async (): Promise<void> => {
    if (!media) {
      return;
    }

    await handleLightboxDownload({
      intendedVariantId: sharedState.intendedActiveVariantIdRef.current,
      variants: sharedState.variants.list,
      fallbackUrl: sharedState.effectiveMedia.videoUrl ?? '',
      media,
      isVideo: true,
      setIsDownloading: env.setIsDownloading,
    });
  }, [
    media,
    sharedState.intendedActiveVariantIdRef,
    sharedState.variants.list,
    sharedState.effectiveMedia.videoUrl,
    env.setIsDownloading,
  ]);

  const handleDelete = useCallback(async (): Promise<void> => {
    if (!actions?.onDelete || !media) {
      return;
    }
    await invokeLightboxDelete(actions.onDelete, media.id, 'VideoLightbox.delete');
  }, [actions, media]);

  const handleNavigateToShotFromSelector = useCallback((shot: { id: string; name: string }) => {
    if (!shotWorkflow?.onNavigateToShot) {
      return;
    }
    const minimalShot = { id: shot.id, name: shot.name, images: [], position: 0 };
    onClose();
    shotWorkflow.onNavigateToShot(minimalShot);
  }, [onClose, shotWorkflow]);

  return {
    handleDownload,
    handleDelete,
    handleNavigateToShotFromSelector,
  };
}
