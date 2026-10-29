import { GenerationRow } from '@/domains/generation/types';

export type SegmentSlot =
  | {
    type: 'child';
    child: GenerationRow;
    index: number;
    pairShotGenerationId?: string;
  }
  | {
    type: 'placeholder';
    index: number;
    expectedFrames?: number;
    expectedPrompt?: string;
    startImage?: string;
    endImage?: string;
    pairShotGenerationId?: string;
  };

export interface ExpectedSegmentData {
  count: number;
  frames: number[];
  prompts: string[];
  inputImages: string[];
  inputImageGenIds: string[];
  pairShotGenIds: string[];
}

export interface RawGenerationDbRow {
  id: string;
  generation_id?: string | null;
  variant_fetch_generation_id?: string | null;
  location?: string | null;
  thumbnail_url?: string | null;
  type?: string | null;
  created_at?: string;
  updated_at?: string | null;
  params?: Record<string, unknown> | null;
  parent_generation_id?: string | null;
  child_order?: number | null;
  starred?: boolean;
  pair_shot_generation_id?: string | null;
  primary_variant_id?: string | null;
}

export interface LiveTimelineRow {
  id: string;
  generation_id: string;
  timeline_frame: number;
}
