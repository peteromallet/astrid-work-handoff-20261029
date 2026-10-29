import { useMemo } from 'react';
import type { ActiveLora } from '@/domains/lora/types/lora';
import type { ImageGenerationFormUIState, FormUIActions } from '../state/useFormUIState';
import { useContextValue } from '../ImageGenerationFormContext';
import type {
  FormCoreState,
  FormPromptState,
  FormPromptHandlers,
  FormReferenceState,
  FormReferenceHandlers,
  FormLoraState,
  FormLoraHandlers,
} from '../ImageGenerationFormContext.types';

/** Grouped inputs matching the sub-hook return shapes */
interface UseFormContextBuilderProps {
  uiState: ImageGenerationFormUIState;
  uiActions: FormUIActions;
  core: {
    selectedProjectId: string | null;
    associatedShotId: string | null;
    effectiveShotId: string;
    isGenerating: boolean;
    ready: boolean;
  };
  promptManagement: Pick<
    ReturnType<typeof import('./usePromptManagement').usePromptManagement>,
    'prompts' | 'actionablePromptsCount' |
    'currentBeforePromptText' | 'currentAfterPromptText' | 'lastKnownPromptCount' |
    'setPrompts' |
    'setCurrentBeforePromptText' | 'setCurrentAfterPromptText' |
    'handleAddPrompt' | 'handleUpdatePrompt' | 'handleRemovePrompt' | 'handleResetPromptsToSingleBlank'
  >;
  referenceManagement: Pick<
    ReturnType<typeof import('./useReferenceManagement').useReferenceManagement>,
    'referenceMode' | 'styleReferenceStrength' | 'subjectStrength' | 'subjectDescription' |
    'inThisScene' | 'inThisSceneStrength' | 'styleBoostTerms' |
    'styleReferenceImageDisplay' | 'handleSelectReference' | 'handleDeleteReference' |
    'handleRemoveStyleReference' |
    'handleStyleStrengthChange' | 'handleSubjectStrengthChange' | 'handleSubjectDescriptionChange' |
    'handleSubjectDescriptionFocus' | 'handleSubjectDescriptionBlur' |
    'handleInThisSceneChange' | 'handleInThisSceneStrengthChange' |
    'handleReferenceModeChange' | 'handleStyleBoostTermsChange'
  >;
  references: {
    hydratedReferences: import('../types').HydratedReferenceImage[];
    displayedReferenceId: string | null;
  };
  loras: {
    selectedLoras: ActiveLora[];
    handleRemoveLora: (id: string) => void;
    handleLoraStrengthChange: (id: string, strength: number) => void;
  };
  markAsInteracted: () => void;
}

