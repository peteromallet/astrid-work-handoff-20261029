import { type Task, type TaskStatus, TASK_STATUS } from '@/types/tasks';

export const PROCESSING_REFETCH_POLICY = {
  foregroundMinBackoffMs: 10000,
  backgroundMinBackoffMs: 60000,
  foregroundStaleThresholdMs: 30000,
  backgroundStaleThresholdMs: 60000,
  maxConsecutiveStaleEmptyRefetches: 3,
} as const;

export function isProcessingStatusFilter(status?: TaskStatus[]): boolean {
  return !!status?.some((value) => value === TASK_STATUS.QUEUED || value === TASK_STATUS.IN_PROGRESS);
}

export function isSucceededOnlyStatus(status?: TaskStatus[]): boolean {
  return !!status && status.length === 1 && status[0] === TASK_STATUS.COMPLETE;
}

export function sortProcessingTasks(tasks: Task[]): Task[] {
  const getStatusPriority = (status: string): number => {
    switch (status) {
      case TASK_STATUS.IN_PROGRESS:
        return 1;
      case TASK_STATUS.QUEUED:
        return 2;
      default:
        return 3;
    }
  };

  return [...tasks].sort((a, b) => {
    const aPriority = getStatusPriority(a.status);
    const bPriority = getStatusPriority(b.status);
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });
}

export function shouldForceProcessingRefetch(
  status: TaskStatus[] | undefined,
  query: {
    data?: { tasks: Task[] };
    isFetching: boolean;
    status: string;
    dataUpdatedAt: number;
  },
  timeSinceLastRefetch: number,
  consecutiveStaleEmptyRefetches = 0,
): boolean {
  const processingFilterSelected = !!status
    && status.includes(TASK_STATUS.QUEUED)
    && status.includes(TASK_STATUS.IN_PROGRESS);
  const hasStaleEmptyData = !!query.data && query.data.tasks.length === 0 && !query.isFetching;
  const dataAge = query.dataUpdatedAt ? Date.now() - query.dataUpdatedAt : Infinity;
  const isHidden = typeof document !== 'undefined' ? document.hidden : false;
  const minBackoffMs = isHidden
    ? PROCESSING_REFETCH_POLICY.backgroundMinBackoffMs
    : PROCESSING_REFETCH_POLICY.foregroundMinBackoffMs;
  const staleThresholdMs = isHidden
    ? PROCESSING_REFETCH_POLICY.backgroundStaleThresholdMs
    : PROCESSING_REFETCH_POLICY.foregroundStaleThresholdMs;
  const meetsStaleThreshold = dataAge > staleThresholdMs;
  const hasRemainingAttempts = consecutiveStaleEmptyRefetches < PROCESSING_REFETCH_POLICY.maxConsecutiveStaleEmptyRefetches;

  return processingFilterSelected
    && hasStaleEmptyData
    && query.status === 'success'
    && meetsStaleThreshold
    && hasRemainingAttempts
    && timeSinceLastRefetch > minBackoffMs;
}
