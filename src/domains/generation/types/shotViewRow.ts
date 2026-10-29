import type { GenerationRow } from './generationViewRow';
import type { PersistedShotRow } from './shot';

interface ShotViewModel {
  images?: GenerationRow[];
  imageCount?: number;
  positionedImageCount?: number;
  unpositionedImageCount?: number;
  hasUnpositionedImages?: boolean;
}

export type Shot = PersistedShotRow & ShotViewModel;
