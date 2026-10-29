import { useCallback, useState, useRef, useLayoutEffect } from 'react';
import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { useTaskStatusCounts } from '@/shared/hooks/tasks/useTaskStatusCounts';
import { useIsMobile } from '@/shared/hooks/mobile';
import { extractDimensionsFromMedia } from '../../utils/dimensions';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import type { GenerationRow } from '@/domains/generation/types';
import type { SegmentSlotModeData } from '../../types';
import { usePanesStore } from '@/shared/state/panesStore';

import type { LightboxNavigationProps } from '../../types';

interface VideoLightboxModeOptions {
  segmentSlotMode?: SegmentSlotModeData;
  navigation?: LightboxNavigationProps;
}

export function useVideoLightboxMode(options: VideoLightboxModeOptions) {
  const {
    segmentSlotMode,
    navigation,
  } = options;
  const hasNextProp = navigation?.hasNext ?? false;
  const hasPreviousProp = navigation?.hasPrevious ?? false;
  const onNext = navigation?.onNext;
  const onPrevious = navigation?.onPrevious;

  const isSegmentSlotMode = !!segmentSlotMode;
  const hasSegmentVideo = isSegmentSlotMode && !!segmentSlotMode.segmentVideo;
  const isFormOnlyMode = isSegmentSlotMode && !hasSegmentVideo;

  const hasNext = isSegmentSlotMode
    ? segmentSlotMode.currentIndex < segmentSlotMode.totalPairs - 1
    : hasNextProp;

  const hasPrevious = isSegmentSlotMode
    ? segmentSlotMode.currentIndex > 0
    : hasPreviousProp;

  const handleSlotNavNext = useCallback(() => {
    if (isSegmentSlotMode) {
      segmentSlotMode.onNavigateToPair(segmentSlotMode.currentIndex + 1);
      return;
    }
    if (onNext) {
      onNext();
    }
  }, [isSegmentSlotMode, onNext, segmentSlotMode]);

  const handleSlotNavPrev = useCallback(() => {
    if (isSegmentSlotMode) {
      segmentSlotMode.onNavigateToPair(segmentSlotMode.currentIndex - 1);
      return;
    }
    if (onPrevious) {
      onPrevious();
    }
  }, [isSegmentSlotMode, onPrevious, segmentSlotMode]);

  return {
    isSegmentSlotMode,
    hasSegmentVideo,
    isFormOnlyMode,
    hasNext,
    hasPrevious,
    handleSlotNavNext,
    handleSlotNavPrev,
  };
}

export type VideoLightboxModeModel = ReturnType<typeof useVideoLightboxMode>;

interface VideoLightboxEnvironmentOptions {
  media?: GenerationRow;
  tasksPaneOpen?: boolean;
  tasksPaneWidth?: number;
  variantFetchGenerationIdOverride?: string;
  videoProps?: {
    fetchVariantsForSelf?: boolean;
  };
}

export function useVideoLightboxEnvironment(options: VideoLightboxEnvironmentOptions) {
  const { media, tasksPaneOpen, tasksPaneWidth, variantFetchGenerationIdOverride } = options;
  const fetchVariantsForSelf = options.videoProps?.fetchVariantsForSelf;

  const isMobile = useIsMobile();
  const { project, selectedProjectId } = useProjectSelectionContext();
  const projectAspectRatio = project?.aspectRatio;
  const isCloudMode = true;
  const tasksPaneOpenContext = usePanesStore((state) => state.isTasksPaneOpen);
  const tasksPaneWidthContext = usePanesStore((state) => state.tasksPaneWidth);
  const isTasksPaneLocked = usePanesStore((state) => state.isTasksPaneLocked);

  const effectiveTasksPaneOpen = tasksPaneOpen ?? tasksPaneOpenContext;
  const effectiveTasksPaneWidth = tasksPaneWidth ?? tasksPaneWidthContext;

  useTaskStatusCounts(selectedProjectId);

  const contentRef = useRef<HTMLDivElement>(null);
  const variantsSectionRef = useRef<HTMLDivElement>(null);

  const [isDownloading, setIsDownloading] = useState(false);

  const actualGenerationId = getGenerationId(media) || null;
  const variantFetchGenerationId = variantFetchGenerationIdOverride
    || (fetchVariantsForSelf
      ? actualGenerationId
      : (media?.parent_generation_id || actualGenerationId));

  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(() => {
    return media ? extractDimensionsFromMedia(media) : null;
  });

  useLayoutEffect(() => {
    if (!media) {
      return;
    }

    const dims = extractDimensionsFromMedia(media);
    if (dims) {
      setImageDimensions(dims);
    }
  }, [media]);

  const effectiveImageUrl = media?.imageUrl || media?.location || '';

  return {
    isMobile,
    selectedProjectId,
    projectAspectRatio,
    isCloudMode,
    isTasksPaneLocked,
    effectiveTasksPaneOpen,
    effectiveTasksPaneWidth,
    contentRef,
    variantsSectionRef,
    isDownloading,
    setIsDownloading,
    actualGenerationId,
    variantFetchGenerationId,
    imageDimensions,
    setImageDimensions,
    effectiveImageUrl,
  };
}

export type VideoLightboxEnvironment = ReturnType<typeof useVideoLightboxEnvironment>;
