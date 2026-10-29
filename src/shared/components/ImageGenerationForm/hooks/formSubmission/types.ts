import type { FormEvent, MutableRefObject } from 'react';
import type { ActiveLora } from '@/domains/lora/types/lora';
import type { BatchImageGenerationTaskParams } from '@/shared/types/imageGeneration';
import type {
  GenerationSource,
  HiresFixConfig,
  PromptEntry,
  ReferenceMode,
  TextToImageModel,
} from '../../types';

export interface FormSubmissionFormState {
  selectedProjectId: string | undefined;
  prompts: PromptEntry[];
  imagesPerPrompt: number;
  associatedShotId: string | null;
  currentBeforePromptText: string;
  currentAfterPromptText: string;
  styleBoostTerms: string;
  isLocalGenerationEnabled: boolean;
  hiresFixConfig: HiresFixConfig;
  projectResolution?: string;
  actionablePromptsCount: number;
}

export interface FormSubmissionPromptConfig {
  generationSourceRef: MutableRefObject<GenerationSource>;
  selectedTextModelRef: MutableRefObject<TextToImageModel>;
  selectedLoras: ActiveLora[];
  styleReferenceImageGeneration: string | null;
  styleReferenceStrength: number;
  subjectStrength: number;
  effectiveSubjectDescription: string;
  inThisScene: boolean;
  inThisSceneStrength: number;
  referenceMode: ReferenceMode;
}

export interface FormSubmissionEffects {
  onGenerate: (params: BatchImageGenerationTaskParams) => Promise<string[] | void> | string[] | void;
  automatedSubmitButton: {
    trigger: () => void;
    isSubmitting: boolean;
    isSuccess: boolean;
  };
}

export interface UseFormSubmissionProps {
  formState: FormSubmissionFormState;
  promptConfig: FormSubmissionPromptConfig;
  effects: FormSubmissionEffects;
}

export interface UseFormSubmissionReturn {
  handleSubmit: (e: FormEvent) => Promise<void>;
}

export type GetTaskParams = (
  promptsToUse: PromptEntry[],
) => BatchImageGenerationTaskParams | null;
