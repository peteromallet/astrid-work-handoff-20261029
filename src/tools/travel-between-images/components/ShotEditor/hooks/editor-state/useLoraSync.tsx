import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLoraManager } from '@/domains/lora/hooks/useLoraManager';
import type { LoraManagerState } from '@/domains/lora/types/loraManager';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';
import { writeLastEditedLora } from '@/shared/lib/lastEditedLora';
import type { ActiveLora } from '@/domains/lora/types/lora';
import { ShotLora, type SelectedModel } from '@/tools/travel-between-images/settings';

interface UseLoRASyncProps {
  // LoRAs from unified shot settings
  selectedLoras: ShotLora[];
  onSelectedLorasChange: (loras: ShotLora[]) => void;

  // Project ID for Save/Load functionality
  projectId?: string;

  // Available loras for lookup

  // Prompt integration
  batchVideoPrompt: string;
  onBatchVideoPromptChange: (prompt: string) => void;
  selectedModel: SelectedModel;
}

export type LoraManagerReturn = LoraManagerState;

function toActiveLora(lora: ShotLora): ActiveLora {
  return {
    id: lora.id,
    name: lora.name,
    path: lora.path,
    strength: lora.strength,
    previewImageUrl: lora.previewImageUrl,
    trigger_word: lora.trigger_word,
  };
}

function toShotLora(lora: ActiveLora): ShotLora {
  return {
    id: lora.id,
    name: lora.name,
    path: lora.path,
    strength: lora.strength,
    previewImageUrl: lora.previewImageUrl,
    trigger_word: lora.trigger_word,
  };
}

export const useLoraSync = ({
  selectedLoras: selectedLorasFromProps,
  onSelectedLorasChange,
  projectId,
  batchVideoPrompt,
  onBatchVideoPromptChange,
  selectedModel,
}: UseLoRASyncProps): { loraManager: LoraManagerReturn } => {
  const selectedLoras = useMemo(
    () => selectedLorasFromProps.map(toActiveLora),
    [selectedLorasFromProps],
  );
  const strengthPersistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelectedLorasChange = useCallback((loras: ActiveLora[]) => {
    onSelectedLorasChange(loras.map(toShotLora));
  }, [onSelectedLorasChange]);

  const persistLastEditedLora = useCallback((lora: ActiveLora | null) => {
    writeLastEditedLora(projectId, lora);
  }, [projectId]);

  useEffect(() => {
    return () => {
      if (strengthPersistTimeoutRef.current) {
        clearTimeout(strengthPersistTimeoutRef.current);
      }
    };
  }, []);

  // Disable auto-load: shot settings are the source of truth for selected LoRAs.
  // Without this, the project persistence auto-load fights with intentional removal
  // by re-adding project LoRAs whenever the selection becomes empty.
  const loraManager = useLoraManager({
    projectId,
    persistenceScope: 'project',
    persistenceKey: SETTINGS_IDS.PROJECT_LORAS,
    enableProjectPersistence: true,
    enableTriggerWords: true,
    onPromptUpdate: onBatchVideoPromptChange,
    currentPrompt: batchVideoPrompt,
    selectedLoras,
    onSelectedLorasChange: handleSelectedLorasChange,
    onExplicitLoraEdit: (event) => {
      const target = event.kind === 'remove'
        ? (event.current[event.current.length - 1] ?? null)
        : event.lora;

      if (strengthPersistTimeoutRef.current) {
        clearTimeout(strengthPersistTimeoutRef.current);
        strengthPersistTimeoutRef.current = null;
      }

      if (event.kind === 'strength') {
        strengthPersistTimeoutRef.current = setTimeout(() => {
          persistLastEditedLora(target);
          strengthPersistTimeoutRef.current = null;
        }, 500);
        return;
      }

      persistLastEditedLora(target);
    },
    disableAutoLoad: true,
  });

  const previousModelRef = useRef<SelectedModel | null>(null);
  // Cache LoRAs per model so switching back restores the previous selection
  const lorasByModelRef = useRef<Partial<Record<SelectedModel, ShotLora[]>>>({});

  useEffect(() => {
    if (previousModelRef.current === null) {
      previousModelRef.current = selectedModel;
      return;
    }

    if (previousModelRef.current !== selectedModel) {
      const previousModel = previousModelRef.current;

      // Save current LoRAs for the previous model
      if (selectedLorasFromProps.length > 0) {
        lorasByModelRef.current = {
          ...lorasByModelRef.current,
          [previousModel]: selectedLorasFromProps,
        };
      }

      // Load cached LoRAs for the new model (or clear)
      const cachedLoras = lorasByModelRef.current[selectedModel] ?? [];
      onSelectedLorasChange(cachedLoras);
    }

    previousModelRef.current = selectedModel;
  }, [onSelectedLorasChange, selectedLorasFromProps, selectedModel]);

  return { loraManager };
};
