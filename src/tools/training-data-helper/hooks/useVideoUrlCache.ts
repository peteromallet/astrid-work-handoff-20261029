import { useCallback, useEffect } from 'react';
import { requireCloudBackend } from '@/shared/lib/cloudBackend';
import type { TrainingDataVideo } from './types';

/**
 * Training videos live in a private cloud bucket, so playable URLs need the
 * cloud backend. Until one exists no video has a URL.
 */
export function useVideoUrlCache(
  videos: TrainingDataVideo[],
  attemptCloudBackend: (operation: () => void) => Promise<unknown>,
) {
  useEffect(() => {
    if (videos.length > 0) {
      void attemptCloudBackend(() => requireCloudBackend('training-data-helper'));
    }
  }, [videos, attemptCloudBackend]);

  const getVideoUrl = useCallback((_video: TrainingDataVideo): string => '', []);

  return { getVideoUrl };
}
