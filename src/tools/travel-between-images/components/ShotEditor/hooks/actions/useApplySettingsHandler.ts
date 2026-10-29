/**
 * Stable Apply Settings Handler Hook
 *
 * Provides a stable callback for applying settings from tasks without
 * recreating on every render.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as ApplySettingsService from '../../services/applySettingsService';
import type { GenerationRow, Shot } from '@/domains/generation/types';
import { enqueueGenerationsInvalidation } from '@/shared/hooks/invalidation/useGenerationInvalidation';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface ApplySettingsHandlerCore {
  projectId: string;
  selectedShot: Shot | undefined;
  simpleFilteredImages: GenerationRow[];
}

export interface ApplySettingsHandlerContexts {
  model: ApplySettingsService.ApplyModelContext;
  prompts: ApplySettingsService.ApplyPromptContext;
  generation: ApplySettingsService.ApplyGenerationContext;
  modes: ApplySettingsService.ApplyModeContext;
  advanced: ApplySettingsService.ApplyAdvancedContext;
  textAddons: ApplySettingsService.ApplyTextAddonContext;
  motion: ApplySettingsService.ApplyMotionContext;
  loras: ApplySettingsService.ApplyLoraContext;
  structureVideo: ApplySettingsService.ApplyStructureVideoContext;
}

interface ApplySettingsHandlerInput {
  core: ApplySettingsHandlerCore;
  contexts: ApplySettingsHandlerContexts;
}

async function fetchTaskData(projectSlug: string, taskId: string) {
  return ApplySettingsService.fetchTask(projectSlug, taskId);
}

async function applySettingsFromTask(
  taskId: string,
  handlerState: ApplySettingsHandlerInput,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const taskLookup = await fetchTaskData(handlerState.core.projectId, taskId);
  if (taskLookup.status === 'missing') {
    normalizeAndPresentError(new Error('Task not found'), {
      context: 'useApplySettingsHandler',
      toastTitle: 'Failed to apply settings from task',
      showToast: false,
      logData: { taskId },
    });
    return;
  }

  const settings = ApplySettingsService.extractSettings(taskLookup.taskData);

  await ApplySettingsService.applyFramePositionsToExistingImages(
    settings.generation,
    handlerState.core.selectedShot ?? null,
    handlerState.core.simpleFilteredImages,
  );

  await ApplySettingsService.applyModelSettings(settings.generation, handlerState.contexts.model);
  await ApplySettingsService.applyPromptSettings(settings.prompts, handlerState.contexts.prompts);
  await ApplySettingsService.applyGenerationSettings(settings.generation, handlerState.contexts.generation);
  await ApplySettingsService.applyModeSettings(settings.modes, handlerState.contexts.modes);
  await ApplySettingsService.applyAdvancedModeSettings(settings.advanced, handlerState.contexts.advanced);
  await ApplySettingsService.applyTextPromptAddons(settings.textAddons, handlerState.contexts.textAddons);
  await ApplySettingsService.applyMotionSettings(
    { ...settings.motion, advancedMode: settings.modes.advancedMode },
    handlerState.contexts.motion,
  );
  await ApplySettingsService.applyLoRAs(
    { ...settings.loras, advancedMode: settings.modes.advancedMode },
    handlerState.contexts.loras,
  );
  await ApplySettingsService.applyStructureVideo(settings.structure, handlerState.contexts.structureVideo);

  if (handlerState.core.selectedShot?.id) {
    enqueueGenerationsInvalidation(queryClient, handlerState.core.selectedShot.id, {
      reason: 'apply-settings-force-reload',
      scope: 'all',
      delayMs: 200,
    });
  }

}

export function useApplySettingsHandler(handlerState: ApplySettingsHandlerInput) {
  const queryClient = useQueryClient();
  const handlerStateRef = useRef(handlerState);

  useEffect(() => {
    handlerStateRef.current = handlerState;
  }, [handlerState]);

  return useCallback(async (taskId: string) => {
    const latestHandlerState = handlerStateRef.current;

    try {
      await applySettingsFromTask(taskId, latestHandlerState, queryClient);
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useApplySettingsHandler',
        toastTitle: 'Failed to apply settings from task',
      });
    }
  }, [queryClient]);
}
