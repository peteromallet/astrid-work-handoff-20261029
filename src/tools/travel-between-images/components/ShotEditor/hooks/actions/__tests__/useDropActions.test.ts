// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Shot } from '@/domains/generation/types';
import { useDropActions } from '../useDropActions';

const {
  addImageToShotMutateAsyncMock,
  normalizeAndPresentErrorMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  addImageToShotMutateAsyncMock: vi.fn(),
  normalizeAndPresentErrorMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: { error: toastErrorMock },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: normalizeAndPresentErrorMock,
}));

vi.mock('@/shared/hooks/shots', () => ({
  useAddImageToShot: () => ({ mutateAsync: addImageToShotMutateAsyncMock }),
}));

const shot = { id: 'shot-1', name: 'Shot 1' } as Shot;

describe('useDropActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addImageToShotMutateAsyncMock.mockResolvedValue(undefined);
  });

  it('adds a generation dropped on the timeline at the target frame', async () => {
    const { result } = renderHook(() => useDropActions({ selectedShot: shot, projectId: 'project-1' }));

    await act(async () => {
      await result.current.handleTimelineGenerationDrop('gen-1', 'https://img/1.png', 'https://img/1-thumb.png', 40);
    });

    expect(addImageToShotMutateAsyncMock).toHaveBeenCalledWith({
      generation_id: 'gen-1',
      shot_id: 'shot-1',
      imageUrl: 'https://img/1.png',
      thumbUrl: 'https://img/1-thumb.png',
      timelineFrame: 40,
      project_id: 'project-1',
    });
  });

  it('adds a generation dropped on the batch grid', async () => {
    const { result } = renderHook(() => useDropActions({ selectedShot: shot, projectId: 'project-1' }));

    await act(async () => {
      await result.current.handleBatchGenerationDrop('gen-2', 'https://img/2.png', undefined, 10);
    });

    expect(addImageToShotMutateAsyncMock).toHaveBeenCalledWith({
      generation_id: 'gen-2',
      shot_id: 'shot-1',
      imageUrl: 'https://img/2.png',
      thumbUrl: undefined,
      timelineFrame: 10,
      project_id: 'project-1',
    });
  });

  it('refuses a drop without a project and reports an error toast', async () => {
    const { result } = renderHook(() => useDropActions({ selectedShot: shot, projectId: '' }));

    await act(async () => {
      await result.current.handleTimelineGenerationDrop('gen-1', 'https://img/1.png', undefined);
    });

    expect(addImageToShotMutateAsyncMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('Cannot add generation: No shot or project selected.');
  });

  it('refuses a drop without a generation id', async () => {
    const { result } = renderHook(() => useDropActions({ selectedShot: shot, projectId: 'project-1' }));

    await act(async () => {
      await result.current.handleBatchGenerationDrop('', 'https://img/1.png', undefined);
    });

    expect(addImageToShotMutateAsyncMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('Invalid generation: Missing generation ID.');
  });

  it('presents and rethrows a failed add', async () => {
    const failure = new Error('add failed');
    addImageToShotMutateAsyncMock.mockRejectedValueOnce(failure);
    const { result } = renderHook(() => useDropActions({ selectedShot: shot, projectId: 'project-1' }));

    await expect(
      result.current.handleTimelineGenerationDrop('gen-1', 'https://img/1.png', undefined),
    ).rejects.toThrow('add failed');

    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(failure, expect.objectContaining({
      context: 'GenerationDrop',
    }));
  });
});
