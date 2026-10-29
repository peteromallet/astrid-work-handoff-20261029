export const TASK_PROCESSING_STATUSES = ['Queued', 'In Progress'] as const;

export const TASK_FAILURE_STATUSES = ['Failed', 'Cancelled'] as const;

type TaskFailureStatus = (typeof TASK_FAILURE_STATUSES)[number];
