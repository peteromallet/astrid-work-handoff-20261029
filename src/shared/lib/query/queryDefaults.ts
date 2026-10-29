import { UseQueryOptions } from '@tanstack/react-query';
import { isErrorWithStatus } from '@/shared/lib/errorHandling/errorUtils';

// Realtime-backed queries should avoid mount/focus refetch loops.
const REALTIME_BACKED_PRESET = {
  staleTime: 30_000,
  gcTime: 5 * 60 * 1000,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
} as const satisfies Partial<UseQueryOptions>;

const STATIC_PRESET = {
  staleTime: 5 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
  refetchOnWindowFocus: false,
} as const satisfies Partial<UseQueryOptions>;

const IMMUTABLE_PRESET = {
  staleTime: Infinity,
  gcTime: 30 * 60 * 1000,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const satisfies Partial<UseQueryOptions>;

const USER_CONFIG_PRESET = {
  staleTime: 2 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  refetchOnWindowFocus: false,
} as const satisfies Partial<UseQueryOptions>;

export const QUERY_PRESETS = {
  realtimeBacked: REALTIME_BACKED_PRESET,
  static: STATIC_PRESET,
  immutable: IMMUTABLE_PRESET,
  userConfig: USER_CONFIG_PRESET,
} as const;

const classifyNetworkError = (error: Error): {
  type: 'transient' | 'client' | 'server' | 'auth' | 'abort';
  shouldRetry: boolean;
  maxRetries: number;
} => {
  const message = error?.message?.toLowerCase() || '';

  // Aborted/cancelled - never retry
  if (message.includes('abort') || message.includes('cancelled') || message.includes('request was cancelled')) {
    return { type: 'abort', shouldRetry: false, maxRetries: 0 };
  }

  // Auth errors - don't retry, needs re-auth
  if (message.includes('401') || message.includes('unauthorized') || message.includes('jwt')) {
    return { type: 'auth', shouldRetry: false, maxRetries: 0 };
  }

  // Client errors (4xx except auth) - don't retry
  if (message.includes('invalid') ||
      message.includes('not found') ||
      (isErrorWithStatus(error) && error.status !== undefined && error.status >= 400 && error.status < 500)) {
    return { type: 'client', shouldRetry: false, maxRetries: 0 };
  }

  // Transient network errors - retry aggressively
  if (message.includes('connection_closed') ||
      message.includes('err_connection_closed') ||
      message.includes('failed to fetch') ||
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('econnreset') ||
      message.includes('socket hang up')) {
    return { type: 'transient', shouldRetry: true, maxRetries: 4 };
  }

  // Server errors (5xx) - retry with caution
  if (message.includes('503') || message.includes('502') || message.includes('500') ||
      message.includes('service unavailable') ||
      (isErrorWithStatus(error) && error.status !== undefined && error.status >= 500)) {
    return { type: 'server', shouldRetry: true, maxRetries: 3 };
  }

  // Unknown errors - retry conservatively
  return { type: 'server', shouldRetry: true, maxRetries: 2 };
};

export const STANDARD_RETRY = (failureCount: number, error: Error) => {
  const classification = classifyNetworkError(error);

  if (!classification.shouldRetry) {
    return false;
  }

  return failureCount < classification.maxRetries;
};

export const STANDARD_RETRY_DELAY = (attemptIndex: number, error?: Error) => {
  const classification = error ? classifyNetworkError(error) : { type: 'server' as const };

  // Base delays by error type
  const baseDelay = classification.type === 'transient' ? 500 : 1000;
  const maxDelay = classification.type === 'transient' ? 5000 : 10000;

  // Exponential backoff with jitter to prevent thundering herd
  const exponentialDelay = baseDelay * Math.pow(2, attemptIndex);
  const jitter = Math.random() * 500; // 0-500ms jitter

  return Math.min(exponentialDelay + jitter, maxDelay);
};
