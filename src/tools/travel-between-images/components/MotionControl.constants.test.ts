import { describe, expect, it } from 'vitest';
import { DEFAULT_PHASE_CONFIG, DEFAULT_VACE_PHASE_CONFIG } from '../settings';
import {
  BUILTIN_DEFAULT_I2V_ID,
  BUILTIN_DEFAULT_VACE_ID,
  BUILTIN_I2V_PRESET,
  BUILTIN_VACE_PRESET,
} from './MotionControl.constants';

describe('MotionControl.constants', () => {
  it('exports builtin presets that stay aligned with the shared default configs', () => {
    expect(BUILTIN_DEFAULT_I2V_ID).toBe('__builtin_default_i2v__');
    expect(BUILTIN_DEFAULT_VACE_ID).toBe('__builtin_default_vace__');

    expect(BUILTIN_I2V_PRESET).toEqual({
      id: BUILTIN_DEFAULT_I2V_ID,
      metadata: {
        name: 'Basic',
        description: 'Standard I2V generation',
        phaseConfig: DEFAULT_PHASE_CONFIG,
      },
    });

    expect(BUILTIN_VACE_PRESET).toEqual({
      id: BUILTIN_DEFAULT_VACE_ID,
      metadata: {
        name: 'Basic',
        description: 'Standard VACE generation with structure video',
        phaseConfig: DEFAULT_VACE_PHASE_CONFIG,
      },
    });
  });
});
