import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { createImageGenerationTasks } from '@/shared/lib/taskCreation';
import type { BatchImageGenerationTaskParams } from '@/shared/types/imageGeneration';
import { queryKeys } from '@/shared/lib/queryKeys';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { composeDisabledReason } from '@/shared/components/RuntimeConnection/copy.ts';

interface UseImageGenSubmitParams {
  projectId: string | null;
  effectiveProjectId: string | null;
}

/**
 * Low-level hook for creating image generation tasks.
 *
 * NOTE: This hook does NOT manage incoming task placeholders. The caller
 * (useFormSubmission → useSubmitHandler → runIncomingTask) already wraps
 * the call in a placeholder lifecycle. Adding a second placeholder here
 * would cause double-counting in the TasksPane.
 *
 * On the hosted build (a gateway origin is configured) the composer route is not served: the form's
 * controls are disabled with the same line, and `handleNewGenerate` shows that line and sends nothing.
 */
export function useImageGenSubmit({
  projectId,
  effectiveProjectId,
}: UseImageGenSubmitParams) {
  const queryClient = useQueryClient();

  const handleNewGenerate = useCallback(async (taskParams: BatchImageGenerationTaskParams): Promise<string[]> => {
    const disabledReason = composeDisabledReason();
    if (disabledReason) {
      toast.error(disabledReason);
      return [];
    }
    if (!projectId) {
      toast.error("No project selected. Please select a project before generating images.");
      return [];
    }

    try {
      const createdTasks = await createImageGenerationTasks(projectId, taskParams);
      const createdTaskIds = createdTasks.task_ids ?? [createdTasks.task_id];

      // Refresh the gallery/media view. Task pane invalidation is handled by the
      // caller's runIncomingTask placeholder (awaited refetch + placeholder cleanup).
      // Doing fire-and-forget task invalidation here would race with the placeholder
      // and cause cancelled tasks to flash briefly in the UI.
      queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(effectiveProjectId) });

      return createdTaskIds;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[handleNewGenerate] FAILED:', error);
      }
      normalizeAndPresentError(error, { context: 'ImageGenerationToolPage.handleNewGenerate', toastTitle: error instanceof Error ? error.message : 'Failed to create tasks.' });
      return [];
    }
  }, [projectId, effectiveProjectId, queryClient]);

  return {
    handleNewGenerate,
  };
}
