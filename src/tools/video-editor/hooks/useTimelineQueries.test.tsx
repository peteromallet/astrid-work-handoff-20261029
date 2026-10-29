// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TIMELINE_REFRESH_INTERVAL_MS,
  getTimelineRefreshInterval,
  getTimelineRefreshOptions,
  useTimelineQueries,
} from '@/tools/video-editor/hooks/useTimelineQueries.ts';
import { createDefaultTimelineConfig } from '@/tools/video-editor/lib/defaults.ts';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';

/**
 * The source half of the load-error surfacing chain: a provider that rejects
 * must leave `timelineQuery.error` populated (nothing else in the shell can
 * observe the failure — `isLoading` goes false and no render throws). The sink
 * half — the shell rendering that error as a card instead of an empty editor —
 * is pinned in `TimelineEditorShellCore.test.tsx`.
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const makeProvider = (loadTimeline: DataProvider['loadTimeline']): DataProvider => ({
  persistenceEnabled: true,
  loadTimeline,
  loadAssetRegistry: async () => ({ assets: {} }),
  saveTimeline: async () => 1,
  resolveAssetUrl: async (file: string) => file,
} as unknown as DataProvider);

describe('useTimelineQueries', () => {
  it('keeps initial load pending until snapshot assets resolve even when the separate registry query lags', async () => {
    const registry = { assets: { photo: { type: 'image/png', media_id: 'sha256:photo' } } };
    const config = { ...createDefaultTimelineConfig(), clips: [
      { id: 'hold', at: 0, track: 'V1', clipType: 'hold', hold: 2, asset: 'photo' },
      { id: 'missing', at: 2, track: 'V1', clipType: 'hold', hold: 2, asset: 'absent' },
    ] };
    let releaseAsset!: (url: string) => void;
    let releaseRegistry!: (value: typeof registry) => void;
    const snapshotResolve = vi.fn(() => new Promise<string>(resolve => { releaseAsset = resolve; }));
    const mutableResolve = vi.fn(async () => { throw new Error('activeRegistry has not loaded'); });
    const onMissing = vi.fn();
    const provider = {
      ...makeProvider(async () => ({ config, configVersion: 3 }) as never),
      saveTimelineAtHead: vi.fn(),
      loadReferencedTimeline: vi.fn(async () => ({ timeline: { config, configVersion: 3 }, registry, resolveAssetUrl: snapshotResolve })),
      loadAssetRegistry: vi.fn(() => new Promise<typeof registry>(resolve => { releaseRegistry = resolve; })),
      resolveAssetUrl: mutableResolve,
    } as unknown as DataProvider;
    const { result, unmount } = renderHook(() => useTimelineQueries(provider, 'snapshot-assets', {
      resolveAssetUrl: mutableResolve, onMissing,
    }), { wrapper: createWrapper() });
    try {
      await waitFor(() => expect(snapshotResolve).toHaveBeenCalledWith('sha256:photo'));
      expect(result.current.timelineQuery.isLoading).toBe(true);
      expect(result.current.timelineQuery.data).toBeUndefined();
      expect(mutableResolve).not.toHaveBeenCalled();
      await act(async () => { releaseAsset('/objects/photo'); });
      await waitFor(() => expect(result.current.timelineQuery.isSuccess).toBe(true));
      expect(result.current.assetRegistryQuery.isLoading).toBe(true);
      const clips = result.current.timelineQuery.data!.resolvedConfig.clips;
      expect(clips[0].assetEntry?.src).toBe('/objects/photo');
      expect(clips[1].assetEntry).toBeUndefined();
      expect(onMissing).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'absent', reason: 'missing_asset' }));
      await act(async () => { releaseRegistry(registry); });
    } finally { unmount(); }
  });

  it('uses bounded Runtime polling and explicit reconnect refetch on the canonical read seam', () => {
    const runtimeProvider = makeProvider(async () => ({
      config: {},
      configVersion: 1,
    } as never));
    (runtimeProvider as DataProvider & { refreshIntervalMs: number }).refreshIntervalMs = 2_000;

    expect(getTimelineRefreshInterval(runtimeProvider)).toBe(2_000);
    expect(getTimelineRefreshOptions(runtimeProvider)).toEqual({
      refetchInterval: 2_000,
      refetchOnReconnect: true,
    });
    expect(getTimelineRefreshInterval(makeProvider(async () => ({}) as never)))
      .toBe(DEFAULT_TIMELINE_REFRESH_INTERVAL_MS);
  });

  it('refetches the canonical timeline read after reconnect', async () => {
    onlineManager.setOnline(true);
    const loadTimeline = vi.fn()
      .mockResolvedValueOnce({ config: createDefaultTimelineConfig(), configVersion: 1 } as never)
      .mockResolvedValueOnce({ config: createDefaultTimelineConfig(), configVersion: 2 } as never);
    const provider = makeProvider(loadTimeline);

    const { result } = renderHook(
      () => useTimelineQueries(provider, 'timeline-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(loadTimeline).toHaveBeenCalledTimes(1));
    await act(async () => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });

    await waitFor(() => {
      expect(loadTimeline).toHaveBeenCalledTimes(2);
      expect(result.current.timelineQuery.data?.configVersion).toBe(2);
    });
  });
  it('uses the provider head identity to avoid reusing a stale popup query cache', async () => {
    const loadTimeline = vi.fn()
      .mockResolvedValueOnce({ config: createDefaultTimelineConfig(), configVersion: 1 } as never)
      .mockResolvedValueOnce({ config: createDefaultTimelineConfig(), configVersion: 2 } as never);
    const provider = makeProvider(loadTimeline) as DataProvider & { timelineQueryIdentity: string };
    provider.timelineQueryIdentity = 'head-0';

    const { result, rerender } = renderHook(
      ({ identity }: { identity: string }) => {
        provider.timelineQueryIdentity = identity;
        return useTimelineQueries(provider, 'timeline-1');
      },
      { wrapper: createWrapper(), initialProps: { identity: 'head-0' } },
    );

    await waitFor(() => expect(result.current.timelineQuery.data?.configVersion).toBe(1));
    rerender({ identity: 'head-1' });
    await waitFor(() => {
      expect(loadTimeline).toHaveBeenCalledTimes(2);
      expect(result.current.timelineQuery.data?.configVersion).toBe(2);
    });
  });


  it('does not poll a load that failed with nothing loaded, so the error stays put', async () => {
    const loadTimeline = vi.fn(async () => { throw new Error('HTTP 500'); });
    const provider = makeProvider(loadTimeline) as DataProvider & { refreshIntervalMs: number };
    provider.refreshIntervalMs = 30;

    const { result } = renderHook(
      () => useTimelineQueries(provider, 'timeline-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.timelineQuery.isError).toBe(true));
    expect(loadTimeline).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(loadTimeline).toHaveBeenCalledTimes(1);
    expect(result.current.timelineQuery.isError).toBe(true);
    expect(result.current.timelineQuery.error).toBeInstanceOf(Error);
  });

  it('surfaces a rejected loadTimeline as timelineQuery.error', async () => {
    const failure = new Error('Astrid bridge returned a malformed timeline payload: config: expected object, received string');
    const provider = makeProvider(async () => { throw failure; });

    const { result } = renderHook(
      () => useTimelineQueries(provider, 'timeline-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.timelineQuery.error).toBe(failure);
    });
    expect(result.current.timelineQuery.isLoading).toBe(false);
    expect(result.current.timelineQuery.data).toBeUndefined();
  });
});
