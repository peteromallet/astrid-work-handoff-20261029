import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAdvancedSettingsHandlers } from '../useAdvancedSettingsHandlers';

function buildSettings(overrides: Record<string, unknown> = {}) {
  return {
    prompt: '',
    negativePrompt: '',
    motionMode: 'basic',
    amountOfMotion: 50,
    phaseConfig: undefined,
    selectedPhasePresetId: null,
    loras: [],
    numFrames: 61,
    randomSeed: true,
    makePrimaryVariant: false,
    ...overrides,
  };
}

describe('useAdvancedSettingsHandlers', () => {
  it('handles motion mode transitions and preset config updates', () => {
    const onChange = vi.fn();
    const shotPhaseConfig = {
      num_phases: 2,
      steps_per_phase: [3, 3],
      flow_shift: 5,
      sample_solver: 'euler',
      model_switch_phase: 1,
      phases: [
        { phase: 1, guidance_scale: 1, loras: [] },
        { phase: 2, guidance_scale: 1, loras: [] },
      ],
      mode: 'vace',
    };

    const { result } = renderHook(() =>
      useAdvancedSettingsHandlers({
        onChange,
        settings: buildSettings({ selectedPhasePresetId: null, phaseConfig: undefined }) as never,
        shotDefaults: { phaseConfig: shotPhaseConfig } as never,
        effectiveLoras: [],
      }),
    );

    act(() => {
      result.current.handleMotionModeChange('basic');
    });
    expect(onChange).toHaveBeenCalledWith({ motionMode: 'basic', phaseConfig: undefined });

    act(() => {
      result.current.handleMotionModeChange('advanced');
    });
    expect(onChange).toHaveBeenCalledWith({
      motionMode: 'advanced',
      phaseConfig: shotPhaseConfig,
    });

    act(() => {
      result.current.handlePhaseConfigChange(shotPhaseConfig as never);
    });
    expect(onChange).toHaveBeenLastCalledWith({
      phaseConfig: expect.not.objectContaining({ mode: expect.anything() }),
    });

    act(() => {
      result.current.handlePhasePresetSelect('preset-1', shotPhaseConfig as never);
    });
    expect(onChange).toHaveBeenLastCalledWith({
      selectedPhasePresetId: 'preset-1',
      phaseConfig: expect.not.objectContaining({ mode: expect.anything() }),
    });
  });

  it('removes phase preset with motion-mode-dependent phaseConfig reset', () => {
    const onChange = vi.fn();

    const { result: basicResult } = renderHook(() =>
      useAdvancedSettingsHandlers({
        onChange,
        settings: buildSettings({ motionMode: 'basic' }) as never,
        shotDefaults: undefined,
        effectiveLoras: [],
      }),
    );

    act(() => {
      basicResult.current.handlePhasePresetRemove();
    });
    expect(onChange).toHaveBeenCalledWith({
      selectedPhasePresetId: null,
      phaseConfig: undefined,
    });

    const { result: advancedResult } = renderHook(() =>
      useAdvancedSettingsHandlers({
        onChange,
        settings: buildSettings({ motionMode: 'advanced' }) as never,
        shotDefaults: undefined,
        effectiveLoras: [],
      }),
    );

    act(() => {
      advancedResult.current.handlePhasePresetRemove();
    });
    expect(onChange).toHaveBeenCalledWith({ selectedPhasePresetId: null });
  });

  it('forwards random seed changes', () => {
    const onChange = vi.fn();

    const { result } = renderHook(() =>
      useAdvancedSettingsHandlers({
        onChange,
        settings: buildSettings() as never,
        shotDefaults: undefined,
        effectiveLoras: [{ id: 'existing', name: 'Existing', path: '/existing', strength: 0.8 }],
      }),
    );

    act(() => {
      result.current.handleRandomSeedChange(false);
    });
    expect(onChange).toHaveBeenCalledWith({ randomSeed: false });
  });

  it('removes loras by id/path and updates lora strengths by id/path', () => {
    const onChange = vi.fn();
    const effectiveLoras = [
      { id: 'id-a', name: 'A', path: '/a', strength: 0.2 },
      { id: 'id-b', name: 'B', path: '/b', strength: 0.4 },
    ];

    const { result } = renderHook(() =>
      useAdvancedSettingsHandlers({
        onChange,
        settings: buildSettings() as never,
        shotDefaults: undefined,
        effectiveLoras,
      }),
    );

    act(() => {
      result.current.handleRemoveLora('id-a');
    });
    expect(onChange).toHaveBeenCalledWith({
      loras: [{ id: 'id-b', name: 'B', path: '/b', strength: 0.4 }],
    });

    act(() => {
      result.current.handleLoraStrengthChange('/b', 0.9);
    });
    expect(onChange).toHaveBeenCalledWith({
      loras: [
        { id: 'id-a', name: 'A', path: '/a', strength: 0.2 },
        { id: 'id-b', name: 'B', path: '/b', strength: 0.9 },
      ],
    });
  });
});
