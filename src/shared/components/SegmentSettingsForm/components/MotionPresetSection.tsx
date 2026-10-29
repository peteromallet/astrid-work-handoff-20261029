import { MotionPresetSelector } from '@/shared/components/MotionPresetSelector';
import { ActiveLoRAsDisplay } from '@/domains/lora/components';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { SegmentSettings, SegmentSettingsFormProps } from '@/shared/components/SegmentSettingsForm/types';
import { FieldDefaultControls } from '@/shared/components/SegmentSettingsForm/components/FieldDefaultControls';

interface MotionPresetSectionProps {
  builtinPreset: { id: string; metadata: { phaseConfig: PhaseConfig; name: string; description: string; generationTypeMode: 'i2v' | 'vace' } };
  settings: SegmentSettings;
  onChange: (updates: Partial<SegmentSettings>) => void;
  shotDefaults?: SegmentSettingsFormProps['shotDefaults'];
  effectiveLoras: NonNullable<SegmentSettings['loras']>;
  onMotionModeChange: (mode: 'basic' | 'advanced') => void;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onPhasePresetSelect: (presetId: string, config: PhaseConfig) => void;
  onPhasePresetRemove: () => void;
  onRandomSeedChange: (value: boolean) => void;
  onRemoveLora: (loraId: string) => void;
  onLoraStrengthChange: (loraId: string, strength: number) => void;
  onSaveFieldAsDefault?: SegmentSettingsFormProps['onSaveFieldAsDefault'];
  handleSaveFieldAsDefault: (field: keyof SegmentSettings, value: SegmentSettings[keyof SegmentSettings]) => Promise<void>;
  savingField: string | null;
  isUsingMotionDefaults: boolean;
  isUsingLorasDefault: boolean;
}

export function MotionPresetSection({
  builtinPreset,
  settings,
  onChange,
  shotDefaults,
  effectiveLoras,
  onMotionModeChange,
  onPhaseConfigChange,
  onPhasePresetSelect,
  onPhasePresetRemove,
  onRandomSeedChange,
  onRemoveLora,
  onLoraStrengthChange,
  onSaveFieldAsDefault,
  handleSaveFieldAsDefault,
  savingField,
  isUsingMotionDefaults,
  isUsingLorasDefault,
}: MotionPresetSectionProps) {
  return (
    <MotionPresetSelector
      builtinPreset={builtinPreset}
      selectedPhasePresetId={settings.selectedPhasePresetId ?? shotDefaults?.selectedPhasePresetId ?? null}
      phaseConfig={settings.phaseConfig ?? shotDefaults?.phaseConfig ?? builtinPreset.metadata.phaseConfig}
      motionMode={settings.motionMode ?? shotDefaults?.motionMode ?? 'basic'}
      onPresetSelect={onPhasePresetSelect}
      onPresetRemove={onPhasePresetRemove}
      onModeChange={onMotionModeChange}
      onPhaseConfigChange={onPhaseConfigChange}
      randomSeed={settings.randomSeed}
      onRandomSeedChange={onRandomSeedChange}
      labelSuffix={
        <FieldDefaultControls
          isUsingDefault={isUsingMotionDefaults}
          onUseDefault={() =>
            onChange({
              motionMode: undefined,
              phaseConfig: undefined,
              selectedPhasePresetId: undefined,
            })
          }
          onSetAsDefault={
            onSaveFieldAsDefault
              ? async () => {
                  await handleSaveFieldAsDefault(
                    'motionMode',
                    settings.motionMode ?? shotDefaults?.motionMode ?? 'basic'
                  );
                  await handleSaveFieldAsDefault(
                    'phaseConfig',
                    settings.phaseConfig ?? shotDefaults?.phaseConfig
                  );
                  await handleSaveFieldAsDefault(
                    'selectedPhasePresetId',
                    settings.selectedPhasePresetId ??
                      shotDefaults?.selectedPhasePresetId ??
                      null
                  );
                }
              : undefined
          }
          isSaving={
            savingField === 'motionMode' ||
            savingField === 'phaseConfig' ||
            savingField === 'selectedPhasePresetId'
          }
        />
      }
      renderBasicModeContent={() => (
        <div className="space-y-3">
          <div className="relative">
            <ActiveLoRAsDisplay
              selectedLoras={effectiveLoras}
              onRemoveLora={onRemoveLora}
              onLoraStrengthChange={onLoraStrengthChange}
            />
            <div className="absolute -top-1 -right-1 z-10">
              <FieldDefaultControls
                isUsingDefault={isUsingLorasDefault}
                onUseDefault={() =>
                  onChange({
                    loras: undefined,
                    motionMode: undefined,
                    phaseConfig: undefined,
                    selectedPhasePresetId: undefined,
                  })
                }
                onSetAsDefault={
                  onSaveFieldAsDefault
                    ? async () => {
                        await handleSaveFieldAsDefault('loras', effectiveLoras);
                        await handleSaveFieldAsDefault('motionMode', 'basic');
                      }
                    : undefined
                }
                isSaving={
                  savingField === 'loras' || savingField === 'motionMode'
                }
              />
            </div>
          </div>
        </div>
      )}
    />
  );
}
