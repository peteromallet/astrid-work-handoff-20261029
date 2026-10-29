import { requireCloudBackend } from '@/shared/lib/cloudBackend';

const FEATURE = 'training-data-helper';

export function useTrainingDataUpload() {
  const uploadVideo = async (_file: File): Promise<string> => requireCloudBackend(FEATURE);

  const uploadVideosWithSplitModes = async (_videoFiles: Array<{
    file: File;
    splitMode: 'take-all' | 'manual' | 'auto-scene';
    detectedScenes?: number[];
  }>): Promise<void> => requireCloudBackend(FEATURE);

  return {
    isUploading: false,
    uploadVideo,
    uploadVideosWithSplitModes,
  };
}
