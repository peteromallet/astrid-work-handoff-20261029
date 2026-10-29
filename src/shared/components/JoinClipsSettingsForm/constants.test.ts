import { describe, expect, it } from 'vitest';
import {
  BUILTIN_JOIN_CLIPS_DEFAULT_ID,
  BUILTIN_JOIN_CLIPS_PRESET,
  DEFAULT_JOIN_CLIPS_PHASE_CONFIG,
  JOIN_CLIPS_FEATURED_PRESET_IDS,
} from './constants';
import {
  BUILTIN_VACE_DEFAULT_ID,
  BUILTIN_VACE_PRESET,
  DEFAULT_VACE_PHASE_CONFIG,
  VACE_FEATURED_PRESET_IDS,
} from '@/shared/lib/vaceDefaults';

describe('JoinClipsSettingsForm constants', () => {
  it('re-exports shared VACE defaults unchanged', () => {
    expect(DEFAULT_JOIN_CLIPS_PHASE_CONFIG).toBe(DEFAULT_VACE_PHASE_CONFIG);
    expect(BUILTIN_JOIN_CLIPS_DEFAULT_ID).toBe(BUILTIN_VACE_DEFAULT_ID);
    expect(BUILTIN_JOIN_CLIPS_PRESET).toBe(BUILTIN_VACE_PRESET);
    expect(JOIN_CLIPS_FEATURED_PRESET_IDS).toBe(VACE_FEATURED_PRESET_IDS);
  });
});
