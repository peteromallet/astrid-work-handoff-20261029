import { useCallback, useState } from 'react';
import { CloudBackendUnavailableError } from '@/shared/lib/cloudBackend';

/**
 * Catch point for the kept tools that still reach for a cloud-only feature.
 * `attempt` runs the operation; a `CloudBackendUnavailableError` is absorbed and
 * flips `unavailable` (render `CloudBackendNotice` from it), any other error
 * is rethrown to the caller's own error handling.
 */
export function useCloudBackendNotice() {
  const [unavailable, setUnavailable] = useState(false);

  const attempt = useCallback(async <T,>(operation: () => T | Promise<T>): Promise<T | undefined> => {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CloudBackendUnavailableError) {
        setUnavailable(true);
        return undefined;
      }
      throw error;
    }
  }, []);

  return { unavailable, attempt };
}
