import type { GenerationDropData } from '@/shared/lib/dnd/dragDrop';

export interface NewShotDropHandlers {
  onGenerationDropForNewShot?: (data: GenerationDropData) => Promise<void>;
  onFilesDropForNewShot?: (files: File[]) => Promise<void>;
  onSkeletonSetupReady?: (setup: (imageCount: number) => void, clear: () => void) => void;
}
