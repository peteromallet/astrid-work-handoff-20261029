/**
 * Hook for managing shot generations data from the preloaded shot images,
 * enriched with position management by useTimelinePositionUtils.
 */

import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useTimelinePositionUtils } from '../../../hooks/timeline/useTimelinePositionUtils';
import { useVariantBadges } from '@/shared/hooks/variants/useVariantBadges';
import { isPositioned, isVideoGeneration } from '@/shared/lib/typeGuards';
import type { GenerationRow } from '@/domains/generation/types';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';

/** Generation row with badge data merged in */
interface GenerationWithBadges extends GenerationRow {
  derivedCount?: number;
  hasUnviewedVariants?: boolean;
  unviewedVariantCount?: number;
}

interface UseShotGenerationsDataReturn {
  /** Shot generations (images) - the preloaded images */
  shotGenerations: GenerationRow[];
  /** Memoized shot generations to prevent reference changes */
  memoizedShotGenerations: GenerationRow[];
  /** Images filtered for the current mode with badge data */
  imagesWithBadges: GenerationWithBadges[];
  /** Pair prompts keyed by shot_generation.id */
  pairPrompts: Record<string, { prompt: string; negativePrompt: string }>;
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string;
  /** Update a single timeline frame position */
  updateTimelineFrame: (id: string, frame: number) => Promise<void>;
  /** Batch exchange positions */
  batchExchangePositions: (updates: Array<{ shotGenerationId: string; newFrame: number }>) => Promise<void>;
  /** Move one or more items to midpoint-distributed positions (batch reorder path) */
  moveItemsToMidpoint?: (
    draggedItemIds: string[],
    newStartIndex: number,
    allItems: Array<{ id: string; timeline_frame: number | null }>
  ) => Promise<void>;
  /** Reload positions */
  loadPositions: (options?: { silent?: boolean }) => Promise<void>;
  /** Get images filtered for a specific mode */
  getImagesForMode: (mode: 'batch' | 'timeline' | 'by-pair') => GenerationRow[];
  /** Whether we've ever had data (prevents unmounting during refetches) */
  hasEverHadData: boolean;
}

interface UseShotGenerationsDataProps {
  /** Selected shot ID */
  selectedShotId: string;
  /** Project ID */
  projectId?: string;
  /** Current generation mode */
  generationMode: 'batch' | 'timeline' | 'by-pair';
  /** Preloaded shot images; without them the editor shows no images */
  preloadedImages?: GenerationRow[];
}

const NO_GENERATIONS: GenerationRow[] = [];

export function useShotGenerationsData({
  selectedShotId,
  projectId,
  generationMode,
  preloadedImages,
}: UseShotGenerationsDataProps): UseShotGenerationsDataReturn {
  const shotGenerations = preloadedImages ?? NO_GENERATIONS;

  const utilsData = useTimelinePositionUtils({
    shotId: selectedShotId,
    generations: shotGenerations,
    projectId: projectId,
  });

  // BOTH modes show only positioned non-video images
  const getImagesForMode = useCallback((_mode: 'batch' | 'timeline' | 'by-pair'): GenerationRow[] => (
    shotGenerations
      .filter(img => isPositioned(img) && !isVideoGeneration(img))
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0))
  ), [shotGenerations]);

  // Memoize shotGenerations to prevent reference changes
  const memoizedShotGenerations = useMemo(() => shotGenerations, [shotGenerations]);

  // Track if we've ever had data to prevent unmounting during refetches
  const hasEverHadDataRef = useRef(false);
  if (memoizedShotGenerations.length > 0) {
    hasEverHadDataRef.current = true;
  }

  // Reset when shot changes
  useEffect(() => {
    hasEverHadDataRef.current = memoizedShotGenerations.length > 0;
  }, [selectedShotId, memoizedShotGenerations.length]);

  // Memoize images for the current mode
  const images = useMemo(() => {
    return getImagesForMode(generationMode);
  }, [getImagesForMode, generationMode]);

  // Extract generation IDs for variant badge fetching
  const generationIds = useMemo(() =>
    images.map((img) => getGenerationId(img)).filter(Boolean) as string[],
    [images]
  );

  // Lazy-load variant badge data
  const { getBadgeData, isLoading: isBadgeDataLoading } = useVariantBadges(generationIds);

  // Merge badge data with images
  const imagesWithBadges = useMemo(() => {
    // Don't merge badge data while loading - prevents showing "0" badges
    if (isBadgeDataLoading) {
      return images;
    }
    return images.map((img): GenerationWithBadges => {
      const generationId = getGenerationId(img);
      if (!generationId) return img;
      const badgeData = getBadgeData(generationId);
      return {
        ...img,
        derivedCount: badgeData.derivedCount,
        hasUnviewedVariants: badgeData.hasUnviewedVariants,
        unviewedVariantCount: badgeData.unviewedVariantCount,
      };
    });
  }, [images, getBadgeData, isBadgeDataLoading]);

  return {
    shotGenerations,
    memoizedShotGenerations,
    imagesWithBadges,
    pairPrompts: utilsData.pairPrompts as Record<string, { prompt: string; negativePrompt: string }>,
    isLoading: utilsData.isLoading,
    error: utilsData.error ? utilsData.error.message : '',
    updateTimelineFrame: utilsData.updateTimelineFrame,
    batchExchangePositions: utilsData.batchExchangePositions,
    moveItemsToMidpoint: utilsData.moveItemsToMidpoint,
    loadPositions: async (options?: { silent?: boolean }) => {
      await utilsData.loadPositions({ silent: options?.silent });
    },
    getImagesForMode,
    hasEverHadData: hasEverHadDataRef.current,
  };
}
