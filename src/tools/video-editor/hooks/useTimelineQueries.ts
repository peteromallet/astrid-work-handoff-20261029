import { useQuery } from '@tanstack/react-query';
import { loadTimelineJsonFromProvider } from '@/tools/video-editor/lib/timeline-data.ts';
import { assetRegistryQueryKey, timelineQueryKey } from '@/tools/video-editor/hooks/useTimeline.ts';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';
import type { AssetResolver } from '@/tools/video-editor/data/AssetResolver.ts';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';

export const DEFAULT_TIMELINE_REFRESH_INTERVAL_MS = 30_000;

type RefreshableDataProvider = DataProvider & {
  readonly refreshIntervalMs?: number;
  readonly timelineQueryIdentity?: string;
};

/**
 * Runtime document events do not currently have a public cursor API. The
 * versioned timeline read is therefore the canonical catch-up mechanism;
 * reconnect refetches it and usePollSync gates adoption by configVersion.
 */
export function getTimelineRefreshInterval(provider: DataProvider): number {
  const candidate = (provider as RefreshableDataProvider).refreshIntervalMs;
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
    ? candidate
    : DEFAULT_TIMELINE_REFRESH_INTERVAL_MS;
}

export function getTimelineRefreshOptions(provider: DataProvider) {
  return {
    refetchInterval: getTimelineRefreshInterval(provider),
    refetchOnReconnect: true,
  } as const;
}

/**
 * The poll only catches a loaded timeline up with the head. A read that failed with nothing loaded is not polled: TanStack v5
 * resets an errored query with no data to pending when a fetch starts, so a timer would blink the load-error card away and
 * retry in a loop. That failure waits for the person (Try again) or for Astrid answering again (the card retries once).
 */
const pollOnlyLoaded = (interval: number) => (query: { state: { status: string; data: unknown } }) =>
  query.state.status === 'error' && query.state.data === undefined ? false : interval;

export function useTimelineQueries(
  provider: DataProvider,
  timelineId: string,
  resolveAssetUrl?: ((file: string) => Promise<string>) | AssetResolver,
  initialData?: TimelineData,
) {
  const refreshOptions = getTimelineRefreshOptions(provider);
  const queryIdentity = (provider as RefreshableDataProvider).timelineQueryIdentity;
  const timelineKey = queryIdentity === undefined
    ? timelineQueryKey(timelineId)
    : [...timelineQueryKey(timelineId), queryIdentity] as const;
  const timelineQuery = useQuery({
    queryKey: timelineKey,
    enabled: Boolean(timelineId),
    queryFn: () => typeof resolveAssetUrl === 'object' && resolveAssetUrl !== null
      ? loadTimelineJsonFromProvider(provider, resolveAssetUrl, timelineId, undefined, true)
      : loadTimelineJsonFromProvider(provider, timelineId, resolveAssetUrl, undefined, true),
    ...(initialData ? { initialData } : {}),
    ...refreshOptions,
    refetchInterval: pollOnlyLoaded(refreshOptions.refetchInterval),
  });

  const assetRegistryKey = queryIdentity === undefined
    ? assetRegistryQueryKey(timelineId)
    : [...assetRegistryQueryKey(timelineId), queryIdentity] as const;
  const assetRegistryQuery = useQuery({
    queryKey: assetRegistryKey,
    enabled: Boolean(timelineId),
    queryFn: () => provider.loadAssetRegistry(timelineId, { poll: true }),
    ...(initialData ? { initialData: initialData.registry } : {}),
    ...refreshOptions,
    refetchInterval: pollOnlyLoaded(refreshOptions.refetchInterval),
  });

  return {
    timelineQuery,
    assetRegistryQuery,
  };
}
