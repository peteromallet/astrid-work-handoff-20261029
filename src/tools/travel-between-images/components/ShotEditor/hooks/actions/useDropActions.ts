import { useCallback, useRef } from 'react';
import { toast } from "@/shared/components/ui/runtime/sonner";
import { normalizeAndPresentError } from "@/shared/lib/errorHandling/runtimeError";
import { Shot } from "@/domains/generation/types";
import { useAddImageToShot } from "@/shared/hooks/shots";

interface UseDropActionsProps {
  selectedShot: Shot;
  projectId: string;
}

export const useDropActions = ({
  selectedShot,
  projectId,
}: UseDropActionsProps) => {
  const addImageToShotMutation = useAddImageToShot();

  // Stability refs - prevent callback recreation when data/mutation state changes
  const selectedShotRef = useRef(selectedShot);
  selectedShotRef.current = selectedShot;

  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const addImageToShotMutationRef = useRef(addImageToShotMutation);
  addImageToShotMutationRef.current = addImageToShotMutation;

  /**
   * Handle dropping a generation from GenerationsPane onto the timeline
   */
  const handleTimelineGenerationDrop = useCallback(async (
    generationId: string,
    imageUrl: string,
    thumbUrl: string | undefined,
    targetFrame?: number
  ) => {
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;

    if (!currentShot?.id || !currentProjectId) {
      toast.error("Cannot add generation: No shot or project selected.");
      return;
    }

    if (!generationId) {
      toast.error("Invalid generation: Missing generation ID.");
      return;
    }

    try {
      await addImageToShotMutationRef.current.mutateAsync({
        generation_id: generationId,
        shot_id: currentShot.id,
        imageUrl: imageUrl,
        thumbUrl: thumbUrl,
        timelineFrame: targetFrame,
        project_id: currentProjectId
      });
    } catch (error) {
      normalizeAndPresentError(error, { context: 'GenerationDrop', toastTitle: 'Failed to add generation' });
      throw error;
    }
  }, []);

  /**
   * Handle dropping a generation from GenerationsPane onto batch mode grid
   */
  const handleBatchGenerationDrop = useCallback(async (
    generationId: string,
    imageUrl: string,
    thumbUrl: string | undefined,
    targetFrame?: number
  ) => {
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;

    if (!currentShot?.id || !currentProjectId) {
      toast.error("Cannot add generation: No shot or project selected.");
      return;
    }

    if (!generationId) {
      toast.error("Invalid generation: Missing generation ID.");
      return;
    }

    try {
      await addImageToShotMutationRef.current.mutateAsync({
        generation_id: generationId,
        shot_id: currentShot.id,
        imageUrl: imageUrl,
        thumbUrl: thumbUrl,
        project_id: currentProjectId,
        timelineFrame: targetFrame,
      });
    } catch (error) {
      normalizeAndPresentError(error, { context: 'BatchDrop', toastTitle: 'Failed to add generation' });
      throw error;
    }
  }, []);

  return {
    handleTimelineGenerationDrop,
    handleBatchGenerationDrop,
  };
};
