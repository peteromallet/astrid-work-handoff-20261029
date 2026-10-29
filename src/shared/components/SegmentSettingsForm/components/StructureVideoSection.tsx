/**
 * StructureVideoSection Component
 *
 * Handles the structure video area within Advanced Settings:
 * - Video preview with remove when one exists
 * - Treatment selector and strength/end-percent sliders
 *
 * Only renders in timeline mode or when a structure video exists.
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/primitives/label';
import { Slider } from '@/shared/components/ui/slider';
import { Video, X } from 'lucide-react';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { FieldDefaultControls } from './FieldDefaultControls';
import { StructureVideoPreview } from './StructureVideoPreview';
import { TravelGuidanceEditor } from '@/shared/components/travel/TravelGuidanceEditor';
import type {
  SegmentFieldSectionProps,
  SegmentTimelineStructureVideoProps,
} from '../types';
import type { TravelGuidanceMode } from '@/shared/lib/tasks/travelGuidance';
import { coerceSelectedModel, getModelSpec, getInferenceStepRange, MODEL_DEFAULTS } from '@/tools/travel-between-images/settings';
import type { SelectedModel } from '@/tools/travel-between-images/settings';

interface StructureVideoSectionProps
  extends SegmentFieldSectionProps,
    SegmentTimelineStructureVideoProps {
  // Structure video context
  structureVideoType?: TravelGuidanceMode | null;
  structureVideoUrl?: string;
  structureVideoFrameRange?: {
    segmentStart: number;
    segmentEnd: number;
    videoTotalFrames: number;
    videoFps: number;
    videoOutputStart?: number;
    videoOutputEnd?: number;
  };
  structureVideoDefaults?: {
    mode?: TravelGuidanceMode;
    motionStrength: number;
    treatment: 'adjust' | 'clip';
    uni3cEndPercent: number;
    cannyIntensity?: number;
    depthContrast?: number;
  };

  // Model change handler (for distilled/full variant switching)
  onModelChange?: (model: SelectedModel) => void;
}

export const StructureVideoSection: React.FC<StructureVideoSectionProps> = ({
  structureVideoType,
  structureVideoUrl,
  structureVideoFrameRange,
  structureVideoDefaults,
  settings,
  onChange,
  shotDefaults,
  hasOverride,
  isTimelineMode,
  onRemoveSegmentStructureVideo,
  onModelChange,
  onSaveFieldAsDefault,
  handleSaveFieldAsDefault,
  savingField,
}) => {
  const effectiveSelectedModel = coerceSelectedModel(
    settings.selectedModel ?? shotDefaults?.selectedModel,
  );
  const spec = getModelSpec(effectiveSelectedModel);
  const isLtxSelected = spec.modelFamily === 'ltx';
  const modelDefaults = MODEL_DEFAULTS[effectiveSelectedModel];
  const stepRange = getInferenceStepRange(effectiveSelectedModel);
  const effectiveGuidanceScale = settings.guidanceScale ?? shotDefaults?.guidanceScale ?? 1;

  const fieldControls = {
    selectedModel: (
      <FieldDefaultControls
        isUsingDefault={settings.selectedModel === undefined}
        onUseDefault={() => onChange({ selectedModel: undefined })}
        onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
          'selectedModel',
          effectiveSelectedModel,
        ) : undefined}
        isSaving={savingField === 'selectedModel'}
      />
    ),
    guidanceScale: (
      <FieldDefaultControls
        isUsingDefault={settings.guidanceScale === undefined}
        onUseDefault={() => onChange({ guidanceScale: undefined })}
        onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
          'guidanceScale',
          effectiveGuidanceScale,
        ) : undefined}
        isSaving={savingField === 'guidanceScale'}
      />
    ),
    guidanceMode: (
      <FieldDefaultControls
        isUsingDefault={settings.guidanceMode === undefined}
        onUseDefault={() => onChange({ guidanceMode: undefined })}
        onSetAsDefault={onSaveFieldAsDefault && structureVideoType ? () => handleSaveFieldAsDefault(
          'guidanceMode',
          settings.guidanceMode ?? structureVideoDefaults?.mode ?? structureVideoType,
        ) : undefined}
        isSaving={savingField === 'guidanceMode'}
      />
    ),
    guidanceTreatment: (
      <FieldDefaultControls
        isUsingDefault={settings.guidanceTreatment === undefined}
        onUseDefault={() => onChange({ guidanceTreatment: undefined })}
        onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
          'guidanceTreatment',
          settings.guidanceTreatment ?? structureVideoDefaults?.treatment ?? 'adjust',
        ) : undefined}
        isSaving={savingField === 'guidanceTreatment'}
      />
    ),
    guidanceStrength: (
      <FieldDefaultControls
        isUsingDefault={settings.guidanceStrength === undefined}
        onUseDefault={() => onChange({ guidanceStrength: undefined })}
        onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
          'guidanceStrength',
          settings.guidanceStrength ?? structureVideoDefaults?.motionStrength ?? 1.2,
        ) : undefined}
        isSaving={savingField === 'guidanceStrength'}
      />
    ),
    guidanceUni3cEndPercent: (
      <FieldDefaultControls
        isUsingDefault={settings.guidanceUni3cEndPercent === undefined}
        onUseDefault={() => onChange({ guidanceUni3cEndPercent: undefined })}
        onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
          'guidanceUni3cEndPercent',
          settings.guidanceUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1,
        ) : undefined}
        isSaving={savingField === 'guidanceUni3cEndPercent'}
      />
    ),
    guidanceCannyIntensity: (
      <FieldDefaultControls
        isUsingDefault={settings.guidanceCannyIntensity === undefined}
        onUseDefault={() => onChange({ guidanceCannyIntensity: undefined })}
        onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
          'guidanceCannyIntensity',
          settings.guidanceCannyIntensity ?? structureVideoDefaults?.cannyIntensity ?? 1,
        ) : undefined}
        isSaving={savingField === 'guidanceCannyIntensity'}
      />
    ),
    guidanceDepthContrast: (
      <FieldDefaultControls
        isUsingDefault={settings.guidanceDepthContrast === undefined}
        onUseDefault={() => onChange({ guidanceDepthContrast: undefined })}
        onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
          'guidanceDepthContrast',
          settings.guidanceDepthContrast ?? structureVideoDefaults?.depthContrast ?? 1,
        ) : undefined}
        isSaving={savingField === 'guidanceDepthContrast'}
      />
    ),
  } as const;

  return (
    <>
      <div className="space-y-3 pt-3 border-t border-border/50">
        {/* Structure Video Overrides - shown when segment has structure video */}
        {structureVideoType ? (
          <>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Video className="w-3.5 h-3.5" />
              <span>Structure Video {isTimelineMode ? '' : 'Overrides'}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/80">
                {structureVideoType === 'uni3c'
                  ? 'Uni3C'
                  : structureVideoType === 'flow'
                    ? 'Optical Flow'
                    : structureVideoType === 'raw'
                      ? 'Raw Video'
                      : structureVideoType === 'video'
                        ? 'Video Guide'
                        : structureVideoType === 'pose'
                          ? 'Pose'
                          : structureVideoType === 'canny'
                            ? 'Canny'
                            : structureVideoType === 'depth'
                              ? 'Depth'
                              : structureVideoType}
              </span>
            </div>

            {/* 3-Frame Preview with Remove button overlay */}
            {structureVideoUrl && structureVideoFrameRange ? (
              <div className="relative">
                {isTimelineMode && onRemoveSegmentStructureVideo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveSegmentStructureVideo();
                    }}
                    onTouchEnd={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onRemoveSegmentStructureVideo();
                    }}
                    className="absolute -top-1 -right-1 z-10 h-6 w-6 p-0 rounded-full bg-background/80 hover:bg-destructive/20 text-destructive hover:text-destructive"
                    title="Remove video"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
                <StructureVideoPreview
                  videoUrl={structureVideoUrl}
                  frameRange={structureVideoFrameRange}
                  treatment={settings.guidanceTreatment ?? structureVideoDefaults?.treatment ?? 'adjust'}
                />
              </div>
            ) : null}
          </>
        ) : null}

      </div>

      {/* Inference Steps + Distilled/Full variant (LTX models only) */}
      {isLtxSelected && (
        <div className="flex gap-3 items-end">
          {onModelChange && (
            <div className="flex rounded-lg border border-border overflow-hidden self-stretch">
              <button
                type="button"
                onClick={() => onModelChange('ltx-2.3-fast')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  spec.id === 'ltx-2.3-fast'
                    ? 'bg-muted text-foreground'
                    : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                Distilled
              </button>
              <button
                type="button"
                onClick={() => onModelChange('ltx-2.3')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  spec.id === 'ltx-2.3'
                    ? 'bg-muted text-foreground'
                    : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                Full
              </button>
            </div>
          )}
          <div className="flex-1">
            <Label className="text-sm font-light block mb-1">
              Inference steps: {settings.inferenceSteps ?? modelDefaults.steps}
            </Label>
            <Slider
              min={stepRange.min}
              max={stepRange.max}
              step={1}
              value={settings.inferenceSteps ?? modelDefaults.steps}
              onValueChange={(value) => onChange({ inferenceSteps: Array.isArray(value) ? value[0] : value })}
            />
          </div>
        </div>
      )}

      <TravelGuidanceEditor
        selectedModel={effectiveSelectedModel}
        onSelectedModelChange={onModelChange ?? ((model) => onChange({ selectedModel: model }))}
        hasStructureVideo={!!structureVideoUrl}
        guidanceMode={settings.guidanceMode ?? structureVideoDefaults?.mode ?? structureVideoType ?? null}
        onGuidanceModeChange={(value) => onChange({ guidanceMode: value })}
        guidanceScale={effectiveGuidanceScale}
        onGuidanceScaleChange={(value) => onChange({ guidanceScale: value })}
        guidanceTreatment={settings.guidanceTreatment ?? structureVideoDefaults?.treatment ?? 'adjust'}
        onGuidanceTreatmentChange={(value) => onChange({ guidanceTreatment: value })}
        guidanceStrength={settings.guidanceStrength ?? structureVideoDefaults?.motionStrength ?? 1.2}
        onGuidanceStrengthChange={(value) => onChange({ guidanceStrength: value })}
        guidanceUni3cEndPercent={settings.guidanceUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1}
        onGuidanceUni3cEndPercentChange={(value) => onChange({ guidanceUni3cEndPercent: value })}
        guidanceCannyIntensity={settings.guidanceCannyIntensity ?? structureVideoDefaults?.cannyIntensity ?? 1}
        onGuidanceCannyIntensityChange={(value) => onChange({ guidanceCannyIntensity: value })}
        guidanceDepthContrast={settings.guidanceDepthContrast ?? structureVideoDefaults?.depthContrast ?? 1}
        onGuidanceDepthContrastChange={(value) => onChange({ guidanceDepthContrast: value })}
        fieldControls={fieldControls}
      />
    </>
  );
};
