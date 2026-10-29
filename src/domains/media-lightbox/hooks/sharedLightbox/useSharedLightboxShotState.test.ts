// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useShotPositioning: vi.fn(),
}));

vi.mock('../useShotPositioning', () => ({
  useShotPositioning: (...args: unknown[]) => mocks.useShotPositioning(...args),
}));

import { useSharedLightboxShotState } from './useSharedLightboxShotState';

describe('useSharedLightboxShotState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useShotPositioning.mockReturnValue({
      isAlreadyPositionedInSelectedShot: false,
      isAlreadyAssociatedWithoutPosition: false,
      handleAddToShot: vi.fn(),
      handleAddToShotWithoutPosition: vi.fn(),
    });
  });

  it('falls back to empty shot arrays and normalizes non-boolean position state', () => {
    renderHook(() =>
      useSharedLightboxShotState({
        media: { id: 'media-1' } as never,
        onClose: vi.fn(),
        shotWorkflow: {
          positionedInSelectedShot: 'yes' as never,
        } as never,
      }),
    );

    expect(mocks.useShotPositioning).toHaveBeenCalledWith(
      expect.objectContaining({
        allShots: [],
        positionedInSelectedShot: undefined,
      }),
    );
  });

  it('returns the delegated positioning state', () => {
    const handleAddToShot = vi.fn();
    const handleAddToShotWithoutPosition = vi.fn();

    mocks.useShotPositioning.mockReturnValue({
      isAlreadyPositionedInSelectedShot: true,
      isAlreadyAssociatedWithoutPosition: true,
      handleAddToShot,
      handleAddToShotWithoutPosition,
    });

    const { result } = renderHook(() =>
      useSharedLightboxShotState({
        media: { id: 'media-1' } as never,
        onClose: vi.fn(),
        shotWorkflow: {
          allShots: [{ id: 'shot-1' }],
          selectedShotId: 'shot-1',
          positionedInSelectedShot: true,
        } as never,
      }),
    );

    expect(result.current.selectedShotId).toBe('shot-1');
    expect(result.current.isAlreadyPositionedInSelectedShot).toBe(true);
    expect(result.current.isAlreadyAssociatedWithoutPosition).toBe(true);
    expect(result.current.handleAddToShot).toBe(handleAddToShot);
    expect(result.current.handleAddToShotWithoutPosition).toBe(handleAddToShotWithoutPosition);
  });
});
