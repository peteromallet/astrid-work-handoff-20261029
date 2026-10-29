import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { ActiveLora } from '@/domains/lora/types/lora';
import type { LoraManagerOptions, LoraManagerState } from '@/domains/lora/types/loraManager';
import { dedupeActiveLoras, shouldApplyLoraDefaults } from './loraStateHelpers';
import { useLoraPersistence } from './loraPersistence';


const EMPTY_ACTIVE_LORAS: ActiveLora[] = [];

export const useLoraManager = (
  options: LoraManagerOptions = {},
): LoraManagerState => {
  const {
    projectId,
    shotId,
    selectedLoras: controlledSelectedLoras,
    onSelectedLorasChange,
    onExplicitLoraEdit,
    persistenceScope = 'none',
    enableProjectPersistence = false,
    persistenceKey = 'loras',
    enableTriggerWords = false,
    onPromptUpdate,
    currentPrompt = '',
    disableAutoLoad = false,
  } = options;

  const isControlledSelection = !!(controlledSelectedLoras && onSelectedLorasChange);
  const [internalSelectedLoras, setInternalSelectedLoras] = useState<ActiveLora[]>([]);
  const selectedLoras = useMemo(
    () => (isControlledSelection
      ? (controlledSelectedLoras ?? EMPTY_ACTIVE_LORAS)
      : internalSelectedLoras),
    [controlledSelectedLoras, internalSelectedLoras, isControlledSelection],
  );

  const [hasEverSetLoras, setHasEverSetLoras] = useState(false);

  const setSelectedLoras = useCallback((loras: ActiveLora[]) => {
    if (isControlledSelection) {
      onSelectedLorasChange?.(loras);
      return;
    }
    setInternalSelectedLoras(loras);
  }, [isControlledSelection, onSelectedLorasChange]);

  useEffect(() => {
    if (selectedLoras.length <= 1) {
      return;
    }
    const deduped = dedupeActiveLoras(selectedLoras);
    if (deduped.length !== selectedLoras.length) {
      setSelectedLoras(deduped);
    }
  }, [selectedLoras, setSelectedLoras]);

  const selectedLorasRef = useRef(selectedLoras);
  useEffect(() => {
    selectedLorasRef.current = selectedLoras;
  }, [selectedLoras]);

  const markAsUserSet = useCallback(() => {
    setHasEverSetLoras(true);
  }, []);

  const latestPromptRef = useRef(currentPrompt);
  useEffect(() => {
    latestPromptRef.current = currentPrompt;
  }, [currentPrompt]);

  const handleRemoveLora = useCallback((loraIdToRemove: string, isManualAction = true) => {
    const loraToRemove = selectedLorasRef.current.find((lora) => lora.id === loraIdToRemove);
    if (!loraToRemove) {
      return;
    }

    const nextSelectedLoras = selectedLorasRef.current.filter((lora) => lora.id !== loraIdToRemove);
    setSelectedLoras(nextSelectedLoras);
    if (isManualAction) {
      markAsUserSet();
      onExplicitLoraEdit?.({
        kind: 'remove',
        lora: loraToRemove,
        current: nextSelectedLoras,
      });
    }
  }, [markAsUserSet, onExplicitLoraEdit, setSelectedLoras]);

  const handleLoraStrengthChange = useCallback((loraId: string, newStrength: number, isManualAction = true) => {
    let updatedLora: ActiveLora | null = null;
    const nextSelectedLoras = selectedLorasRef.current.map((lora) => {
      if (lora.id !== loraId) {
        return lora;
      }

      const nextLora: ActiveLora = { ...lora, strength: newStrength };
      updatedLora = nextLora;
      return nextLora;
    });

    if (!updatedLora) {
      return;
    }

    setSelectedLoras(nextSelectedLoras);
    if (isManualAction) {
      markAsUserSet();
      onExplicitLoraEdit?.({
        kind: 'strength',
        lora: updatedLora,
        current: nextSelectedLoras,
      });
    }
  }, [markAsUserSet, onExplicitLoraEdit, setSelectedLoras]);

  const handleAddTriggerWord = useCallback((triggerWord: string) => {
    if (!enableTriggerWords || !onPromptUpdate) {
      return;
    }

    const prompt = latestPromptRef.current || '';
    const newPrompt = prompt.trim() ? `${prompt}, ${triggerWord}` : triggerWord;
    onPromptUpdate(newPrompt);
    latestPromptRef.current = newPrompt;
  }, [enableTriggerWords, onPromptUpdate]);

  const {
    persistenceSettings,
    isSavingLoras,
    hasSavedLoras,
    saveSuccess,
    saveFlash,
    handleSaveProjectLoras,
    handleLoadProjectLoras,
    renderHeaderActions,
  } = useLoraPersistence({
    projectId,
    shotId,
    persistenceScope,
    persistenceKey,
    disableAutoLoad,
    enableProjectPersistence,
    manager: {
      selectedLoras,
      selectedLorasRef,
      handleRemoveLora,
      handleLoraStrengthChange,
      markAsUserSet,
      setHasEverSetLoras,
    },
  });

  const shouldApplyDefaults = useMemo(() => shouldApplyLoraDefaults({
    hasEverSetLoras,
    selectedLoraCount: selectedLoras.length,
    persistenceScope,
    persistedLoras: persistenceSettings?.loras,
  }), [hasEverSetLoras, selectedLoras.length, persistenceScope, persistenceSettings?.loras]);

  const baseManagerState = useMemo(
    () => ({
      selectedLoras,
      setSelectedLoras,
      handleRemoveLora,
      handleLoraStrengthChange,
      hasEverSetLoras,
      shouldApplyDefaults,
      markAsUserSet,
      ...(enableTriggerWords && { handleAddTriggerWord }),
    }),
    [
      selectedLoras,
      setSelectedLoras,
      handleRemoveLora,
      handleLoraStrengthChange,
      hasEverSetLoras,
      shouldApplyDefaults,
      markAsUserSet,
      enableTriggerWords,
      handleAddTriggerWord,
    ],
  );

  return useMemo(() => {
    if (!enableProjectPersistence) {
      return baseManagerState;
    }

    return {
      ...baseManagerState,
      handleSaveProjectLoras,
      handleLoadProjectLoras,
      hasSavedLoras,
      isSavingLoras,
      saveSuccess,
      saveFlash,
      renderHeaderActions,
    };
  }, [
    baseManagerState,
    enableProjectPersistence,
    handleSaveProjectLoras,
    handleLoadProjectLoras,
    hasSavedLoras,
    isSavingLoras,
    saveSuccess,
    saveFlash,
    renderHeaderActions,
  ]);
};
