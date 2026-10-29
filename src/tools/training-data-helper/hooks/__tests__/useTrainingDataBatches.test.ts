import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTrainingDataBatches } from '../useTrainingDataBatches';
import { CloudBackendUnavailableError } from '@/shared/lib/cloudBackend';

describe('useTrainingDataBatches', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with no batches and no selection', () => {
    const { result } = renderHook(() => useTrainingDataBatches());

    expect(result.current.batches).toEqual([]);
    expect(result.current.selectedBatchId).toBeNull();
  });

  it('setSelectedBatchId updates the selected batch', () => {
    const { result } = renderHook(() => useTrainingDataBatches());

    act(() => {
      result.current.setSelectedBatchId('batch-2');
    });

    expect(result.current.selectedBatchId).toBe('batch-2');
  });

  it('create, update and delete need the cloud backend and send no request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useTrainingDataBatches());

    await expect(result.current.createBatch('Batch', 'Description')).rejects.toBeInstanceOf(CloudBackendUnavailableError);
    await expect(result.current.updateBatch('batch-1', { name: 'Renamed' })).rejects.toBeInstanceOf(CloudBackendUnavailableError);
    await expect(result.current.deleteBatch('batch-1')).rejects.toBeInstanceOf(CloudBackendUnavailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
