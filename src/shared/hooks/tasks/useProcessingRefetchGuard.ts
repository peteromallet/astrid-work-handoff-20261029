import { useEffect, useRef } from 'react';
import type { Task, TaskStatus } from '@/types/tasks';
import {
  PROCESSING_REFETCH_POLICY,
  isProcessingStatusFilter,
  shouldForceProcessingRefetch,
} from '@/shared/hooks/tasks/taskFetchPolicy';

interface ProcessingRefetchQueryState {
  data?: { tasks: Task[] };
  isFetching: boolean;
  status: string;
  dataUpdatedAt: number;
  refetch: (...args: never[]) => unknown;
}

export function useProcessingRefetchGuard(
  status: TaskStatus[] | undefined,
  query: ProcessingRefetchQueryState,
): void {
  const lastRefetchRef = useRef<number>(0);
  const staleEmptyRefetchCountRef = useRef<number>(0);
  const previousStatusKeyRef = useRef<string>('');

  useEffect(() => {
    const statusKey = JSON.stringify(status ?? []);
    if (statusKey !== previousStatusKeyRef.current) {
      staleEmptyRefetchCountRef.current = 0;
      previousStatusKeyRef.current = statusKey;
    }

    const hasStaleEmptyData = !!query.data && query.data.tasks.length === 0 && !query.isFetching;
    const shouldResetAttempts = !hasStaleEmptyData || !isProcessingStatusFilter(status) || query.status !== 'success';
    if (shouldResetAttempts) {
      staleEmptyRefetchCountRef.current = 0;
    }

    const hasTerminalGuardState = staleEmptyRefetchCountRef.current >= PROCESSING_REFETCH_POLICY.maxConsecutiveStaleEmptyRefetches;
    const timeSinceLastRefetch = Date.now() - lastRefetchRef.current;
    if (hasTerminalGuardState && hasStaleEmptyData) {
      return;
    }

    if (shouldForceProcessingRefetch(status, query, timeSinceLastRefetch, staleEmptyRefetchCountRef.current)) {
      lastRefetchRef.current = Date.now();
      staleEmptyRefetchCountRef.current += 1;
      query.refetch();
    }
  }, [status, query.data, query.isFetching, query.status, query.dataUpdatedAt, query.refetch]);
}
