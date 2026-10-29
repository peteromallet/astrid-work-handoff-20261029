import { DEFAULT_PHASE_CONFIG, DEFAULT_VACE_PHASE_CONFIG } from '../settings';
import type { MotionPresetOption } from './MotionControl.types';

export const BUILTIN_DEFAULT_I2V_ID = '__builtin_default_i2v__';
export const BUILTIN_DEFAULT_VACE_ID = '__builtin_default_vace__';

export const BUILTIN_I2V_PRESET: MotionPresetOption = {
  id: BUILTIN_DEFAULT_I2V_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard I2V generation',
    phaseConfig: DEFAULT_PHASE_CONFIG,
  },
};

export const BUILTIN_VACE_PRESET: MotionPresetOption = {
  id: BUILTIN_DEFAULT_VACE_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard VACE generation with structure video',
    phaseConfig: DEFAULT_VACE_PHASE_CONFIG,
  },
};
