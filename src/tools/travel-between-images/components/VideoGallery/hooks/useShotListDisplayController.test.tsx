// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Shot } from '@/domains/generation/types';

const mocks = vi.hoisted(() => ({
  useShots: vi.fn(),
  usePendingNewShotDrop: vi.fn(),
}));

vi.mock('@/shared/contexts/ShotsContext', () => ({
  useShots: mocks.useShots,
}));

vi.mock('./usePendingNewShotDrop', () => ({
  usePendingNewShotDrop: mocks.usePendingNewShotDrop,
}));

import { useShotListDisplayController } from './useShotListDisplayController';

describe('useShotListDisplayController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useShots.mockReturnValue({ isLoading: false, error: null });
    mocks.usePendingNewShotDrop.mockReturnValue({ kind: 'pending-new-shot' });
  });

  function createShots(): Shot[] {
    return [
      { id: 'shot-1', position: 2, created_at: '2026-03-10T00:00:00.000Z' },
      { id: 'shot-2', position: 1, created_at: '2026-03-11T00:00:00.000Z' },
    ] as Shot[];
  }

  function render(sortMode: 'ordered' | 'newest' | 'oldest') {
    return renderHook(() => useShotListDisplayController({
      shots: createShots(),
      sortMode,
      onGenerationDropForNewShot: vi.fn(),
      onFilesDropForNewShot: vi.fn(),
      onSkeletonSetupReady: vi.fn(),
    }));
  }

  it('exposes the loading state and the pending new-shot drop', () => {
    const { result } = render('newest');

    expect(result.current.shotsLoading).toBe(false);
    expect(result.current.pendingNewShot).toEqual({ kind: 'pending-new-shot' });
  });

  it('sorts shots by creation date, newest first', () => {
    const { result } = render('newest');

    expect(result.current.shots?.map((shot) => shot.id)).toEqual(['shot-2', 'shot-1']);
  });

  it('sorts shots by creation date, oldest first', () => {
    const { result } = render('oldest');

    expect(result.current.shots?.map((shot) => shot.id)).toEqual(['shot-1', 'shot-2']);
  });

  it('keeps the stored order in ordered mode', () => {
    const { result } = render('ordered');

    expect(result.current.shots?.map((shot) => shot.id)).toEqual(['shot-2', 'shot-1']);
  });
});
