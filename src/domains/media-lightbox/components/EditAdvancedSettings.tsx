import React, { useCallback } from 'react';
import { CollapsibleSection } from '@/shared/components/ui/composed/collapsible-section';
import { SliderWithValue } from '@/shared/components/ui/composed/slider-with-value';
import { Switch } from '@/shared/components/ui/switch';
import { Label } from '@/shared/components/ui/primitives/label';
import { ResetHeaderAction } from '@/shared/components/GenerationControls/ResetHeaderAction';
import {
  TwoPassPhase1Settings,
  TwoPassPhase2Settings,
} from '@/shared/components/GenerationControls/TwoPassGenerationPhaseSettings';
import type { EditAdvancedSettings as EditAdvancedSettingsType } from '../model/editSettingsTypes';
import { DEFAULT_ADVANCED_SETTINGS } from '../model/editSettingsTypes';

interface EditAdvancedSettingsProps {
  /** Current advanced settings configuration */
  settings: EditAdvancedSettingsType;
  /** Callback when settings change */
  onSettingsChange: (updates: Partial<EditAdvancedSettingsType>) => void;
  /** Whether inputs should be disabled */
  disabled?: boolean;
  /** Whether running in local generation mode (shows steps slider) */
  isLocalGeneration?: boolean;
}

/**
 * Advanced settings panel for edit mode tasks (text edit, inpaint, annotate, reposition).
 * Controls two-pass generation quality settings similar to image generation.
 */
export const EditAdvancedSettings: React.FC<EditAdvancedSettingsProps> = ({
  settings,
  onSettingsChange,
  disabled = false,
  isLocalGeneration = false,
}) => {
  // Update a single field
  const updateField = <K extends keyof EditAdvancedSettingsType>(
    field: K,
    value: EditAdvancedSettingsType[K]
  ) => {
    onSettingsChange({ [field]: value });
  };

  // Reset to defaults
  const handleResetDefaults = useCallback(() => {
    onSettingsChange(DEFAULT_ADVANCED_SETTINGS);
  }, [onSettingsChange]);

  const resetButton = (
    <ResetHeaderAction disabled={disabled} onReset={handleResetDefaults} />
  );

  // Advanced settings only available in local mode (cloud mode doesn't support these settings)
  if (!isLocalGeneration) {
    return null;
  }

  return (
    <div className="space-y-4">
      <SliderWithValue
        label="Inference Steps"
        value={settings.num_inference_steps ?? DEFAULT_ADVANCED_SETTINGS.num_inference_steps}
        onChange={(v) => updateField('num_inference_steps', Math.round(v))}
        min={1}
        max={30}
        step={1}
        disabled={disabled}
        numberInputClassName="w-20"
      />

      <CollapsibleSection title="Advanced settings" headerAction={resetButton}>
        <div className="space-y-4">
          {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <Label htmlFor="advanced-enabled" className="text-sm font-medium">
            Enable two-pass generation
          </Label>
          <Switch
            id="advanced-enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) => updateField('enabled', checked)}
            disabled={disabled}
          />
        </div>

        {/* Settings only shown when enabled */}
        {settings.enabled && (
          <>
            <TwoPassPhase1Settings
              baseSteps={settings.base_steps}
              lightningStrength={settings.lightning_lora_strength_phase_1}
              onBaseStepsChange={(value) => updateField('base_steps', value)}
              onLightningStrengthChange={(value) => updateField('lightning_lora_strength_phase_1', value)}
              disabled={disabled}
            />
            <TwoPassPhase2Settings
              hiresSteps={settings.hires_steps}
              hiresScale={settings.hires_scale}
              hiresDenoise={settings.hires_denoise}
              lightningStrength={settings.lightning_lora_strength_phase_2}
              onHiresStepsChange={(value) => updateField('hires_steps', value)}
              onHiresScaleChange={(value) => updateField('hires_scale', value)}
              onHiresDenoiseChange={(value) => updateField('hires_denoise', value)}
              onLightningStrengthChange={(value) => updateField('lightning_lora_strength_phase_2', value)}
              disabled={disabled}
            />
          </>
        )}
        </div>
      </CollapsibleSection>
    </div>
  );
};
