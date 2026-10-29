import type { FormSubmissionFormState } from './types';

export type SubmissionRuntimeContext = Pick<
  FormSubmissionFormState,
  'prompts' | 'imagesPerPrompt' | 'actionablePromptsCount'
>;
