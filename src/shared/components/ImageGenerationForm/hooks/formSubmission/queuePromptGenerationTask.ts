import type { PromptEntry } from '../../types';
import type { FormSubmissionEffects, GetTaskParams } from './types';
import type { RunIncomingTask } from './useIncomingTaskRunner';
import { truncateLabel } from './promptSubmissionTransforms';

interface QueuePromptGenerationTaskInput {
  prompts: PromptEntry[];
  expectedCount: number;
  context: string;
  toastTitle: string;
  getTaskParams: GetTaskParams;
  onGenerate: FormSubmissionEffects['onGenerate'];
  queueIncomingTask: (options: Parameters<RunIncomingTask>[0]) => void;
}

export function queuePromptGenerationTask(input: QueuePromptGenerationTaskInput): void {
  const {
    prompts,
    expectedCount,
    context,
    toastTitle,
    getTaskParams,
    onGenerate,
    queueIncomingTask,
  } = input;

  const taskParams = getTaskParams(prompts);
  if (!taskParams) {
    return;
  }

  const firstPrompt = prompts.find((prompt) => prompt.fullPrompt.trim())?.fullPrompt || 'Generating...';
  queueIncomingTask({
    label: truncateLabel(firstPrompt),
    expectedCount,
    context,
    toastTitle,
    execute: async () => {
      const result = await onGenerate(taskParams);
      return result || undefined;
    },
  });
}
