/**
 * AdvancedSettingsSection Component
 *
 * The collapsible "Advanced Settings" area containing:
 * - Before/After prompt text fields
 * - Negative prompt
 * - Motion controls (MotionPresetSelector + selected LoRAs)
 * - Structure video section (delegated to StructureVideoSection)
 */

import React from 'react';
import { useAdvancedSettingsHandlers } from '../hooks/useAdvancedSettingsHandlers';
import { useAdvancedSettingsState } from '../hooks/useAdvancedSettingsState';
import { useSaveFieldAsDefault } from '../hooks/useSaveFieldAsDefault';
import { Button } from '@/shared/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { ChevronLeft } from 'lucide-react';
import {
  coerceSelectedModel,
  getModelSpec,
  resolveSelectedModelFromModelName,
} from '@/tools/travel-between-images/settings';
import { MotionPresetSection } from './MotionPresetSection';
import { StructureVideoSection } from './StructureVideoSection';
import { PromptFieldsSection } from './PromptFieldsSection';
import { NegativePromptField } from './NegativePromptField';
import type {
  SegmentSettings,
  SegmentSettingsFormProps,
  SegmentTimelineStructureVideoProps,
} from '../types';

interface AdvancedSettingsSectionProps {
  // Settings
  settings: SegmentSettings;
  onChange: (updates: Partial<SegmentSettings>) => void;
  modelName?: string;
  edgeExtendAmount: 4 | 6;

  defaults?: {
    shotDefaults?: SegmentSettingsFormProps['shotDefaults'];
    hasOverride?: SegmentSettingsFormProps['hasOverride'];
    onSaveFieldAsDefault?: SegmentSettingsFormProps['onSaveFieldAsDefault'];
  };
  structureVideo?: {
    type?: SegmentSettingsFormProps['structureVideoType'];
    url?: SegmentSettingsFormProps['structureVideoUrl'];
    frameRange?: SegmentSettingsFormProps['structureVideoFrameRange'];
    defaults?: SegmentSettingsFormProps['structureVideoDefaults'];
  } & SegmentTimelineStructureVideoProps;
}

export const AdvancedSettingsSection: React.FC<AdvancedSettingsSectionProps> = ({
  settings,
  onChange,
  modelName,
  edgeExtendAmount,
  defaults,
  structureVideo,
}) => {
  const shotDefaults = defaults?.shotDefaults;
  const hasOverride = defaults?.hasOverride;
  const onSaveFieldAsDefault = defaults?.onSaveFieldAsDefault;
  const {
    type: structureVideoType,
    url: structureVideoUrl,
    frameRange: structureVideoFrameRange,
    defaults: structureVideoDefaults,
    isTimelineMode,
    onRemoveSegmentStructureVideo,
  } = structureVideo ?? {};
  const {
    showAdvanced,
    setShowAdvanced,
    builtinPreset,
    effectiveLoras,
    isUsingMotionDefaults,
    isUsingLorasDefault,
  } = useAdvancedSettingsState({
    modelName,
    settings,
    shotDefaults,
  });

  const effectiveSelectedModel = coerceSelectedModel(
    settings.selectedModel ?? (modelName ? resolveSelectedModelFromModelName(modelName) : undefined)
  );
  const spec = getModelSpec(effectiveSelectedModel);

  const { savingField, handleSaveFieldAsDefault } = useSaveFieldAsDefault({
    onSaveFieldAsDefault,
    onChange,
  });
  const {
    handleMotionModeChange,
    handlePhaseConfigChange,
    handlePhasePresetSelect,
    handlePhasePresetRemove,
    handleRandomSeedChange,
    handleRemoveLora,
    handleLoraStrengthChange,
    handleModelChange,
  } = useAdvancedSettingsHandlers({
    onChange,
    settings,
    shotDefaults,
    effectiveLoras,
  });

  return (
    <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`w-full justify-between h-9 text-xs font-medium ${
            showAdvanced
              ? 'bg-muted text-foreground hover:bg-muted rounded-b-none'
              : 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
          }`}
        >
          <span>Advanced Settings</span>
          <ChevronLeft className={`w-3 h-3 transition-transform ${showAdvanced ? '-rotate-90' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className={edgeExtendAmount === 6 ? '-mx-6' : '-mx-4'}>
        <div className={`space-y-3 bg-muted/30 border-y border-border/50 ${edgeExtendAmount === 6 ? 'px-6 py-3' : 'px-4 py-3'}`}>
          <PromptFieldsSection
            settings={settings}
            onChange={onChange}
            shotDefaults={shotDefaults}
            hasOverride={hasOverride}
            onSaveFieldAsDefault={onSaveFieldAsDefault}
            handleSaveFieldAsDefault={handleSaveFieldAsDefault}
            savingField={savingField}
          />
          <NegativePromptField
            settings={settings}
            onChange={onChange}
            shotDefaults={shotDefaults}
            hasOverride={hasOverride}
            onSaveFieldAsDefault={onSaveFieldAsDefault}
            handleSaveFieldAsDefault={handleSaveFieldAsDefault}
            savingField={savingField}
          />

          {spec.supportsPhaseConfig && (
            <MotionPresetSection
              builtinPreset={builtinPreset}
              settings={settings}
              onChange={onChange}
              shotDefaults={shotDefaults}
              effectiveLoras={effectiveLoras}
              onMotionModeChange={handleMotionModeChange}
              onPhaseConfigChange={handlePhaseConfigChange}
              onPhasePresetSelect={handlePhasePresetSelect}
              onPhasePresetRemove={handlePhasePresetRemove}
              onRandomSeedChange={handleRandomSeedChange}
              onRemoveLora={handleRemoveLora}
              onLoraStrengthChange={handleLoraStrengthChange}
              onSaveFieldAsDefault={onSaveFieldAsDefault}
              handleSaveFieldAsDefault={handleSaveFieldAsDefault}
              savingField={savingField}
              isUsingMotionDefaults={isUsingMotionDefaults}
              isUsingLorasDefault={isUsingLorasDefault}
            />
          )}

          {/* Structure Video Section */}
          <StructureVideoSection
            structureVideoType={structureVideoType}
            structureVideoUrl={structureVideoUrl}
            structureVideoFrameRange={structureVideoFrameRange}
            structureVideoDefaults={structureVideoDefaults}
            settings={settings}
            onChange={onChange}
            shotDefaults={shotDefaults}
            hasOverride={hasOverride}
            isTimelineMode={isTimelineMode}
            onRemoveSegmentStructureVideo={onRemoveSegmentStructureVideo}
            onModelChange={handleModelChange}
            onSaveFieldAsDefault={onSaveFieldAsDefault}
            handleSaveFieldAsDefault={handleSaveFieldAsDefault}
            savingField={savingField}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
