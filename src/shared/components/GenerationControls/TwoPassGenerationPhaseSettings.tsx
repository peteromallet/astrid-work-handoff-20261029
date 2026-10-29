import React from 'react';
import { SliderWithValue } from '@/shared/components/ui/composed/slider-with-value';
import { Switch } from '@/shared/components/ui/switch';

interface TwoPassPhase1SettingsProps {
  baseSteps: number;
  lightningStrength: number;
  onBaseStepsChange: (value: number) => void;
  onLightningStrengthChange: (value: number) => void;
  disabled?: boolean;
}

export const TwoPassPhase1Settings: React.FC<TwoPassPhase1SettingsProps> = ({
  baseSteps,
  lightningStrength,
  onBaseStepsChange,
  onLightningStrengthChange,
  disabled = false,
}) => (
  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide">Phase 1</span>
      <span className="text-xs text-muted-foreground">Base Generation</span>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <SliderWithValue
        label="Steps"
        value={baseSteps}
        onChange={(value) => onBaseStepsChange(Math.round(value))}
        min={1}
        max={16}
        step={1}
        disabled={disabled}
        numberInputClassName="w-20"
      />
      <SliderWithValue
        label="Lightning LoRA"
        value={lightningStrength}
        onChange={onLightningStrengthChange}
        min={0}
        max={1.0}
        step={0.01}
        disabled={disabled}
        numberInputClassName="w-20"
      />
    </div>
  </div>
);

interface TwoPassPhase2SettingsProps {
  hiresSteps: number;
  hiresScale: number;
  hiresDenoise: number;
  lightningStrength: number;
  onHiresStepsChange: (value: number) => void;
  onHiresScaleChange: (value: number) => void;
  onHiresDenoiseChange: (value: number) => void;
  onLightningStrengthChange: (value: number) => void;
  disabled?: boolean;
  maxUpscale?: number;
  enabled?: boolean;
  showEnableToggle?: boolean;
  onEnabledChange?: (value: boolean) => void;
}

export const TwoPassPhase2Settings: React.FC<TwoPassPhase2SettingsProps> = ({
  hiresSteps,
  hiresScale,
  hiresDenoise,
  lightningStrength,
  onHiresStepsChange,
  onHiresScaleChange,
  onHiresDenoiseChange,
  onLightningStrengthChange,
  disabled = false,
  maxUpscale = 2.0,
  enabled = true,
  showEnableToggle = false,
  onEnabledChange,
}) => {
  const slidersDisabled = disabled || !enabled;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide">Phase 2</span>
          <span className="text-xs text-muted-foreground">Hires Refinement</span>
        </div>
        {showEnableToggle && onEnabledChange ? (
          <Switch
            size="sm"
            checked={enabled}
            onCheckedChange={onEnabledChange}
            disabled={disabled}
          />
        ) : null}
      </div>
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${enabled ? '' : 'opacity-50 pointer-events-none'}`}>
        <SliderWithValue
          label="Steps"
          value={hiresSteps}
          onChange={(value) => onHiresStepsChange(Math.round(value))}
          min={1}
          max={16}
          step={1}
          disabled={slidersDisabled}
          numberInputClassName="w-20"
        />
        <SliderWithValue
          label="Upscale Factor"
          value={hiresScale}
          onChange={onHiresScaleChange}
          min={1.0}
          max={maxUpscale}
          step={0.1}
          disabled={slidersDisabled}
          numberInputClassName="w-20"
        />
        <SliderWithValue
          label="Denoise"
          value={hiresDenoise}
          onChange={onHiresDenoiseChange}
          min={0.1}
          max={1.0}
          step={0.05}
          disabled={slidersDisabled}
          numberInputClassName="w-20"
        />
        <SliderWithValue
          label="Lightning LoRA"
          value={lightningStrength}
          onChange={onLightningStrengthChange}
          min={0}
          max={1.0}
          step={0.01}
          disabled={slidersDisabled}
          numberInputClassName="w-20"
        />
      </div>
    </div>
  );
};
