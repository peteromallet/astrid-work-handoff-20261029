import type { GenerationRow } from '@/domains/generation/types';
import type { EditAdvancedSettings, QwenEditModel } from '../useGenerationEditSettings';
import type { PointerHandlersWithWheel } from '@/shared/types/pointerHandlers';
import {
  DEFAULT_IMAGE_TRANSFORM,
  decodeImageTransform,
  type ImageTransform,
} from '@/shared/lib/media/imageTransform';

export type { ImageTransform };
export { decodeImageTransform };

export const DEFAULT_TRANSFORM = DEFAULT_IMAGE_TRANSFORM;

export interface UseRepositionModeProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  shotId?: string;
  toolTypeOverride?: string;
  imageDimensions: { width: number; height: number } | null;
  imageContainerRef: React.RefObject<HTMLDivElement | null>;
  loras?: Array<{ url: string; strength: number }>;
  inpaintPrompt: string;
  inpaintNumGenerations: number;
  // Create as new generation instead of variant
  createAsGeneration?: boolean;
  // Advanced settings for hires fix
  advancedSettings?: EditAdvancedSettings;
  // Active variant's image URL - use this instead of media.url when editing a variant
  activeVariantLocation?: string | null;
  // Active variant ID - for tracking source_variant_id in task params
  activeVariantId?: string | null;
  // Active variant's params - for loading saved transform data
  activeVariantParams?: Record<string, unknown> | null;
  // Qwen edit model selection
  qwenEditModel?: QwenEditModel;
}

export interface UseRepositionModeReturn extends ImageTransformControls {
  transform: ImageTransform;
  hasTransformChanges: boolean;
  isGeneratingReposition: boolean;
  repositionGenerateSuccess: boolean;
  handleGenerateReposition: () => Promise<void>;

  // For rendering
  getTransformStyle: () => React.CSSProperties;

  // Drag-to-move + scroll/pinch-to-zoom handlers
  isDragging: boolean;
  dragHandlers: PointerHandlersWithWheel;
}

export interface ImageTransformControls {
  setTranslateX: (value: number) => void;
  setTranslateY: (value: number) => void;
  setScale: (value: number) => void;
  setRotation: (value: number) => void;
  toggleFlipH: () => void;
  toggleFlipV: () => void;
  resetTransform: () => void;
}
