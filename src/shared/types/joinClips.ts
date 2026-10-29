import { PhaseConfig } from '@/shared/types/phaseConfig';
import type { PathLoraConfig } from '@/domains/lora/types/lora';

export interface JoinClipDescriptor {
  url: string;
  name?: string;
}

interface JoinClipsPerJoinSettings {
  prompt?: string;
  gap_frame_count?: number;
  context_frame_count?: number;
  replace_mode?: boolean;
  model?: string;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  negative_prompt?: string;
  priority?: number;
  resolution?: [number, number];
  fps?: number;
  loras?: PathLoraConfig[];
}

interface PortionToRegenerate {
  start_frame: number;
  end_frame: number;
  start_time_seconds: number;
  end_time_seconds: number;
  frame_count: number;
}

interface JoinClipsModernClipSource {
  kind: 'clips';
  clips: JoinClipDescriptor[];
}

export type JoinClipsClipSource = JoinClipsModernClipSource;

export interface JoinClipsVideoEditConfig {
  source_video_url: string;
  source_video_fps?: number;
  source_video_duration?: number;
  source_video_total_frames?: number;
  portions_to_regenerate?: PortionToRegenerate[];
}

interface JoinClipsSharedTaskParams {
  project_id: string;
  shot_id?: string;
  per_join_settings?: JoinClipsPerJoinSettings[];
  run_id?: string;
  prompt?: string;
  context_frame_count?: number;
  gap_frame_count?: number;
  replace_mode?: boolean;
  keep_bridging_images?: boolean;
  enhance_prompt?: boolean;
  model?: string;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  resolution?: [number, number];
  fps?: number;
  negative_prompt?: string;
  priority?: number;
  loras?: PathLoraConfig[];
  phase_config?: PhaseConfig;
  motion_mode?: 'basic' | 'advanced';
  selected_phase_preset_id?: string | null;
  parent_generation_id?: string;
  tool_type?: string;
  use_input_video_resolution?: boolean;
  use_input_video_fps?: boolean;
  vid2vid_init_strength?: number;
  loop_first_clip?: boolean;
  based_on?: string;
  audio_url?: string;
}

export interface CanonicalJoinClipsTaskInput extends JoinClipsSharedTaskParams {
  mode: 'multi_clip' | 'video_edit';
  clip_source: JoinClipsClipSource;
  video_edit?: JoinClipsVideoEditConfig;
}
