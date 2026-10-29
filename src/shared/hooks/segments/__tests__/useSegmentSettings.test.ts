import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSegmentSettings } from '../useSegmentSettings';

const DEFAULTS = { prompt: '', negativePrompt: '', numFrames: 25 };

describe('useSegmentSettings', () => {
  it('returns the local-edit shape', () => {
    const { result } = renderHook(() =>
      useSegmentSettings({ pairShotGenerationId: 'pair-1', defaults: DEFAULTS }),
    );

    expect(result.current).toHaveProperty('settings');
    expect(result.current).toHaveProperty('updateSettings');
    expect(result.current).toHaveProperty('resetSettings');
    expect(result.current).toHaveProperty('getSettingsForTaskCreation');
    expect(result.current).toHaveProperty('isDirty');
    expect(result.current).toHaveProperty('hasOverride');
    expect(result.current).toHaveProperty('shotDefaults');
    expect(result.current).not.toHaveProperty('saveSettings');
    expect(result.current).not.toHaveProperty('saveAsShotDefaults');
    expect(result.current).not.toHaveProperty('saveFieldAsDefault');
  });

  it('starts from the caller defaults with nothing dirty', () => {
    const { result } = renderHook(() =>
      useSegmentSettings({
        pairShotGenerationId: 'pair-1',
        defaults: { prompt: 'p', negativePrompt: 'n', numFrames: 33, makePrimaryVariant: false },
      }),
    );

    expect(result.current.settings.prompt).toBe('p');
    expect(result.current.settings.negativePrompt).toBe('n');
    expect(result.current.settings.numFrames).toBe(33);
    expect(result.current.settings.makePrimaryVariant).toBe(false);
    expect(result.current.isDirty).toBe(false);
    expect(Object.values(result.current.hasOverride).some(Boolean)).toBe(false);
  });

  it('provides shot defaults with fallback values', () => {
    const { result } = renderHook(() =>
      useSegmentSettings({ pairShotGenerationId: 'pair-1', defaults: DEFAULTS }),
    );

    expect(result.current.shotDefaults).toEqual({
      prompt: '',
      negativePrompt: '',
      motionMode: 'basic',
      amountOfMotion: 50,
      phaseConfig: undefined,
      loras: [],
      selectedPhasePresetId: null,
      textBeforePrompts: '',
      textAfterPrompts: '',
      selectedModel: 'wan-2.2',
      inferenceSteps: undefined,
      guidanceScale: undefined,
      guidanceMode: undefined,
      guidanceStrength: undefined,
      guidanceTreatment: undefined,
      guidanceUni3cEndPercent: undefined,
      guidanceCannyIntensity: undefined,
      guidanceDepthContrast: undefined,
      smoothContinuations: false,
      generationTypeMode: 'i2v',
    });
  });

  it('tracks local edits as overrides and resets them', () => {
    const { result } = renderHook(() =>
      useSegmentSettings({ pairShotGenerationId: 'pair-1', defaults: DEFAULTS }),
    );

    act(() => {
      result.current.updateSettings({ prompt: 'edited' });
    });
    expect(result.current.settings.prompt).toBe('edited');
    expect(result.current.isDirty).toBe(true);
    expect(result.current.hasOverride.prompt).toBe(true);
    expect(result.current.hasOverride.negativePrompt).toBe(false);

    act(() => {
      result.current.resetSettings();
    });
    expect(result.current.settings.prompt).toBe('');
    expect(result.current.isDirty).toBe(false);
  });

  it('discards local edits when the pair changes', () => {
    const { result, rerender } = renderHook(
      ({ pairId }: { pairId: string }) =>
        useSegmentSettings({ pairShotGenerationId: pairId, defaults: DEFAULTS }),
      { initialProps: { pairId: 'pair-1' } },
    );

    act(() => {
      result.current.updateSettings({ prompt: 'edited' });
    });
    expect(result.current.isDirty).toBe(true);

    rerender({ pairId: 'pair-2' });
    expect(result.current.isDirty).toBe(false);
  });

  it('clears the phase config when switching to basic mode without a preset', () => {
    const { result } = renderHook(() =>
      useSegmentSettings({ pairShotGenerationId: 'pair-1', defaults: DEFAULTS }),
    );

    act(() => {
      result.current.updateSettings({ motionMode: 'advanced', phaseConfig: { phases: [] } as never });
    });
    expect(result.current.settings.phaseConfig).toBeDefined();

    act(() => {
      result.current.updateSettings({ motionMode: 'basic' });
    });
    expect(result.current.settings.phaseConfig).toBeUndefined();
  });

  it('resolves structure defaults from the locally selected model', () => {
    const { result } = renderHook(() =>
      useSegmentSettings({
        pairShotGenerationId: 'pair-1',
        defaults: { prompt: '', negativePrompt: '' },
        structureVideoDefaultsByModel: {
          'wan-2.2': {
            mode: 'flow',
            motionStrength: 1.2,
            treatment: 'adjust',
            uni3cEndPercent: 0.1,
          },
          'ltx-2.3-fast': {
            mode: 'video',
            motionStrength: 0.6,
            treatment: 'clip',
            uni3cEndPercent: 0.25,
          },
        },
      }),
    );

    expect(result.current.shotDefaults.guidanceMode).toBe('flow');
    expect(result.current.shotDefaults.guidanceStrength).toBe(1.2);

    act(() => {
      result.current.updateSettings({ selectedModel: 'ltx-2.3-fast' });
    });
    expect(result.current.shotDefaults.guidanceMode).toBe('video');
    expect(result.current.shotDefaults.guidanceStrength).toBe(0.6);
    expect(result.current.shotDefaults.guidanceTreatment).toBe('clip');
  });

  it('getSettingsForTaskCreation merges with shot defaults', () => {
    const { result } = renderHook(() =>
      useSegmentSettings({
        pairShotGenerationId: 'pair-1',
        defaults: DEFAULTS,
        structureVideoDefaults: {
          mode: 'flow',
          motionStrength: 0.9,
          treatment: 'adjust',
          uni3cEndPercent: 0.3,
        },
      }),
    );

    const taskSettings = result.current.getSettingsForTaskCreation();

    expect(taskSettings.motionMode).toBe('basic');
    expect(taskSettings.amountOfMotion).toBe(50);
    expect(taskSettings.numFrames).toBe(25);
    expect(taskSettings.randomSeed).toBe(true);
    expect(taskSettings.makePrimaryVariant).toBe(true);
    expect(taskSettings.selectedModel).toBe('wan-2.2');
    expect(taskSettings.guidanceStrength).toBe(0.9);
  });
});
