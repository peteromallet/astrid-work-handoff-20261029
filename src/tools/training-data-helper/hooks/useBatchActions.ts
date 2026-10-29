import { useState } from 'react';
import type { TrainingDataBatch } from './useTrainingData';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface UseBatchActionsParams {
  onUpdateBatch: (id: string, updates: { name?: string; description?: string }) => Promise<void>;
  onDeleteBatch: (id: string) => Promise<void>;
}

export function useBatchActions({ onUpdateBatch, onDeleteBatch }: UseBatchActionsParams) {
  const [editingBatch, setEditingBatch] = useState<TrainingDataBatch | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<TrainingDataBatch | null>(null);

  const handleEditBatch = (batch: TrainingDataBatch) => {
    setEditingBatch(batch);
    setEditName(batch.name);
    setEditDescription(batch.description || '');
  };

  const handleUpdateBatch = async () => {
    if (!editingBatch || !editName.trim()) return;

    setIsUpdating(true);
    try {
      await onUpdateBatch(editingBatch.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setEditingBatch(null);
      setEditName('');
      setEditDescription('');
    } catch (error) {
      normalizeAndPresentError(error, { context: 'BatchSelector', showToast: false });
    } finally {
      setIsUpdating(false);
    }
  };

  const openDeleteDialog = (batch: TrainingDataBatch) => {
    setBatchToDelete(batch);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteBatch = async () => {
    if (!batchToDelete) return;

    try {
      await onDeleteBatch(batchToDelete.id);
      setIsDeleteDialogOpen(false);
      setBatchToDelete(null);
    } catch (error) {
      normalizeAndPresentError(error, { context: 'BatchSelector', showToast: false });
    }
  };

  return {
    editingBatch,
    editName,
    setEditName,
    editDescription,
    setEditDescription,
    isUpdating,
    setEditingBatch,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    batchToDelete,
    handleEditBatch,
    handleUpdateBatch,
    openDeleteDialog,
    handleDeleteBatch,
  };
}
