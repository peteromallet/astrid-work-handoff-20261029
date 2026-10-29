import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTrainingData } from '../useTrainingData';
import { CloudBackendUnavailableError } from '@/shared/lib/cloudBackend';

describe('useTrainingData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts empty and reports the missing backend once mounted', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useTrainingData());

    expect(result.current.videos).toEqual([]);
    expect(result.current.segments).toEqual([]);
    expect(result.current.batches).toEqual([]);
    await waitFor(() => expect(result.current.cloudBackendUnavailable).toBe(true));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('segment and video operations need the cloud backend', async () => {
    const { result } = renderHook(() => useTrainingData());

    await expect(result.current.createSegment('video-1', 0, 1000, 'segment')).rejects.toBeInstanceOf(CloudBackendUnavailableError);
    await expect(result.current.updateSegment('segment-1', { description: 'new' })).rejects.toBeInstanceOf(CloudBackendUnavailableError);
    await expect(result.current.deleteSegment('segment-1')).rejects.toBeInstanceOf(CloudBackendUnavailableError);
    await expect(result.current.deleteVideo('video-1')).rejects.toBeInstanceOf(CloudBackendUnavailableError);
  });

  it('exposes the batch, upload and video URL surfaces', () => {
    const { result } = renderHook(() => useTrainingData());

    expect(typeof result.current.createBatch).toBe('function');
    expect(typeof result.current.updateBatch).toBe('function');
    expect(typeof result.current.deleteBatch).toBe('function');
    expect(typeof result.current.setSelectedBatchId).toBe('function');
    expect(typeof result.current.uploadVideo).toBe('function');
    expect(typeof result.current.uploadVideosWithSplitModes).toBe('function');
    expect(result.current.getVideoUrl).toBeTypeOf('function');
  });
});
