// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBatchActions } from './useBatchActions';

const normalizeAndPresentErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => normalizeAndPresentErrorMock(...args),
}));

const batch = {
  id: 'batch-1',
  userId: 'user-1',
  name: 'Existing Batch',
  description: 'Existing description',
  metadata: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: null,
};

describe('useBatchActions', () => {
  beforeEach(() => {
    normalizeAndPresentErrorMock.mockReset();
  });

  it('loads a batch into edit state and trims updates before saving', async () => {
    const onUpdateBatch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBatchActions({
      onUpdateBatch,
      onDeleteBatch: vi.fn(),
    }));

    act(() => {
      result.current.handleEditBatch(batch);
      result.current.setEditName('  Updated Batch  ');
      result.current.setEditDescription('  Updated description  ');
    });

    await act(async () => {
      await result.current.handleUpdateBatch();
    });

    expect(onUpdateBatch).toHaveBeenCalledWith('batch-1', {
      name: 'Updated Batch',
      description: 'Updated description',
    });
    expect(result.current.editingBatch).toBeNull();
    expect(result.current.editName).toBe('');
    expect(result.current.editDescription).toBe('');
  });

  it('opens the delete dialog and clears it after a successful delete', async () => {
    const onDeleteBatch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBatchActions({
      onUpdateBatch: vi.fn(),
      onDeleteBatch,
    }));

    act(() => {
      result.current.openDeleteDialog(batch);
    });

    expect(result.current.isDeleteDialogOpen).toBe(true);
    expect(result.current.batchToDelete).toEqual(batch);

    await act(async () => {
      await result.current.handleDeleteBatch();
    });

    expect(onDeleteBatch).toHaveBeenCalledWith('batch-1');
    expect(result.current.isDeleteDialogOpen).toBe(false);
    expect(result.current.batchToDelete).toBeNull();
  });

  it('reports update and delete failures through normalizeAndPresentError', async () => {
    const updateError = new Error('update failed');
    const deleteError = new Error('delete failed');
    const onUpdateBatch = vi.fn().mockRejectedValue(updateError);
    const onDeleteBatch = vi.fn().mockRejectedValue(deleteError);
    const { result } = renderHook(() => useBatchActions({
      onUpdateBatch,
      onDeleteBatch,
    }));

    act(() => {
      result.current.handleEditBatch(batch);
      result.current.openDeleteDialog(batch);
    });

    await act(async () => {
      await result.current.handleUpdateBatch();
      await result.current.handleDeleteBatch();
    });

    await waitFor(() => {
      expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(updateError, {
        context: 'BatchSelector',
        showToast: false,
      });
      expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(deleteError, {
        context: 'BatchSelector',
        showToast: false,
      });
    });
  });
});
