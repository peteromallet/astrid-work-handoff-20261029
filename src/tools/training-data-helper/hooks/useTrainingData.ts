import { useEffect } from 'react';
import { useCloudBackendNotice } from '@/shared/hooks/async/useCloudBackendNotice';
import { requireCloudBackend } from '@/shared/lib/cloudBackend';
import { useVideoUrlCache } from './useVideoUrlCache';
import { useTrainingDataBatches } from './useTrainingDataBatches';
import { useTrainingDataUpload } from './useTrainingDataUpload';
import type { TrainingDataVideo, TrainingDataSegment } from './types';

// Re-export client types so existing consumers keep working
export type { TrainingDataBatch, TrainingDataVideo, TrainingDataSegment } from './types';

const FEATURE = 'training-data-helper';
const NO_VIDEOS: TrainingDataVideo[] = [];
const NO_SEGMENTS: TrainingDataSegment[] = [];

/** Training data (batches, videos, segments) has no backend yet: every operation needs the cloud. */
export function useTrainingData() {
  const { unavailable: cloudBackendUnavailable, attempt: attemptCloudBackend } = useCloudBackendNotice();

  useEffect(() => {
    void attemptCloudBackend(() => requireCloudBackend(FEATURE));
  }, [attemptCloudBackend]);

  const batchState = useTrainingDataBatches();
  const { isUploading, uploadVideo, uploadVideosWithSplitModes } = useTrainingDataUpload();
  const { getVideoUrl } = useVideoUrlCache(NO_VIDEOS, attemptCloudBackend);

  const createSegment = async (
    _trainingDataId: string,
    _startTime: number,
    _endTime: number,
    _description?: string,
  ): Promise<string> => requireCloudBackend(FEATURE);

  const updateSegment = async (
    _id: string,
    _updates: Partial<{ startTime: number; endTime: number; description: string }>,
  ): Promise<void> => requireCloudBackend(FEATURE);

  const deleteSegment = async (_id: string): Promise<void> => requireCloudBackend(FEATURE);

  const deleteVideo = async (_id: string): Promise<void> => requireCloudBackend(FEATURE);

  return {
    videos: NO_VIDEOS,
    segments: NO_SEGMENTS,
    ...batchState,
    cloudBackendUnavailable,
    isUploading,
    uploadVideo,
    uploadVideosWithSplitModes,
    deleteVideo,
    createSegment,
    updateSegment,
    deleteSegment,
    getVideoUrl,
  };
}
