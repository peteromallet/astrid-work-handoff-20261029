import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { JoinSegmentsSettings } from '@/tools/travel-between-images/hooks/settings/useJoinSegmentsSettings';

export interface JoinLoraManagerForTask {
  selectedLoras: Array<{
    id: string;
    path: string;
    strength: number;
    name?: string;
  }>;
}

export interface JoinSettingsForTask {
  prompt: string;
  negativePrompt: string;
  contextFrameCount: number;
  gapFrameCount: number;
  replaceMode: boolean;
  keepBridgingImages: boolean;
  enhancePrompt: boolean;
  model: string;
  numInferenceSteps: number;
  guidanceScale: number;
  seed: number;
  motionMode: 'basic' | 'advanced';
  phaseConfig?: PhaseConfig;
  selectedPhasePresetId?: string | null;
  randomSeed: boolean;
  updateField: <K extends keyof JoinSegmentsSettings>(field: K, value: JoinSegmentsSettings[K]) => void;
  updateFields: (fields: Partial<JoinSegmentsSettings>) => void;
}
