import { useOutputSelection } from '../hooks/video/useOutputSelection';
import { useSegmentOutputsForShot } from '@/shared/hooks/segments';
import { useEnsureSelectedOutput } from '../hooks/video/useEnsureSelectedOutput';
import type { GenerationRow, Shot } from '@/domains/generation/types';

interface UseOutputControllerParams {
  selectedProjectId: string | null;
  selectedShotId: string;
  selectedShot: Shot | null;
  timelineImages: GenerationRow[];
}

export function useOutputController({
  selectedProjectId,
  selectedShotId,
  selectedShot,
  timelineImages,
}: UseOutputControllerParams) {
  const {
    selectedOutputId,
    setSelectedOutputId,
    isReady: outputSelectionReady,
  } = useOutputSelection({
    projectId: selectedProjectId ?? undefined,
    shotId: selectedShot?.id,
  });

  const {
    segmentSlots: joinSegmentSlots,
    selectedParent: joinSelectedParent,
    parentGenerations,
    segmentProgress,
  } = useSegmentOutputsForShot(
    selectedShotId,
    undefined, // localShotGenPositions not needed here
    outputSelectionReady ? selectedOutputId : undefined,
    outputSelectionReady ? setSelectedOutputId : undefined,
    // Local Astrid shots already contain the complete document-derived image
    // set. Supplying it prevents the legacy segment/final-video readers from
    // issuing their own reads while the established layout is mounted.
    timelineImages,
    timelineImages.at(-1)?.id, // trailingShotGenId: allow trailing segment videos to show
  );

  useEnsureSelectedOutput({
    outputSelectionReady,
    parentGenerations,
    selectedOutputId,
    setSelectedOutputId,
  });

  return {
    selectedOutputId,
    setSelectedOutputId,
    outputSelectionReady,
    joinSegmentSlots,
    joinSelectedParent,
    parentGenerations,
    segmentProgress,
  };
}
