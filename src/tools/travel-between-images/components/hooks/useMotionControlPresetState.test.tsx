// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUILTIN_DEFAULT_I2V_ID,
  BUILTIN_DEFAULT_VACE_ID,
} from '../MotionControl.constants';

const mocks = vi.hoisted(() => ({
  usePresetAutoSelect: vi.fn(),
}));

vi.mock('../../hooks/settings/usePresetAutoSelect', () => ({
  usePresetAutoSelect: (...args: unknown[]) => mocks.usePresetAutoSelect(...args),
}));

import { useMotionControlPresetState } from './useMotionControlPresetState';

describe('useMotionControlPresetState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers the built-in preset and forwards selection actions', () => {
    const onPhasePresetSelect = vi.fn();
    const onPhasePresetRemove = vi.fn();
    const onMotionModeChange = vi.fn();

    const { result } = renderHook(() => useMotionControlPresetState({
      generationTypeMode: 'i2v',
      selectedPhasePresetId: BUILTIN_DEFAULT_I2V_ID,
      onPhasePresetSelect,
      onPhasePresetRemove,
      motionMode: 'basic',
      settingsLoading: false,
      onMotionModeChange,
    }));

    expect(result.current.builtinDefaultId).toBe(BUILTIN_DEFAULT_I2V_ID);
    expect(result.current.isCustomConfig).toBe(false);
    expect(result.current.allPresets.map((preset) => preset.id)).toEqual([BUILTIN_DEFAULT_I2V_ID]);
    expect(mocks.usePresetAutoSelect).toHaveBeenCalled();

    act(() => {
      result.current.handlePresetSelect(result.current.allPresets[0]);
      result.current.handleCustomClick();
    });

    expect(onPhasePresetSelect).toHaveBeenCalledWith(
      BUILTIN_DEFAULT_I2V_ID,
      result.current.allPresets[0].metadata.phaseConfig,
      result.current.allPresets[0].metadata,
    );
    expect(onPhasePresetRemove).toHaveBeenCalledTimes(1);
    expect(onMotionModeChange).toHaveBeenCalledWith('advanced');
  });

  it('uses the VACE builtin preset id', () => {
    const { result } = renderHook(() => useMotionControlPresetState({
      generationTypeMode: 'vace',
      selectedPhasePresetId: 'unknown-preset',
      onPhasePresetSelect: vi.fn(),
      onPhasePresetRemove: vi.fn(),
      motionMode: 'advanced',
      settingsLoading: false,
      onMotionModeChange: vi.fn(),
    }));

    expect(result.current.builtinDefaultId).toBe(BUILTIN_DEFAULT_VACE_ID);
  });

  it('keeps the built-in default visually selected without persisting it on canonical mount', () => {
    const onPhasePresetSelect = vi.fn();
    const { result } = renderHook(() => useMotionControlPresetState({
      generationTypeMode: 'i2v',
      selectedPhasePresetId: null,
      onPhasePresetSelect,
      onPhasePresetRemove: vi.fn(),
      motionMode: 'basic',
      settingsLoading: false,
      autoSelectDefaultPreset: false,
      onMotionModeChange: vi.fn(),
    }));

    expect(result.current.displaySelectedPhasePresetId).toBe(BUILTIN_DEFAULT_I2V_ID);
    expect(result.current.isCustomConfig).toBe(false);
    expect(mocks.usePresetAutoSelect).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    expect(onPhasePresetSelect).not.toHaveBeenCalled();

    act(() => result.current.handlePresetSelect(result.current.allPresets[0]));
    expect(onPhasePresetSelect).toHaveBeenCalledWith(
      BUILTIN_DEFAULT_I2V_ID,
      result.current.allPresets[0].metadata.phaseConfig,
      result.current.allPresets[0].metadata,
    );
  });
});
