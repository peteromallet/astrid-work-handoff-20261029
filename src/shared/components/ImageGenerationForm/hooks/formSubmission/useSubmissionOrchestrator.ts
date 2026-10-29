import { useCallback } from 'react';
import type { FormSubmissionEffects, GetTaskParams } from './types';
import type { RunIncomingTask } from './useIncomingTaskRunner';
import type { SubmissionRuntimeContext } from './submissionContext';
import { queuePromptGenerationTask } from './queuePromptGenerationTask';

interface SubmissionOrchestratorEffects {
  automatedSubmitButton: FormSubmissionEffects['automatedSubmitButton'];
  onGenerate: FormSubmissionEffects['onGenerate'];
  getTaskParams: GetTaskParams;
  runIncomingTask: RunIncomingTask;
}

interface UseSubmissionOrchestratorInput {
  context: SubmissionRuntimeContext;
  effects: SubmissionOrchestratorEffects;
}

export interface SubmissionOrchestratorCommands {
  submitManaged: () => void;
}

export function useSubmissionOrchestrator(
  input: UseSubmissionOrchestratorInput,
): SubmissionOrchestratorCommands {
  const { context, effects } = input;
  const { prompts, imagesPerPrompt, actionablePromptsCount } = context;
  const {
    automatedSubmitButton,
    onGenerate,
    getTaskParams,
    runIncomingTask,
  } = effects;

  const queueIncomingTask = useCallback((options: Parameters<RunIncomingTask>[0]) => {
    automatedSubmitButton.trigger();
    runIncomingTask(options);
  }, [automatedSubmitButton, runIncomingTask]);

  const submitManaged = useCallback(() => {
    queuePromptGenerationTask({
      prompts,
      expectedCount: actionablePromptsCount * imagesPerPrompt,
      context: 'useFormSubmission.submitManaged',
      toastTitle: 'Failed to create tasks. Please try again.',
      getTaskParams,
      onGenerate,
      queueIncomingTask,
    });
  }, [
    actionablePromptsCount,
    getTaskParams,
    imagesPerPrompt,
    onGenerate,
    prompts,
    queueIncomingTask,
  ]);

  return { submitManaged };
}
