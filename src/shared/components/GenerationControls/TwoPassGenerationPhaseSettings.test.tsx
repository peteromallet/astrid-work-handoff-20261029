// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResetHeaderAction } from './ResetHeaderAction';
import {
  TwoPassPhase1Settings,
  TwoPassPhase2Settings,
} from './TwoPassGenerationPhaseSettings';

describe('generation settings shared controls', () => {
  it('fires reset action on click and keyboard activation', () => {
    const onReset = vi.fn();
    render(<ResetHeaderAction onReset={onReset} />);

    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    fireEvent.keyDown(screen.getByRole('button', { name: /reset/i }), { key: 'Enter' });

    expect(onReset).toHaveBeenCalledTimes(2);
  });

  it('rounds phase-1 steps and passes lightning changes', () => {
    const onBaseStepsChange = vi.fn();
    const onLightningStrengthChange = vi.fn();
    render(
      <TwoPassPhase1Settings
        baseSteps={8}
        lightningStrength={0.9}
        onBaseStepsChange={onBaseStepsChange}
        onLightningStrengthChange={onLightningStrengthChange}
      />,
    );

    const [stepsInput, lightningInput] = screen.getAllByRole('textbox') as HTMLInputElement[];

    fireEvent.change(stepsInput, { target: { value: '7.8' } });
    fireEvent.change(lightningInput, { target: { value: '0.42' } });

    expect(onBaseStepsChange).toHaveBeenCalledWith(8);
    expect(onLightningStrengthChange).toHaveBeenCalledWith(0.42);
  });

  it('supports phase-2 toggle and disables sliders when disabled', () => {
    const onEnabledChange = vi.fn();
    render(
      <TwoPassPhase2Settings
        hiresSteps={8}
        hiresScale={1.1}
        hiresDenoise={0.55}
        lightningStrength={0.5}
        onHiresStepsChange={vi.fn()}
        onHiresScaleChange={vi.fn()}
        onHiresDenoiseChange={vi.fn()}
        onLightningStrengthChange={vi.fn()}
        showEnableToggle
        enabled={false}
        onEnabledChange={onEnabledChange}
      />,
    );

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    expect(onEnabledChange).toHaveBeenCalledWith(true);

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    expect(inputs.every((input) => input.disabled)).toBe(true);
  });
});
