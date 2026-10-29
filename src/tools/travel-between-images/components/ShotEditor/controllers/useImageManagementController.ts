import type { MutableRefObject } from 'react';
import type { GenerationRow, Shot } from '@/domains/generation/types';
import { useImageManagement } from '../hooks/editor-state/useImageManagement';

interface UseImageManagementControllerParams {
  selectedShotRef: MutableRefObject<Shot | undefined>;
  projectIdRef: MutableRefObject<string | null>;
  allShotImagesRef: MutableRefObject<GenerationRow[]>;
  batchVideoFramesRef: MutableRefObject<number>;
  updateShotImageOrderMutation: ReturnType<typeof import('@/shared/hooks/shots').useUpdateShotImageOrder>;
  actionsRef: MutableRefObject<{
    setPendingFramePositions: (value: Map<string, number>) => void;
  }>;
  pendingFramePositions: Map<string, number>;
}

export function useImageManagementController({
  selectedShotRef,
  projectIdRef,
  allShotImagesRef,
  batchVideoFramesRef,
  updateShotImageOrderMutation,
  actionsRef,
  pendingFramePositions,
}: UseImageManagementControllerParams) {
  const {
    handleReorderImagesInShot,
    handlePendingPositionApplied,
  } = useImageManagement({
    selectedShotRef,
    projectIdRef,
    allShotImagesRef,
    batchVideoFramesRef,
    updateShotImageOrderMutation,
    actionsRef,
    pendingFramePositions,
  });

  return {
    handleReorderImagesInShot,
    handlePendingPositionApplied,
  };
}
