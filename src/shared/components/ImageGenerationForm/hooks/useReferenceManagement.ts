/**
 * useReferenceManagement - Manages reference image state and operations
 */

import { useQueryClient } from '@tanstack/react-query';
import { useReferenceActionHandlers } from './referenceManagement/useReferenceActionHandlers';
import { useReferenceDisplayState } from './referenceManagement/useReferenceDisplayState';
import type {
  ReferenceManagementInput,
  ReferenceManagementOutput,
} from './referenceManagement/types';
import { useReferenceUiState } from './referenceManagement/useReferenceUiState';

;

export function useReferenceManagement(
  input: ReferenceManagementInput
): ReferenceManagementOutput {
  const {
    selectedProjectId,
    effectiveShotId,
    selectedReferenceId,
    selectedReferenceIdByShot,
    referencePointers,
    selectedReference,
    isLocalGenerationEnabled,
    updateProjectImageSettings,
    markAsInteracted,
    associatedShotId,
    shotPromptSettings,
    setHiresFixConfig,
  } = input;

  const queryClient = useQueryClient();
  const state = useReferenceUiState();

  const displayState = useReferenceDisplayState({
    selectedReference,
    selectedReferenceId,
    setReferenceMode: state.setReferenceMode,
    setStyleReferenceStrength: state.setStyleReferenceStrength,
    setSubjectStrength: state.setSubjectStrength,
    setSubjectDescription: state.setSubjectDescription,
    setInThisScene: state.setInThisScene,
    setInThisSceneStrength: state.setInThisSceneStrength,
    setStyleBoostTerms: state.setStyleBoostTerms,
  });

  const handlers = useReferenceActionHandlers({
    identity: {
      selectedReferenceId,
      selectedReferenceIdByShot,
      effectiveShotId,
      referencePointers,
      selectedProjectId,
      associatedShotId,
      shotPromptSettings,
    },
    referenceState: {
      isLocalGenerationEnabled,
      styleReferenceStrength: state.styleReferenceStrength,
      subjectStrength: state.subjectStrength,
    },
    stateSetters: {
      setStyleReferenceStrength: state.setStyleReferenceStrength,
      setSubjectStrength: state.setSubjectStrength,
      setSubjectDescription: state.setSubjectDescription,
      setInThisScene: state.setInThisScene,
      setInThisSceneStrength: state.setInThisSceneStrength,
      setStyleBoostTerms: state.setStyleBoostTerms,
      setReferenceMode: state.setReferenceMode,
      setIsEditingSubjectDescription: state.setIsEditingSubjectDescription,
      setHiresFixConfig,
    },
    mutations: {
      updateProjectImageSettings,
      markAsInteracted,
      pendingReferenceModeUpdate: displayState.pendingReferenceModeUpdate,
      queryClient,
    },
  });

  return {
    styleReferenceStrength: state.styleReferenceStrength,
    subjectStrength: state.subjectStrength,
    subjectDescription: state.subjectDescription,
    isEditingSubjectDescription: state.isEditingSubjectDescription,
    inThisScene: state.inThisScene,
    inThisSceneStrength: state.inThisSceneStrength,
    referenceMode: state.referenceMode,
    styleBoostTerms: state.styleBoostTerms,
    styleReferenceImageDisplay: displayState.styleReferenceImageDisplay,
    styleReferenceImageGeneration: displayState.styleReferenceImageGeneration,

    handleSelectReference: handlers.handleSelectReference,
    handleDeleteReference: handlers.handleDeleteReference,
    handleUpdateReference: handlers.handleUpdateReference,
    handleRemoveStyleReference: handlers.handleRemoveStyleReference,
    handleStyleStrengthChange: handlers.handleStyleStrengthChange,
    handleSubjectStrengthChange: handlers.handleSubjectStrengthChange,
    handleSubjectDescriptionChange: handlers.handleSubjectDescriptionChange,
    handleSubjectDescriptionFocus: handlers.handleSubjectDescriptionFocus,
    handleSubjectDescriptionBlur: handlers.handleSubjectDescriptionBlur,
    handleInThisSceneChange: handlers.handleInThisSceneChange,
    handleInThisSceneStrengthChange: handlers.handleInThisSceneStrengthChange,
    handleStyleBoostTermsChange: handlers.handleStyleBoostTermsChange,
    handleReferenceModeChange: handlers.handleReferenceModeChange,
  };
}
