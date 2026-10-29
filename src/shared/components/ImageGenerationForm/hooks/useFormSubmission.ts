/**
 * useFormSubmission - Handles form submission and task creation
 */

import { useCallback, useRef } from 'react';
import type { FormEvent } from 'react';
import { useIncomingTaskRunner } from './formSubmission/useIncomingTaskRunner';
import { useSubmissionOrchestrator } from './formSubmission/useSubmissionOrchestrator';
import { useTaskParamsBuilder } from './formSubmission/useTaskParamsBuilder';
import type {
  UseFormSubmissionProps,
  UseFormSubmissionReturn,
} from './formSubmission/types';

export function useFormSubmission(props: UseFormSubmissionProps): UseFormSubmissionReturn {
  const { formState, promptConfig, effects } = props;
  const {
    selectedProjectId, prompts, imagesPerPrompt,
    associatedShotId, currentBeforePromptText, currentAfterPromptText,
    styleBoostTerms, isLocalGenerationEnabled, hiresFixConfig,
    projectResolution, actionablePromptsCount,
  } = formState;
  const {
    generationSourceRef, selectedTextModelRef, selectedLoras, styleReferenceImageGeneration,
    styleReferenceStrength, subjectStrength, effectiveSubjectDescription,
    inThisScene, inThisSceneStrength, referenceMode,
  } = promptConfig;
  const { onGenerate, automatedSubmitButton } = effects;
  const selectedLorasRef = useRef(selectedLoras);
  selectedLorasRef.current = selectedLoras;

  const getTaskParams = useTaskParamsBuilder({
    selectedProjectId,
    imagesPerPrompt,
    associatedShotId,
    currentBeforePromptText,
    currentAfterPromptText,
    styleBoostTerms,
    isLocalGenerationEnabled,
    hiresFixConfig,
    projectResolution,
    generationSourceRef,
    selectedTextModelRef,
    selectedLorasRef,
    styleReferenceImageGeneration,
    styleReferenceStrength,
    subjectStrength,
    effectiveSubjectDescription,
    inThisScene,
    inThisSceneStrength,
    referenceMode,
  });

  const runIncomingTask = useIncomingTaskRunner();

  const { submitManaged } = useSubmissionOrchestrator({
    context: { prompts, imagesPerPrompt, actionablePromptsCount },
    effects: {
      automatedSubmitButton,
      onGenerate,
      getTaskParams,
      runIncomingTask,
    },
  });

  const handleSubmit = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    submitManaged();
  }, [submitManaged]);

  return { handleSubmit };
}
