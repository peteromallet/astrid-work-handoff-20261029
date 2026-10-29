/**
 * Preset Metadata Types
 *
 * Types for phase config preset resources and their associated metadata.
 * Used by PhaseConfigSelectorModal and preset browsing/creation flows.
 */

import type { PhaseConfig } from './phaseConfig';

/** Metadata stored on phase config preset resources */
export interface PresetMetadata {
  phase_config?: PhaseConfig;
  sample_generations?: PresetSampleGeneration[];
  description?: string;
  [key: string]: unknown;
}

/** A sample generation attached to a preset */
export interface PresetSampleGeneration {
  url: string;
  type: 'image' | 'video';
  is_primary?: boolean;
  thumbnail_url?: string;
}
