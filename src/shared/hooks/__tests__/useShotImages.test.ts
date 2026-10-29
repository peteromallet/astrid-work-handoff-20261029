import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import { generationQueryKeys } from '@/shared/lib/queryKeys/generations';
import { useShotImages, usePrimeShotImagesCache } from '@/shared/hooks/shots/useShotImages';

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const images = [
  { id: 'sg-1', generation_id: 'gen-1', timeline_frame: 0 },
  { id: 'sg-2', generation_id: 'gen-2', timeline_frame: 50 },
] as unknown as GenerationRow[];

describe('useShotImages', () => {
  it('is idle when shotId is null', () => {
    const { result } = renderHook(() => useShotImages(null), {
      wrapper: createWrapper(createClient()),
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(false);
  });

  it('never fetches: an unprimed shot has no data and no error', () => {
    const { result } = renderHook(() => useShotImages('shot-1'), {
      wrapper: createWrapper(createClient()),
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('observes images already in the shot cache', () => {
    const queryClient = createClient();
    queryClient.setQueryData(generationQueryKeys.byShot('shot-1'), images);

    const { result } = renderHook(() => useShotImages('shot-1'), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.data).toEqual(images);
    expect(result.current.isFetching).toBe(false);
  });
});

describe('usePrimeShotImagesCache', () => {
  it('seeds an empty shot cache from context images', async () => {
    const queryClient = createClient();

    renderHook(() => usePrimeShotImagesCache('shot-1', images), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(generationQueryKeys.byShot('shot-1'))).toEqual(images);
    });
  });

  it('keeps existing cached images', () => {
    const queryClient = createClient();
    const cached = [images[0]];
    queryClient.setQueryData(generationQueryKeys.byShot('shot-1'), cached);

    renderHook(() => usePrimeShotImagesCache('shot-1', images), {
      wrapper: createWrapper(queryClient),
    });

    expect(queryClient.getQueryData(generationQueryKeys.byShot('shot-1'))).toEqual(cached);
  });

  it('does nothing without a shot or without context images', () => {
    const queryClient = createClient();

    renderHook(() => usePrimeShotImagesCache(null, images), { wrapper: createWrapper(queryClient) });
    renderHook(() => usePrimeShotImagesCache('shot-1', []), { wrapper: createWrapper(queryClient) });

    expect(queryClient.getQueryData(generationQueryKeys.byShot('shot-1'))).toBeUndefined();
  });
});
