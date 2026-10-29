import { useReferenceModeHandler } from './useReferenceModeHandler';
import { useReferenceSelectionHandlers } from './useReferenceSelectionHandlers';
import type { ReferenceActionHandlersInput, ReferenceActionHandlersOutput } from './types';
import { useReferenceUpdater } from './useReferenceUpdater';
import { useReferenceValueHandlers } from './useReferenceValueHandlers';

export function useReferenceActionHandlers(
  input: ReferenceActionHandlersInput
): ReferenceActionHandlersOutput {
  const { identity, referenceState, stateSetters, mutations } = input;
  const {
    selectedReferenceId, selectedReferenceIdByShot, effectiveShotId,
    referencePointers, selectedProjectId, associatedShotId, shotPromptSettings,
  } = identity;
  const { isLocalGenerationEnabled, styleReferenceStrength, subjectStrength } = referenceState;
  const {
    setStyleReferenceStrength, setSubjectStrength, setSubjectDescription,
    setInThisScene, setInThisSceneStrength, setStyleBoostTerms,
    setReferenceMode, setIsEditingSubjectDescription, setHiresFixConfig,
  } = stateSetters;
  const {
    updateProjectImageSettings, markAsInteracted,
    pendingReferenceModeUpdate, queryClient,
  } = mutations;

  const handleUpdateReference = useReferenceUpdater({
    referencePointers,
    updateProjectImageSettings,
    markAsInteracted,
  });

  const {
    handleSelectReference,
    handleDeleteReference,
    handleRemoveStyleReference,
  } = useReferenceSelectionHandlers({
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
  });

  const {
    handleStyleStrengthChange,
    handleSubjectStrengthChange,
    handleSubjectDescriptionChange,
    handleSubjectDescriptionFocus,
    handleSubjectDescriptionBlur,
    handleInThisSceneChange,
    handleInThisSceneStrengthChange,
    handleStyleBoostTermsChange,
  } = useReferenceValueHandlers({
    selectedReferenceId,
    setStyleReferenceStrength,
    setSubjectStrength,
    setSubjectDescription,
    setInThisScene,
    setInThisSceneStrength,
    setStyleBoostTerms,
    setIsEditingSubjectDescription,
    handleUpdateReference,
  });

  const handleReferenceModeChange = useReferenceModeHandler({
    selectedReferenceId,
    isLocalGenerationEnabled,
    styleReferenceStrength,
    subjectStrength,
    pendingReferenceModeUpdate,
    setReferenceMode,
    setStyleReferenceStrength,
    setSubjectStrength,
    setInThisScene,
    setInThisSceneStrength,
    setHiresFixConfig,
    handleUpdateReference,
  });

  return {
    handleSelectReference,
    handleDeleteReference,
    handleUpdateReference,
    handleRemoveStyleReference,
    handleStyleStrengthChange,
    handleSubjectStrengthChange,
    handleSubjectDescriptionChange,
    handleSubjectDescriptionFocus,
    handleSubjectDescriptionBlur,
    handleInThisSceneChange,
    handleInThisSceneStrengthChange,
    handleStyleBoostTermsChange,
    handleReferenceModeChange,
  };
}
