// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useImageManagementController } from './useImageManagementController';

const mocks = vi.hoisted(() => ({
  useImageManagement: vi.fn(),
}));

vi.mock('../hooks/editor-state/useImageManagement', () => ({
  useImageManagement: mocks.useImageManagement,
}));

describe('useImageManagementController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useImageManagement.mockReturnValue({
      handleReorderImagesInShot: vi.fn(),
      handlePendingPositionApplied: vi.fn(),
    });
  });

  function buildArgs() {
    return {
      selectedShotRef: { current: { id: 'shot-1' } } as never,
      projectIdRef: { current: 'project-1' } as never,
      allShotImagesRef: { current: [{ id: 'image-1' }] } as never,
      batchVideoFramesRef: { current: 61 } as never,
      updateShotImageOrderMutation: { mutate: vi.fn() } as never,
      actionsRef: { current: { setPendingFramePositions: vi.fn() } } as never,
      pendingFramePositions: new Map([['image-1', 0]]),
    };
  }

  it('forwards the image-management handlers', () => {
    const args = buildArgs();

    const { result } = renderHook(() => useImageManagementController(args));

    expect(mocks.useImageManagement).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedShotRef: args.selectedShotRef,
        projectIdRef: args.projectIdRef,
        pendingFramePositions: args.pendingFramePositions,
      }),
    );
    expect(result.current.handleReorderImagesInShot).toBe(
      mocks.useImageManagement.mock.results[0].value.handleReorderImagesInShot,
    );
    expect(result.current.handlePendingPositionApplied).toBe(
      mocks.useImageManagement.mock.results[0].value.handlePendingPositionApplied,
    );
  });
});
