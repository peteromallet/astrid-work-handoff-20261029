/**
 * useShotActions - Shot manipulation callbacks for ShotEditor
 *
 * Extracted to reduce ShotEditor size. Handles:
 * - Shot navigation (handleShotChange)
 * - Add to shot operations (handleAddToShot, handleAddToShotWithoutPosition)
 * - Generations pane integration (openUnpositionedGenerationsPane)
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { shotQueryKeys } from '@/shared/lib/queryKeys/shots';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { GenerationRow, Shot } from '@/domains/generation/types';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import type { AddImageToShotVariables } from '@/shared/hooks/shots/addImageToShotHelpers';
import { dispatchAppEvent } from '@/shared/lib/typedEvents';

interface AddToShotParams {
  shot_id: string;
  generation_id: string;
  imageUrl?: string;
  thumbUrl?: string;
  timelineFrame?: number;
  project_id: string;
}

interface UseShotActionsOptions {
  // Refs for stable access
  projectIdRef: React.MutableRefObject<string>;
  selectedShotRef: React.MutableRefObject<Shot | undefined>;
  allShotImagesRef: React.MutableRefObject<GenerationRow[]>;
  addToShotMutationRef: React.MutableRefObject<(params: AddImageToShotVariables) => Promise<unknown>>;
  addToShotWithoutPositionMutationRef: React.MutableRefObject<(params: { shot_id: string; generation_id: string; project_id: string }) => Promise<unknown>>;
  setIsGenerationsPaneLockedRef: React.MutableRefObject<(locked: boolean) => void>;

  // Direct dependencies
  shots: Shot[] | undefined;
  navigateToShot: (shot: Shot, options?: { scrollToTop?: boolean; isNewlyCreated?: boolean }) => void;
  setCurrentShotId: (id: string) => void;
  updateGenerationsPaneSettings: (settings: Record<string, unknown>) => void;
  isMobile: boolean;
  selectedShot: Shot | undefined;
}

export function useShotActions({
  projectIdRef,
  selectedShotRef,
  allShotImagesRef,
  addToShotMutationRef,
  addToShotWithoutPositionMutationRef,
  setIsGenerationsPaneLockedRef,
  shots,
  navigateToShot,
  setCurrentShotId,
  updateGenerationsPaneSettings,
  isMobile,
  selectedShot,
}: UseShotActionsOptions) {
  const queryClient = useQueryClient();

  // Opens the Generations pane focused on un-positioned images for the current shot
  const openUnpositionedGenerationsPane = useCallback(() => {
    const shotId = selectedShotRef.current?.id;

    if (shotId) {
      updateGenerationsPaneSettings({
        selectedShotFilter: shotId,
        excludePositioned: true,
      });
    }

    if (isMobile) {
      dispatchAppEvent('openGenerationsPane');
    } else {
      setIsGenerationsPaneLockedRef.current(true);
    }
  }, [isMobile, updateGenerationsPaneSettings, selectedShotRef, setIsGenerationsPaneLockedRef]);

  const handleShotChange = useCallback((shotId: string) => {
    const shot = shots?.find(s => s.id === shotId);
    if (shot) {
      navigateToShot(shot, { scrollToTop: true, isNewlyCreated: true });
    } else {
      queryClient.refetchQueries({ queryKey: shotQueryKeys.all }).then(() => {
        const refreshedShots = queryClient.getQueryData<typeof shots>(shotQueryKeys.all);
        const refreshedShot = refreshedShots?.find((s) => s.id === shotId);
        if (refreshedShot) {
          navigateToShot(refreshedShot, { scrollToTop: true, isNewlyCreated: true });
        } else {
          setCurrentShotId(shotId);
        }
      });
    }
  }, [shots, navigateToShot, setCurrentShotId, queryClient]);

  const handleAddToShot = useCallback(async (shotId: string, generationId: string, position?: number) => {
    const shouldAutoPosition = position === undefined || position === 0 || position === -1;

    await addToShotMutationRef.current({
      shot_id: shotId,
      generation_id: generationId,
      timelineFrame: shouldAutoPosition ? undefined : position,
      project_id: projectIdRef.current
    });
  }, [addToShotMutationRef, projectIdRef]);

  const handleAddToShotWithoutPosition = useCallback(async (shotId: string, generationId: string) => {

    try {
      await addToShotWithoutPositionMutationRef.current({
        shot_id: shotId,
        generation_id: generationId,
        project_id: projectIdRef.current
      });
      return true;
    } catch (error) {
      normalizeAndPresentError(error, { context: 'AddWithoutPosDebug', showToast: false });
      throw error;
    }
  }, [addToShotWithoutPositionMutationRef, projectIdRef]);

  return {
    openUnpositionedGenerationsPane,
    handleShotChange,
    handleAddToShot,
    handleAddToShotWithoutPosition,
  };
}
