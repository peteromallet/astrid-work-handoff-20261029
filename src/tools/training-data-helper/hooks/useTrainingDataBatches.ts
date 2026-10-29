import { useState } from 'react';
import { requireCloudBackend } from '@/shared/lib/cloudBackend';
import type { TrainingDataBatch } from './types';

const FEATURE = 'training-data-helper';
const NO_BATCHES: TrainingDataBatch[] = [];

export function useTrainingDataBatches() {
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const createBatch = async (_name: string, _description?: string): Promise<string> =>
    requireCloudBackend(FEATURE);

  const updateBatch = async (
    _id: string,
    _updates: { name?: string; description?: string },
  ): Promise<void> => requireCloudBackend(FEATURE);

  const deleteBatch = async (_id: string): Promise<void> => requireCloudBackend(FEATURE);

  return {
    batches: NO_BATCHES,
    selectedBatchId,
    setSelectedBatchId,
    createBatch,
    updateBatch,
    deleteBatch,
  };
}
