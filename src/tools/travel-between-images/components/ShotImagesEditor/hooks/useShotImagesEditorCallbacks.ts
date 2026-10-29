import { useCallback } from 'react';
import { useEnhancedShotImageReorder } from '@/tools/travel-between-images/hooks/timeline/useEnhancedShotImageReorder';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  operationFailure,
  operationSuccess,
  type OperationResult,
} from '@/shared/lib/operationResult';
import type { ShotImagesEditorDataModel } from './useShotImagesEditorModel';

type ShotDataForCallbacks = Pick<
  ShotImagesEditorDataModel,
  'shotGenerations'
  | 'batchExchangePositions'
  | 'moveItemsToMidpoint'
  | 'getImagesForMode'
  | 'loadPositions'
  | 'positionsLoading'
>;

interface UseShotImagesEditorCallbacksOptions {
  selectedShotId: string;
  onImageDelete: (id: string) => void;
  onAddToShot?: (shotId: string, generationId: string, position?: number) => Promise<boolean | void>;
  onAddToShotWithoutPosition?: (shotId: string, generationId: string) => Promise<boolean>;
  onCreateShot?: (name: string) => Promise<string>;
  onDragStateChange?: (isDragging: boolean) => void;
  data: ShotDataForCallbacks;
}

interface ShotSelectionOperationResult {
  added: boolean;
}

interface ShotCreationOperationResult {
  shotId: string;
  shotName: string;
}

interface UseShotActionOperationsInput {
  onAddToShot?: (shotId: string, generationId: string, position?: number) => Promise<boolean | void>;
  onAddToShotWithoutPosition?: (shotId: string, generationId: string) => Promise<boolean>;
  onCreateShot?: (name: string) => Promise<string>;
}

function useShotActionOperations({
  onAddToShot,
  onAddToShotWithoutPosition,
  onCreateShot,
}: UseShotActionOperationsInput) {
  const runAddToShotOperation = useCallback(async (
    targetShotId: string,
    generationId: string,
  ): Promise<OperationResult<ShotSelectionOperationResult>> => {
    if (!onAddToShot || !targetShotId) {
      return operationFailure(new Error('Add-to-shot handler unavailable'), {
        policy: 'fail_closed',
        recoverable: false,
        errorCode: 'shot_editor_add_to_shot_handler_missing',
        message: 'Add-to-shot handler unavailable',
      });
    }
    try {
      const added = await onAddToShot(targetShotId, generationId);
      return operationSuccess(
        { added: added !== false },
        { policy: 'best_effort' },
      );
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useShotImagesEditorCallbacks.runAddToShotOperation',
        showToast: false,
      });
      return operationFailure(error, {
        policy: 'best_effort',
        recoverable: true,
        errorCode: 'shot_editor_add_to_shot_failed',
        message: 'Failed to add generation to shot',
      });
    }
  }, [onAddToShot]);

  const runAddToShotWithoutPositionOperation = useCallback(async (
    targetShotId: string,
    generationId: string,
  ): Promise<OperationResult<ShotSelectionOperationResult>> => {
    if (!onAddToShotWithoutPosition || !targetShotId) {
      return operationFailure(new Error('Add-to-shot-without-position handler unavailable'), {
        policy: 'fail_closed',
        recoverable: false,
        errorCode: 'shot_editor_add_to_shot_without_position_handler_missing',
        message: 'Add-to-shot-without-position handler unavailable',
      });
    }
    try {
      const added = await onAddToShotWithoutPosition(targetShotId, generationId);
      return operationSuccess(
        { added: added !== false },
        { policy: 'best_effort' },
      );
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useShotImagesEditorCallbacks.runAddToShotWithoutPositionOperation',
        showToast: false,
      });
      return operationFailure(error, {
        policy: 'best_effort',
        recoverable: true,
        errorCode: 'shot_editor_add_to_shot_without_position_failed',
        message: 'Failed to add generation to shot without position',
      });
    }
  }, [onAddToShotWithoutPosition]);

  const runCreateShotOperation = useCallback(async (
    shotName: string,
  ): Promise<OperationResult<ShotCreationOperationResult>> => {
    if (!onCreateShot) {
      return operationFailure(new Error('Create-shot handler unavailable'), {
        policy: 'fail_closed',
        recoverable: false,
        errorCode: 'shot_editor_create_shot_handler_missing',
        message: 'Create-shot handler unavailable',
      });
    }
    try {
      const shotId = await onCreateShot(shotName);
      if (!shotId) {
        return operationFailure(new Error('Create-shot handler returned no shot id'), {
          policy: 'fail_closed',
          recoverable: true,
          errorCode: 'shot_editor_create_shot_empty_result',
          message: 'Create-shot handler returned no shot id',
        });
      }

      return operationSuccess(
        { shotId, shotName },
        { policy: 'best_effort' },
      );
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useShotImagesEditorCallbacks.runCreateShotOperation',
        showToast: false,
      });
      return operationFailure(error, {
        policy: 'best_effort',
        recoverable: true,
        errorCode: 'shot_editor_create_shot_failed',
        message: 'Failed to create shot',
      });
    }
  }, [onCreateShot]);

  return {
    runAddToShotOperation,
    runAddToShotWithoutPositionOperation,
    runCreateShotOperation,
  };
}

export function useShotImagesEditorCallbacks(options: UseShotImagesEditorCallbacksOptions) {
  const {
    selectedShotId,
    onImageDelete,
    onAddToShot,
    onAddToShotWithoutPosition,
    onCreateShot,
    onDragStateChange,
    data,
  } = options;

  const {
    shotGenerations,
    batchExchangePositions,
    moveItemsToMidpoint,
    getImagesForMode,
    loadPositions,
    positionsLoading,
  } = data;

  const handleDragStateChange = useCallback((isDragging: boolean) => {
    onDragStateChange?.(isDragging);
  }, [onDragStateChange]);

  const {
    runAddToShotOperation,
    runAddToShotWithoutPositionOperation,
    runCreateShotOperation,
  } = useShotActionOperations({
    onAddToShot,
    onAddToShotWithoutPosition,
    onCreateShot,
  });

  const { handleReorder, handleDelete } = useEnhancedShotImageReorder(
    selectedShotId,
    {
      shotGenerations,
      getImagesForMode,
      batchExchangePositions,
      moveItemsToMidpoint,
      deleteItem: async (id: string) => {
        onImageDelete?.(id);
      },
      loadPositions,
      isLoading: positionsLoading,
    },
  );

  return {
    runAddToShotOperation,
    runAddToShotWithoutPositionOperation,
    runCreateShotOperation,
    handleDragStateChange,
    handleReorder,
    handleDelete,
  };
}

export type ShotImagesEditorCallbacks = ReturnType<typeof useShotImagesEditorCallbacks>;