export function useFormContextBuilder({
  uiState,
  uiActions,
  core,
  promptManagement: pm,
  referenceManagement: rm,
  references: refs,
  loras,
  markAsInteracted,
}: UseFormContextBuilderProps) {
  const coreState = useMemo<FormCoreState>(() => ({
    selectedProjectId: core.selectedProjectId,
    associatedShotId: core.associatedShotId,
    effectiveShotId: core.effectiveShotId,
    isGenerating: core.isGenerating,
    ready: core.ready,
  }), [core.selectedProjectId, core.associatedShotId, core.effectiveShotId, core.isGenerating, core.ready]);

  const promptState = useMemo<FormPromptState>(() => ({
    prompts: pm.prompts,
    actionablePromptsCount: pm.actionablePromptsCount,
    currentBeforePromptText: pm.currentBeforePromptText,
    currentAfterPromptText: pm.currentAfterPromptText,
    lastKnownPromptCount: pm.lastKnownPromptCount,
  }), [pm.prompts, pm.actionablePromptsCount, pm.currentBeforePromptText, pm.currentAfterPromptText, pm.lastKnownPromptCount]);

  const promptHandlersValue = useMemo<FormPromptHandlers>(() => ({
    setPrompts: pm.setPrompts,
    setCurrentBeforePromptText: pm.setCurrentBeforePromptText,
    setCurrentAfterPromptText: pm.setCurrentAfterPromptText,
    handleAddPrompt: pm.handleAddPrompt,
    handleUpdatePrompt: pm.handleUpdatePrompt,
    handleRemovePrompt: pm.handleRemovePrompt,
    handleResetPromptsToSingleBlank: pm.handleResetPromptsToSingleBlank,
    markAsInteracted,
  }), [pm.setPrompts, pm.setCurrentBeforePromptText, pm.setCurrentAfterPromptText, pm.handleAddPrompt, pm.handleUpdatePrompt, pm.handleRemovePrompt, pm.handleResetPromptsToSingleBlank, markAsInteracted]);

  const referenceState = useMemo<FormReferenceState>(() => ({
    references: refs.hydratedReferences,
    selectedReferenceId: refs.displayedReferenceId,
    referenceMode: rm.referenceMode,
    styleReferenceStrength: rm.styleReferenceStrength,
    subjectStrength: rm.subjectStrength,
    subjectDescription: rm.subjectDescription,
    inThisScene: rm.inThisScene,
    inThisSceneStrength: rm.inThisSceneStrength,
    styleBoostTerms: rm.styleBoostTerms,
    styleReferenceImageDisplay: rm.styleReferenceImageDisplay,
  }), [refs.hydratedReferences, refs.displayedReferenceId, rm.referenceMode, rm.styleReferenceStrength, rm.subjectStrength, rm.subjectDescription, rm.inThisScene, rm.inThisSceneStrength, rm.styleBoostTerms, rm.styleReferenceImageDisplay]);

  const referenceHandlersValue = useMemo<FormReferenceHandlers>(() => ({
    onSelectReference: rm.handleSelectReference,
    onDeleteReference: rm.handleDeleteReference,
    onStyleRemove: rm.handleRemoveStyleReference,
    onStyleStrengthChange: rm.handleStyleStrengthChange,
    onSubjectStrengthChange: rm.handleSubjectStrengthChange,
    onSubjectDescriptionChange: rm.handleSubjectDescriptionChange,
    onSubjectDescriptionFocus: rm.handleSubjectDescriptionFocus,
    onSubjectDescriptionBlur: rm.handleSubjectDescriptionBlur,
    onInThisSceneChange: rm.handleInThisSceneChange,
    onInThisSceneStrengthChange: rm.handleInThisSceneStrengthChange,
    onReferenceModeChange: rm.handleReferenceModeChange,
    onStyleBoostTermsChange: rm.handleStyleBoostTermsChange,
  }), [rm.handleSelectReference, rm.handleDeleteReference, rm.handleRemoveStyleReference, rm.handleStyleStrengthChange, rm.handleSubjectStrengthChange, rm.handleSubjectDescriptionChange, rm.handleSubjectDescriptionFocus, rm.handleSubjectDescriptionBlur, rm.handleInThisSceneChange, rm.handleInThisSceneStrengthChange, rm.handleReferenceModeChange, rm.handleStyleBoostTermsChange]);

  const loraState = useMemo<FormLoraState>(() => ({
    selectedLoras: loras.selectedLoras,
  }), [loras.selectedLoras]);

  const loraHandlersValue = useMemo<FormLoraHandlers>(() => ({
    handleRemoveLora: loras.handleRemoveLora,
    handleLoraStrengthChange: loras.handleLoraStrengthChange,
  }), [loras.handleRemoveLora, loras.handleLoraStrengthChange]);

  return useContextValue({
    uiState,
    uiActions,
    core: coreState,
    prompts: promptState,
    promptHandlers: promptHandlersValue,
    references: referenceState,
    referenceHandlers: referenceHandlersValue,
    loras: loraState,
    loraHandlers: loraHandlersValue,
  });
}
