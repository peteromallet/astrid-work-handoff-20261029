import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { updateSettingsCache } from '@/shared/hooks/settings/useToolSettings';
import { settingsQueryKeys } from '@/shared/lib/queryKeys/settings';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';
import type { ProjectImageSettings, ReferenceImage } from '../../types';
import type { ReferenceActionHandlersOutput } from './types';

interface UseReferenceSelectionHandlersInput {
  selectedReferenceId: string | null;
  selectedReferenceIdByShot: Record<string, string | null>;
  effectiveShotId: string;
  referencePointers: ReferenceImage[];
  selectedProjectId: string | undefined;
  associatedShotId: string | null;
  shotPromptSettings?: { updateField: <T>(field: string, value: T) => void };
  updateProjectImageSettings: (
    scope: 'project' | 'shot',
    updates: Partial<ProjectImageSettings>
  ) => Promise<void>;
  markAsInteracted: () => void;
  queryClient: QueryClient;
}

interface ReferenceSelectionHandlers {
  handleSelectReference: ReferenceActionHandlersOutput['handleSelectReference'];
  handleDeleteReference: ReferenceActionHandlersOutput['handleDeleteReference'];
  handleRemoveStyleReference: ReferenceActionHandlersOutput['handleRemoveStyleReference'];
}

export function useReferenceSelectionHandlers(
  input: UseReferenceSelectionHandlersInput
): ReferenceSelectionHandlers {
  const {
    selectedReferenceId,
    selectedReferenceIdByShot,
    effectiveShotId,
    referencePointers,
    selectedProjectId,
    associatedShotId,
    shotPromptSettings,
    updateProjectImageSettings,
    markAsInteracted,
    queryClient,
  } = input;

  const handleSelectReference = useCallback(async (referenceId: string) => {
    if (associatedShotId && shotPromptSettings) {
      shotPromptSettings.updateField('selectedReferenceId', referenceId);
    }

    const optimisticUpdate = {
      ...selectedReferenceIdByShot,
      [effectiveShotId]: referenceId,
    };

    try {
      queryClient.setQueryData(
        settingsQueryKeys.tool(SETTINGS_IDS.PROJECT_IMAGE_SETTINGS, selectedProjectId, undefined),
        (prev: unknown) =>
          updateSettingsCache<ProjectImageSettings>(prev, {
            selectedReferenceIdByShot: optimisticUpdate,
          })
      );
    } catch {
      // Intentionally ignored - cache update is best effort.
    }

    await updateProjectImageSettings('project', {
      selectedReferenceIdByShot: optimisticUpdate,
    });

    markAsInteracted();
  }, [
    associatedShotId,
    effectiveShotId,
    markAsInteracted,
    queryClient,
    selectedProjectId,
    selectedReferenceIdByShot,
    shotPromptSettings,
    updateProjectImageSettings,
  ]);

  // Drops the pointer from the project's reference list and re-points any shot
  // that had it selected at the first remaining reference.
  const handleDeleteReference = useCallback(async (referenceId: string) => {
    if (!referencePointers.some((pointer) => pointer.id === referenceId)) {
      return;
    }

    const filteredPointers = referencePointers.filter((pointer) => pointer.id !== referenceId);
    const updatedSelections = { ...selectedReferenceIdByShot };
    Object.keys(updatedSelections).forEach((shotId) => {
      if (updatedSelections[shotId] === referenceId) {
        updatedSelections[shotId] = filteredPointers[0]?.id ?? null;
      }
    });

    try {
      queryClient.setQueryData(
        settingsQueryKeys.tool(SETTINGS_IDS.PROJECT_IMAGE_SETTINGS, selectedProjectId, undefined),
        (prev: unknown) =>
          updateSettingsCache<ProjectImageSettings>(prev, {
            references: filteredPointers,
            selectedReferenceIdByShot: updatedSelections,
          })
      );
    } catch {
      // Intentionally ignored - cache update is best effort.
    }

    await updateProjectImageSettings('project', {
      references: filteredPointers,
      selectedReferenceIdByShot: updatedSelections,
    });

    markAsInteracted();
  }, [
    markAsInteracted,
    queryClient,
    referencePointers,
    selectedProjectId,
    selectedReferenceIdByShot,
    updateProjectImageSettings,
  ]);

  const handleRemoveStyleReference = useCallback(async () => {
    if (!selectedReferenceId) {
      return;
    }

    await handleDeleteReference(selectedReferenceId);
  }, [handleDeleteReference, selectedReferenceId]);

  return {
    handleSelectReference,
    handleDeleteReference,
    handleRemoveStyleReference,
  };
}
