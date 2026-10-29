import { useCallback } from 'react';
import type { RefObject } from 'react';
import { useTapToMove } from '../drag/useTapToMove';

interface ImageDropInterceptorArgs {
  files: File[];
  targetFrame?: number;
  handles?: Array<FileSystemFileHandle | null>;
  onFileDrop?: (files: File[], targetFrame?: number, handles?: Array<FileSystemFileHandle | null>) => Promise<void>;
  setPendingDropFrame: (frame: number | null) => void;
}

interface GenerationDropInterceptorArgs {
  generationId: string;
  imageUrl: string;
  thumbUrl: string | undefined;
  targetFrame?: number;
  onGenerationDrop?: (
    generationId: string,
    imageUrl: string,
    thumbUrl: string | undefined,
    targetFrame?: number,
  ) => Promise<void>;
  setPendingDropFrame: (frame: number | null) => void;
  setIsInternalDropProcessing: (value: boolean) => void;
}

interface UseTimelineOrchestratorActionsInput {
  enableTapToMove: boolean;
  framePositions: Map<string, number>;
  setFramePositions: (positions: Map<string, number>) => Promise<void>;
  fullMin: number;
  fullMax: number;
  fullRange: number;
  containerWidth: number;
  selectedIds: string[];
  clearSelection: () => void;
  containerRef: RefObject<HTMLDivElement>;
  onFileDrop?: (files: File[], targetFrame?: number, handles?: Array<FileSystemFileHandle | null>) => Promise<void>;
  setPendingDropFrame: (frame: number | null) => void;
  onGenerationDrop?: (
    generationId: string,
    imageUrl: string,
    thumbUrl: string | undefined,
    targetFrame?: number,
  ) => Promise<void>;
  setIsInternalDropProcessing: (value: boolean) => void;
  maxFrameLimit?: number;
}

interface TimelineOrchestratorActionsResult {
  handleImageDropInterceptor: (files: File[], targetFrame?: number, handles?: Array<FileSystemFileHandle | null>) => Promise<void>;
  handleGenerationDropInterceptor: (
    generationId: string,
    imageUrl: string,
    thumbUrl: string | undefined,
    targetFrame?: number,
  ) => Promise<void>;
  handleTapToMoveAction: (imageId: string, targetFrame: number) => Promise<void>;
  handleTapToMoveMultiAction: (imageIds: string[], targetFrame: number) => Promise<void>;
  handleTimelineTapToMove: (clientX: number) => void;
}

export async function runImageDropInterceptor({
  files,
  targetFrame,
  handles,
  onFileDrop,
  setPendingDropFrame,
}: ImageDropInterceptorArgs): Promise<void> {
  if (targetFrame !== undefined) {
    setPendingDropFrame(targetFrame);
  }
  if (onFileDrop) {
    await onFileDrop(files, targetFrame, handles);
  }
}

export async function runGenerationDropInterceptor({
  generationId,
  imageUrl,
  thumbUrl,
  targetFrame,
  onGenerationDrop,
  setPendingDropFrame,
  setIsInternalDropProcessing,
}: GenerationDropInterceptorArgs): Promise<void> {
  if (targetFrame !== undefined) {
    setPendingDropFrame(targetFrame);
    setIsInternalDropProcessing(true);
  }
  try {
    if (onGenerationDrop) {
      await onGenerationDrop(generationId, imageUrl, thumbUrl, targetFrame);
    }
  } finally {
    setIsInternalDropProcessing(false);
    setPendingDropFrame(null);
  }
}

export function useTimelineOrchestratorActions({
  enableTapToMove,
  framePositions,
  setFramePositions,
  fullMin,
  fullMax,
  fullRange,
  containerWidth,
  selectedIds,
  clearSelection,
  containerRef,
  onFileDrop,
  setPendingDropFrame,
  onGenerationDrop,
  setIsInternalDropProcessing,
  maxFrameLimit,
}: UseTimelineOrchestratorActionsInput): TimelineOrchestratorActionsResult {
  const handleImageDropInterceptor = useCallback(async (files: File[], targetFrame?: number, handles?: Array<FileSystemFileHandle | null>) => {
    await runImageDropInterceptor({
      files,
      targetFrame,
      handles,
      onFileDrop,
      setPendingDropFrame,
    });
  }, [onFileDrop, setPendingDropFrame]);

  const handleGenerationDropInterceptor = useCallback(async (
    generationId: string,
    imageUrl: string,
    thumbUrl: string | undefined,
    targetFrame?: number,
  ) => {
    await runGenerationDropInterceptor({
      generationId,
      imageUrl,
      thumbUrl,
      targetFrame,
      onGenerationDrop,
      setPendingDropFrame,
      setIsInternalDropProcessing,
    });
  }, [onGenerationDrop, setIsInternalDropProcessing, setPendingDropFrame]);

  const {
    handleTapToMoveAction,
    handleTapToMoveMultiAction,
    handleTimelineTapToMove,
  } = useTapToMove({
    enableTapToMove,
    framePositions,
    setFramePositions,
    fullMin,
    fullMax,
    fullRange,
    containerWidth,
    selectedIds,
    clearSelection,
    containerRef,
    maxFrameLimit,
  });

  return {
    handleImageDropInterceptor,
    handleGenerationDropInterceptor,
    handleTapToMoveAction,
    handleTapToMoveMultiAction,
    handleTimelineTapToMove,
  };
}
