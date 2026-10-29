/**
 * PairData Type
 *
 * Shared data structure representing a pair of images in a timeline.
 * Used by SegmentSettingsModal, MediaLightbox, and ShotImageManager components.
 */

export interface PairData {
  index: number;
  frames: number;
  startFrame: number;
  endFrame: number;
  startImage: {
    id: string;           // shot_generation.id (used as startShotGenerationId)
    generationId?: string; // generation_id (used as startGenerationId)
    primaryVariantId?: string; // generation_variants.id of the primary variant
    url?: string;
    thumbUrl?: string;
    position: number;
  } | null;
  endImage: {
    id: string;           // shot_generation.id
    generationId?: string; // generation_id (used as endGenerationId)
    primaryVariantId?: string; // generation_variants.id of the primary variant
    url?: string;
    thumbUrl?: string;
    position: number;
  } | null;
}
