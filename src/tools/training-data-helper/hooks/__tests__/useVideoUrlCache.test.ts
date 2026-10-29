import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useVideoUrlCache } from '../useVideoUrlCache';
import { CloudBackendUnavailableError } from '@/shared/lib/cloudBackend';
import type { TrainingDataVideo } from '../types';

function createVideo(id: string): TrainingDataVideo {
  return {
    id,
    originalFilename: `${id}.mp4`,
    storageLocation: `path/${id}.mp4`,
    duration: 60,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: null,
    userId: 'user-1',
    batchId: 'batch-1',
  };
}

describe('useVideoUrlCache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an empty URL for every video', () => {
    const videos = [createVideo('v1')];
    const { result } = renderHook(() => useVideoUrlCache(videos, vi.fn()));

    expect(result.current.getVideoUrl(videos[0])).toBe('');
  });

  it('asks for the cloud backend once videos need signed URLs, without sending a request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const attempt = vi.fn(async (operation: () => void) => {
      try {
        operation();
      } catch (error) {
        return error;
      }
    });

    renderHook(() => useVideoUrlCache([createVideo('v1')], attempt));

    await waitFor(() => expect(attempt).toHaveBeenCalledTimes(1));
    await expect(attempt.mock.results[0].value).resolves.toBeInstanceOf(CloudBackendUnavailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not ask for the backend when there are no videos', () => {
    const attempt = vi.fn();
    renderHook(() => useVideoUrlCache([], attempt));

    expect(attempt).not.toHaveBeenCalled();
  });
});
