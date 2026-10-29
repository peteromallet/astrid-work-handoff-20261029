import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTrainingDataUpload } from '../useTrainingDataUpload';
import { CloudBackendUnavailableError } from '@/shared/lib/cloudBackend';

describe('useTrainingDataUpload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is never uploading', () => {
    const { result } = renderHook(() => useTrainingDataUpload());

    expect(result.current.isUploading).toBe(false);
  });

  it('uploads need the cloud backend and send no request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useTrainingDataUpload());
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });

    await expect(result.current.uploadVideo(file)).rejects.toBeInstanceOf(CloudBackendUnavailableError);
    await expect(
      result.current.uploadVideosWithSplitModes([{ file, splitMode: 'take-all' }]),
    ).rejects.toBeInstanceOf(CloudBackendUnavailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
