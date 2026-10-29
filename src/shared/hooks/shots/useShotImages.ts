/**
 * Shot-scoped image cache. Local Astrid shots supply their images through the
 * local timeline adapter, which primes this cache; nothing is fetched here.
 */

import React from 'react';
import { skipToken, useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { GenerationRow } from '@/domains/generation/types';
import { QUERY_PRESETS } from '@/shared/lib/query/queryDefaults';
import { generationQueryKeys } from '@/shared/lib/queryKeys/generations';

/** Observes the cached images of a shot (positioned and unpositioned). */
export const useShotImages = (
  shotId: string | null,
): UseQueryResult<GenerationRow[]> => {
  const stableShotId = React.useMemo(() => shotId, [shotId]);

  return useQuery<GenerationRow[], Error>({
    queryKey: generationQueryKeys.byShot(stableShotId!),
    // No fetcher: the cache is primed by usePrimeShotImagesCache.
    enabled: false,
    queryFn: skipToken,
    ...QUERY_PRESETS.realtimeBacked,
  });
};

/** Seeds the shot-generations cache from ShotsContext for instant display on shot select. */
export const usePrimeShotImagesCache = (
  shotId: string | null,
  contextImages: GenerationRow[] | undefined
) => {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!shotId || !contextImages || contextImages.length === 0) return;

    const existingData = queryClient.getQueryData<GenerationRow[]>(generationQueryKeys.byShot(shotId));
    if (existingData && existingData.length > 0) return;

    // Prime the cache with context data
    queryClient.setQueryData(generationQueryKeys.byShot(shotId), contextImages);
  }, [shotId, contextImages, queryClient]);
};
