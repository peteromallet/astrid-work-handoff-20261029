import { useState, useRef, useMemo, useLayoutEffect } from 'react';
import { shallow } from 'zustand/shallow';
import type { GenerationRow } from '@/domains/generation/types';
import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { useIsMobile } from '@/shared/hooks/mobile';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { useChangedDepsLogger } from '@/shared/lib/debug/debugRendering';
import { usePanesStore } from '@/shared/state/panesStore';
import { extractDimensionsFromMedia } from '../utils/dimensions';

interface UseImageLightboxEnvironmentProps {
  media: GenerationRow;
  tasksPaneOpen?: boolean;
  tasksPaneWidth?: number;
}

export function useImageLightboxEnvironment(props: UseImageLightboxEnvironmentProps) {
  const { media, tasksPaneOpen, tasksPaneWidth } = props;

  const isMobile = useIsMobile();
  const projectState = useProjectSelectionContext();
  const { project, selectedProjectId } = projectState;
  const projectAspectRatio = project?.aspectRatio;

  const isCloudMode = true;

  const panesState = usePanesStore((state) => ({
    isTasksPaneOpen: state.isTasksPaneOpen,
    tasksPaneWidth: state.tasksPaneWidth,
    isTasksPaneLocked: state.isTasksPaneLocked,
  }), shallow);
  const {
    isTasksPaneOpen: tasksPaneOpenContext,
    tasksPaneWidth: tasksPaneWidthContext,
    isTasksPaneLocked,
  } = panesState;

  const effectiveTasksPaneOpen = tasksPaneOpen ?? tasksPaneOpenContext;
  const effectiveTasksPaneWidth = tasksPaneWidth ?? tasksPaneWidthContext;

  const contentRef = useRef<HTMLDivElement>(null);
  const variantsSectionRef = useRef<HTMLDivElement>(null);

  const [isDownloading, setIsDownloading] = useState(false);

  const actualGenerationId = getGenerationId(media);
  const variantFetchGenerationId = media.parent_generation_id || actualGenerationId;

  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(() => {
    return extractDimensionsFromMedia(media, true);
  });

  useLayoutEffect(() => {
    const dims = extractDimensionsFromMedia(media, true);
    if (!dims) return;
    setImageDimensions((prev) => {
      if (prev && prev.width === dims.width && prev.height === dims.height) {
        return prev;
      }
      return dims;
    });
  }, [media]);

  const env = useMemo(() => ({
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
  }), [
    isMobile,
    selectedProjectId,
    projectAspectRatio,
    isCloudMode,
    isTasksPaneLocked,
    effectiveTasksPaneOpen,
    effectiveTasksPaneWidth,
    isDownloading,
    actualGenerationId,
    variantFetchGenerationId,
    imageDimensions,
  ]);

  useChangedDepsLogger('useImageLightboxEnvironment.inputs', {
    useIsMobile: isMobile,
    useProjectSelectionContext: projectState,
    usePanes: panesState,
  });
  useChangedDepsLogger('useImageLightboxEnvironment.env', { env });

  return env;
}

export type ImageLightboxEnvironment = ReturnType<typeof useImageLightboxEnvironment>;
