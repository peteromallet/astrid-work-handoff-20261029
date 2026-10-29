import { describe, expect, it, vi, afterEach } from 'vitest';
import { TASK_STATUS } from '@/types/tasks';
import {
  PROCESSING_REFETCH_POLICY,
  shouldForceProcessingRefetch,
} from '@/shared/hooks/tasks/taskFetchPolicy';

describe('shouldForceProcessingRefetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows stale-empty processing refetches while attempts remain', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100_000);
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });

    const shouldRefetch = shouldForceProcessingRefetch(
      [TASK_STATUS.QUEUED, TASK_STATUS.IN_PROGRESS],
      {
        data: { tasks: [] },
        isFetching: false,
        status: 'success',
        dataUpdatedAt: 60_000,
      },
      PROCESSING_REFETCH_POLICY.foregroundMinBackoffMs + 1,
      0,
    );

    expect(shouldRefetch).toBe(true);
  });

  it('stops refetching once stale-empty attempt budget is exhausted', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100_000);
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });

    const shouldRefetch = shouldForceProcessingRefetch(
      [TASK_STATUS.QUEUED, TASK_STATUS.IN_PROGRESS],
      {
        data: { tasks: [] },
        isFetching: false,
        status: 'success',
        dataUpdatedAt: 60_000,
      },
      PROCESSING_REFETCH_POLICY.foregroundMinBackoffMs + 1,
      PROCESSING_REFETCH_POLICY.maxConsecutiveStaleEmptyRefetches,
    );

    expect(shouldRefetch).toBe(false);
  });
});
