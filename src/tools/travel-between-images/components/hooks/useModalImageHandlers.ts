/**
 * useModalImageHandlers - Lightweight composition of existing mutation hooks
 * for use in VideoGenerationModal's ShotImagesEditor.
 *
 * Does NOT depend on ShotSettingsContext or ShotEditorState.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GenerationRow } from '@/domains/generation/types';
import {
  useRemoveImageFromShot,
  useAddImageToShot,
  useUpdateShotImageOrder,
} from '@/shared/hooks/shots/useShotGenerationMutations';
import { queryKeys } from '@/shared/lib/queryKeys';

export function useModalImageHandlers(
  shotId: string,
  projectId: string,
  orderedImages: GenerationRow[],
  batchVideoFrames: number,
) {
  const queryClient = useQueryClient();
  const removeImage = useRemoveImageFromShot();
  const addImage = useAddImageToShot();
  const reorderImages = useUpdateShotImageOrder();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['shotImages', shotId] });
    queryClient.invalidateQueries({ queryKey: queryKeys.segments.parents(shotId, projectId) });
  }, [queryClient, shotId, projectId]);

  const onImageReorder = useCallback((orderedIds: string[]) => {
    const updates = orderedIds.map((shotGenId, index) => {
      const img = orderedImages.find((i) => i.id === shotGenId);
      return {
        shot_id: shotId,
        generation_id: img?.generation_id ?? shotGenId,
        timeline_frame: index * batchVideoFrames,
      };
    });
    reorderImages.mutate({ shotId, projectId, updates }, { onSuccess: invalidate });
  }, [orderedImages, shotId, projectId, batchVideoFrames, reorderImages, invalidate]);

  const onImageDelete = useCallback((id: string) => {
    removeImage.mutate({ shotId, shotGenerationId: id, projectId }, { onSuccess: invalidate });
  }, [removeImage, shotId, projectId, invalidate]);

  const onBatchImageDelete = useCallback((ids: string[]) => {
    ids.forEach((id) => {
      removeImage.mutate({ shotId, shotGenerationId: id, projectId });
    });
    invalidate();
  }, [removeImage, shotId, projectId, invalidate]);

  const onGenerationDrop = useCallback(async (
    generationId: string, imageUrl: string, thumbUrl: string | undefined, targetFrame?: number,
  ) => {
    addImage.mutate({
      shot_id: shotId,
      generation_id: generationId,
      project_id: projectId,
      imageUrl,
      thumbUrl,
      timelineFrame: targetFrame ?? null,
    }, { onSuccess: invalidate });
  }, [addImage, shotId, projectId, invalidate]);

  return {
    onImageReorder,
    onImageDelete,
    onBatchImageDelete,
    onGenerationDrop,
    onBatchGenerationDrop: onGenerationDrop,
  };
}
