import { useState } from 'react';
import { ChevronDown, Info, RotateCcw } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { cn } from '@/shared/components/ui/contracts/cn';
import { SectionHeader } from '@/shared/components/ImageGenerationForm/components/SectionHeader';
import { Label } from '@/shared/components/ui/primitives/label';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip';
import { Visualization } from '../Visualization';
import type { ClipPairInfo } from '../types';
import { JoinClipsVisualizationInfo } from './JoinClipsVisualizationInfo';

interface JoinClipsStructureSettingsProps {
  gapFrames: number;
  setGapFrames: (val: number) => void;
  contextFrames: number;
  replaceMode: boolean;
  setReplaceMode: (val: boolean) => void;
  keepBridgingImagesValue: boolean;
  setKeepBridgingImages?: (val: boolean) => void;
  showResolutionToggle: boolean;
  useInputVideoResolution?: boolean;
  setUseInputVideoResolution?: (val: boolean) => void;
  showFpsToggle: boolean;
  useInputVideoFps?: boolean;
  setUseInputVideoFps?: (val: boolean) => void;
  noisedInputVideo: number;
  setNoisedInputVideo?: (val: number) => void;
  maxGapFrames: number;
  maxContextFrames: number;
  handleContextFramesChange: (val: number) => void;
  sliderNumber: (value: number | readonly number[]) => number;
  clipPairs?: ClipPairInfo[];
  shortestClipFrames?: number;
  minClipFramesRequired: number;
  actualTotal: number;
  quantizedTotal: number;
  onRestoreDefaults?: () => void;
}

