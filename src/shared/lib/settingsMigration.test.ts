import { describe, expect, it } from 'vitest';

import {
  readSegmentOverrides,
  readShotSettings,
} from './settingsMigration';

describe('settingsMigration', () => {
  it('decodes shot settings only when phase config and loras have valid shapes', () => {
    const settings = readShotSettings({
      prompt: 'travel',
      loras: [
        { id: 'lora-1', name: 'Cinematic', path: '/tmp/cinematic', strength: 0.8 },
        { broken: true },
      ],
      phaseConfig: {
        num_phases: 2,
        steps_per_phase: [3, 3],
        flow_shift: 5,
        sample_solver: 'euler',
        model_switch_phase: 1,
        phases: [
          {
            phase: 1,
            guidance_scale: 1,
            loras: [{ url: 'https://example.com/phase.safetensors', multiplier: '1.0' }],
          },
        ],
      },
    });

    expect(settings.prompt).toBe('travel');
    expect(settings.loras).toEqual([
      { id: 'lora-1', name: 'Cinematic', path: '/tmp/cinematic', strength: 0.8 },
    ]);
    expect(settings.phaseConfig).toEqual(expect.objectContaining({
      num_phases: 2,
      sample_solver: 'euler',
    }));
  });

  it('drops invalid segment override phase config payloads instead of casting them through', () => {
    const overrides = readSegmentOverrides({
      segmentOverrides: {
        phaseConfig: {
          num_phases: 'bad',
          steps_per_phase: [1, 2],
        },
        loras: [{ id: 'lora-1', path: '/tmp/lora' }],
      },
    });

    expect(overrides.phaseConfig).toBeUndefined();
    expect(overrides.loras).toEqual([]);
  });
});
