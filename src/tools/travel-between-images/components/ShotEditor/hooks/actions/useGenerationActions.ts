import { useMemo } from 'react';
import { GenerationRow, Shot } from "@/domains/generation/types";
import { useDeleteActions } from './useDeleteActions';
import { useDropActions } from './useDropActions';

interface UseGenerationActionsProps {
  selectedShot: Shot;
  projectId: string;
  orderedShotImages: GenerationRow[];
}

/**
 * Composition hook that combines all generation action sub-hooks.
 *
 * Sub-hooks:
 * - useDeleteActions: handleDeleteImageFromShot, handleBatchDeleteImages
 * - useDropActions: handleTimelineGenerationDrop, handleBatchGenerationDrop
 */
export const useGenerationActions = ({
  selectedShot,
  projectId,
  orderedShotImages,
}: UseGenerationActionsProps) => {
  const { handleDeleteImageFromShot, handleBatchDeleteImages } = useDeleteActions({
    selectedShot,
    projectId,
    orderedShotImages,
  });

  const {
    handleTimelineGenerationDrop,
    handleBatchGenerationDrop,
  } = useDropActions({
    selectedShot,
    projectId,
  });

  // Memoize the return object to prevent callback instability in parent components.
  // All sub-hook callbacks have empty dependency arrays and use refs internally.
  return useMemo(() => ({
    handleDeleteImageFromShot,
    handleBatchDeleteImages,
    handleTimelineGenerationDrop,
    handleBatchGenerationDrop,
  }), [
    handleDeleteImageFromShot,
    handleBatchDeleteImages,
    handleTimelineGenerationDrop,
    handleBatchGenerationDrop,
  ]);
};