export function JoinClipsStructureSettings({
  gapFrames,
  setGapFrames,
  contextFrames,
  replaceMode,
  setReplaceMode,
  keepBridgingImagesValue,
  setKeepBridgingImages,
  showResolutionToggle,
  useInputVideoResolution,
  setUseInputVideoResolution,
  showFpsToggle,
  useInputVideoFps,
  setUseInputVideoFps,
  noisedInputVideo,
  setNoisedInputVideo,
  maxGapFrames,
  maxContextFrames,
  handleContextFramesChange,
  sliderNumber,
  clipPairs,
  shortestClipFrames,
  minClipFramesRequired,
  actualTotal,
  quantizedTotal,
  onRestoreDefaults,
}: JoinClipsStructureSettingsProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const showAdvanced = showResolutionToggle || showFpsToggle || !!setNoisedInputVideo;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title="Structure" theme="green" />
        {onRestoreDefaults && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRestoreDefaults}
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Restore Defaults
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-8">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="join-gap-frames" className="text-sm font-medium">
                  Gap Frames:
                </Label>
                <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                  {gapFrames}
                </span>
              </div>
              <Slider
                id="join-gap-frames"
                min={1}
                max={maxGapFrames}
                step={1}
                value={Math.min(Math.max(1, gapFrames), maxGapFrames)}
                onValueChange={(value) => {
                  setGapFrames(Math.min(sliderNumber(value), maxGapFrames));
                }}
                className="py-2"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="join-context-frames" className="text-sm font-medium">
                  Context Frames:
                </Label>
                <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                  {contextFrames}
                </span>
              </div>
              <Slider
                id="join-context-frames"
                min={4}
                max={maxContextFrames}
                step={1}
                value={Math.min(contextFrames, maxContextFrames)}
                onValueChange={(value) =>
                  handleContextFramesChange(Math.min(sliderNumber(value), maxContextFrames))
                }
                className="py-2"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between h-5">
                <Label className="text-sm font-medium">Transition Mode:</Label>
              </div>
              <div className="flex items-center justify-center gap-2 border rounded-lg p-2 bg-background/50">
                <span
                  className={cn(
                    'text-[10px] sm:text-xs transition-colors whitespace-nowrap',
                    !replaceMode ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  Insert
                </span>
                <Switch
                  id="join-replace-mode"
                  checked={replaceMode}
                  onCheckedChange={setReplaceMode}
                />
                <span
                  className={cn(
                    'text-[10px] sm:text-xs transition-colors whitespace-nowrap',
                    replaceMode ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  Replace
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between h-5">
                <Label
                  className={cn('text-sm font-medium', gapFrames <= 8 && 'text-muted-foreground')}
                >
                  Bridge Anchors:
                </Label>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        'flex items-center justify-center gap-2 border rounded-lg p-2 bg-background/50',
                        gapFrames <= 8 && 'opacity-50 cursor-not-allowed',
                      )}
                    >
                      <span
                        className={cn(
                          'text-[10px] sm:text-xs transition-colors whitespace-nowrap',
                          !keepBridgingImagesValue
                            ? 'font-medium text-foreground'
                            : 'text-muted-foreground',
                        )}
                      >
                        Off
                      </span>
                      <Switch
                        id="join-keep-bridge"
                        checked={gapFrames <= 8 ? false : keepBridgingImagesValue}
                        disabled={gapFrames <= 8}
                        onCheckedChange={(val) => {
                          setKeepBridgingImages?.(val);
                        }}
                      />
                      <span
                        className={cn(
                          'text-[10px] sm:text-xs transition-colors whitespace-nowrap',
                          keepBridgingImagesValue && gapFrames > 8
                            ? 'font-medium text-foreground'
                            : 'text-muted-foreground',
                        )}
                      >
                        On
                      </span>
                    </div>
                  </TooltipTrigger>
                  {gapFrames <= 8 && (
                    <TooltipContent>
                      <p className="max-w-xs text-xs">
                        Bridge anchors require more than 8 gap frames to have enough space for
                        anchor placement.
                      </p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>

            {showAdvanced && (
              <Collapsible
                open={isAdvancedOpen}
                onOpenChange={setIsAdvancedOpen}
                className="col-span-2"
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'w-full justify-between px-3 py-2 h-auto border-primary/30 text-primary hover:bg-primary/10 hover:text-primary',
                      isAdvancedOpen && 'rounded-b-none',
                    )}
                  >
                    <span className="text-xs font-medium">Advanced</span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform duration-200',
                        !isAdvancedOpen && 'rotate-90',
                      )}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border border-t-0 rounded-b-lg p-4 bg-muted/30">
                    <div className="grid grid-cols-2 gap-x-6">
                      {showResolutionToggle && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between h-5">
                            <Label className="text-sm font-medium">Output Resolution:</Label>
                          </div>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center justify-center gap-2 border rounded-lg p-2 bg-background/50">
                                  <span
                                    className={cn(
                                      'text-[10px] sm:text-xs transition-colors whitespace-nowrap',
                                      !useInputVideoResolution
                                        ? 'font-medium text-foreground'
                                        : 'text-muted-foreground',
                                    )}
                                  >
                                    Project
                                  </span>
                                  <Switch
                                    id="join-resolution-source"
                                    checked={useInputVideoResolution ?? false}
                                    onCheckedChange={(val) => {
                                      setUseInputVideoResolution?.(val);
                                    }}
                                  />
                                  <span
                                    className={cn(
                                      'text-[10px] sm:text-xs transition-colors whitespace-nowrap',
                                      useInputVideoResolution
                                        ? 'font-medium text-foreground'
                                        : 'text-muted-foreground',
                                    )}
                                  >
                                    Input
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs text-xs">
                                  Choose whether to use the project&apos;s aspect ratio or match
                                  the first input video&apos;s resolution.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      )}

                      {showFpsToggle && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between h-5">
                            <Label className="text-sm font-medium">Output FPS:</Label>
                          </div>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center justify-center gap-2 border rounded-lg p-2 bg-background/50">
                                  <span
                                    className={cn(
                                      'text-[10px] sm:text-xs transition-colors whitespace-nowrap',
                                      !useInputVideoFps
                                        ? 'font-medium text-foreground'
                                        : 'text-muted-foreground',
                                    )}
                                  >
                                    Project
                                  </span>
                                  <Switch
                                    id="join-fps-source"
                                    checked={useInputVideoFps ?? false}
                                    onCheckedChange={(val) => {
                                      setUseInputVideoFps?.(val);
                                    }}
                                  />
                                  <span
                                    className={cn(
                                      'text-[10px] sm:text-xs transition-colors whitespace-nowrap',
                                      useInputVideoFps
                                        ? 'font-medium text-foreground'
                                        : 'text-muted-foreground',
                                    )}
                                  >
                                    Input
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs text-xs">
                                  Choose whether to use the project&apos;s FPS (16 FPS) or keep the
                                  input video&apos;s original frame rate.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      )}

                      {setNoisedInputVideo && (
                        <div className="space-y-3 col-span-2 mt-4">
                          <div className="flex items-center justify-between">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Label className="text-sm font-medium flex items-center gap-1 cursor-help">
                                    Noised Input Video:
                                    <Info className="w-3 h-3 text-muted-foreground" />
                                  </Label>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs text-xs">
                                    Controls how much the original gap frames influence generation.
                                    Lower values preserve more of the original motion/structure;
                                    higher values allow more creative regeneration.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                              {noisedInputVideo.toFixed(2)}
                            </span>
                          </div>
                          <Slider
                            id="join-noised-input"
                            min={0}
                            max={1}
                            step={0.05}
                            value={noisedInputVideo}
                            onValueChange={(value) => setNoisedInputVideo(sliderNumber(value))}
                            className="py-2"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </div>

        <div className="h-full flex flex-col">
          <Visualization
            gapFrames={gapFrames}
            contextFrames={contextFrames}
            replaceMode={replaceMode}
            keepBridgingImages={keepBridgingImagesValue}
            clipPairs={clipPairs}
            infoContent={
              <JoinClipsVisualizationInfo
                actualTotal={actualTotal}
                quantizedTotal={quantizedTotal}
                shortestClipFrames={shortestClipFrames}
                minClipFramesRequired={minClipFramesRequired}
                replaceMode={replaceMode}
                gapFrames={gapFrames}
                contextFrames={contextFrames}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
