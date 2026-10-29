import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip';
import type { ClipFrameCalculations } from '@/shared/components/JoinClipsSettingsForm/lib/clipFrameCalculations';

interface ClipTimelineProps {
  gapFrames: number;
  contextFrames: number;
  replaceMode: boolean;
  keepBridgingImages: boolean;
  calculations: ClipFrameCalculations;
}

export function ClipTimeline({
  gapFrames,
  contextFrames,
  replaceMode,
  keepBridgingImages,
  calculations,
}: ClipTimelineProps) {
  const {
    totalFrames,
    anchor1Idx,
    anchor2Idx,
    clipAKeptFrames,
    clipBKeptFrames,
    totalGenerationFlex,
    contextFlex,
    clipAKeptFlex,
    clipBKeptFlex,
    generationWindowLeftPct,
    generationWindowWidthPct,
  } = calculations;

  const insertAnchor1Pct = gapFrames > 0 ? (anchor1Idx / gapFrames) * 100 : 0;
  const insertAnchor2Pct = gapFrames > 0 ? (anchor2Idx / gapFrames) * 100 : 0;

  return (
    <div className="flex-grow flex flex-col justify-center gap-6">
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-500/30 border border-blue-500/50" />
          <span>Clip A</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-green-500/30 border border-green-500/50" />
          <span>Clip B</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-yellow-500/30 border border-yellow-500/50" />
          <span>Generated</span>
        </div>
      </div>

      <div className="flex h-20 w-full rounded-md overflow-hidden border bg-background shadow-sm relative">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="bg-blue-500/30 border-r border-blue-500/50 relative group flex flex-col items-center justify-center cursor-help"
                style={{ flex: clipAKeptFlex }}
              >
                <span className="text-[9px] font-mono font-medium text-blue-700 dark:text-blue-300 opacity-70">
                  Clip A
                </span>
                {clipAKeptFrames !== null && (
                  <span className="text-[8px] font-mono text-blue-600 dark:text-blue-400 mt-0.5">
                    {clipAKeptFrames}
                  </span>
                )}
                <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs text-xs">
                {clipAKeptFrames !== null
                  ? `There are ${clipAKeptFrames} frames from Clip A that won't be included in the generation but will be re-attached afterwards.`
                  : "This portion of Clip A is not used in generation - it will be stitched back together with the generated frames in the final output."}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {replaceMode ? (
          <div
            className="flex flex-col items-center justify-center relative border-r border-yellow-500/50 z-20 overflow-hidden"
            style={{ flex: totalGenerationFlex }}
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-blue-500/30 cursor-help flex items-center justify-center"
                    style={{ width: `${(contextFrames / totalFrames) * 100}%` }}
                  >
                    <span className="text-[9px] font-mono font-medium text-blue-700 dark:text-blue-300 z-10">
                      {contextFrames}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">
                    {contextFrames} context frames from Clip A are fed into generation
                    to understand motion and maintain continuity. These will be
                    blended between the original and the new.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="absolute top-0 bottom-0 bg-blue-500/10 cursor-help"
                    style={{
                      left: `${(contextFrames / totalFrames) * 100}%`,
                      width: `${(gapFrames / 2 / totalFrames) * 100}%`,
                      backgroundImage:
                        'repeating-linear-gradient(45deg, hsl(var(--viz-yellow) / 0.2), hsl(var(--viz-yellow) / 0.2) 3px, hsl(var(--viz-blue) / 0.15) 3px, hsl(var(--viz-blue) / 0.15) 6px)',
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">
                    {Math.ceil(gapFrames / 2)} frames from Clip A will be replaced
                    with newly generated frames.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="absolute top-0 bottom-0 bg-green-500/10 cursor-help"
                    style={{
                      right: `${(contextFrames / totalFrames) * 100}%`,
                      width: `${(gapFrames / 2 / totalFrames) * 100}%`,
                      backgroundImage:
                        'repeating-linear-gradient(45deg, hsl(var(--viz-yellow) / 0.2), hsl(var(--viz-yellow) / 0.2) 3px, hsl(var(--viz-green) / 0.15) 3px, hsl(var(--viz-green) / 0.15) 6px)',
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">
                    {Math.floor(gapFrames / 2)} frames from Clip B will be replaced
                    with newly generated frames.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-green-500/30 cursor-help flex items-center justify-center"
                    style={{ width: `${(contextFrames / totalFrames) * 100}%` }}
                  >
                    <span className="text-[9px] font-mono font-medium text-green-700 dark:text-green-300 z-10">
                      {contextFrames}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">
                    {contextFrames} context frames from Clip B are fed into generation
                    to understand motion and maintain continuity.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div
              className="absolute top-0 bottom-0 w-px bg-blue-500/50 z-10"
              style={{ left: `${(contextFrames / totalFrames) * 100}%` }}
            />
            <div
              className="absolute top-0 bottom-0 w-px bg-green-500/50 z-10"
              style={{ right: `${(contextFrames / totalFrames) * 100}%` }}
            />

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center cursor-help z-10">
                    <span className="text-[10px] font-mono font-bold text-yellow-700 dark:text-yellow-300">
                      {gapFrames}
                    </span>
                    <span className="text-[8px] font-mono text-yellow-600 dark:text-yellow-400">
                      replaced
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">
                    {gapFrames} new frames will be generated to replace the seam
                    between clips, creating a smooth transition.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {keepBridgingImages && (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-20 cursor-help"
                        style={{ left: `${((contextFrames + anchor1Idx) / totalFrames) * 100}%` }}
                      >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500 border-2 border-white shadow-md" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-xs">
                        Anchor frame taken from the original Clip A video to stabilize
                        the generation.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-green-500 z-20 cursor-help"
                        style={{ left: `${((contextFrames + anchor2Idx) / totalFrames) * 100}%` }}
                      >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-500 border-2 border-white shadow-md" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-xs">
                        Anchor frame taken from the original Clip B video to stabilize
                        the generation.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
          </div>
        ) : (
          <>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="bg-blue-500/40 border-r border-blue-500/60 relative group flex items-center justify-center cursor-help"
                    style={{ flex: contextFlex }}
                  >
                    <span className="text-[9px] font-mono font-medium text-blue-700 dark:text-blue-300 z-10">
                      {contextFrames}
                    </span>
                    <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity z-0" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">
                    {contextFrames} context frames from Clip A are blended with the
                    generated frames to ensure smooth motion continuity.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="bg-yellow-500/30 flex flex-col items-center justify-center relative border-r border-yellow-500/50 z-20 cursor-help"
                    style={{ flex: totalGenerationFlex }}
                  >
                    <span className="text-[10px] font-mono font-bold text-yellow-700 dark:text-yellow-300 z-10">
                      {gapFrames}
                    </span>
                    <span className="text-[8px] font-mono text-yellow-600 dark:text-yellow-400 z-10">
                      generated
                    </span>

                    {keepBridgingImages && (
                      <>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-20 cursor-help"
                                style={{ left: `${insertAnchor1Pct}%` }}
                              >
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500 border-2 border-white shadow-md" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs text-xs">
                                Anchor: Last frame of Clip A inserted here to stabilize
                                the generation.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-green-500 z-20 cursor-help"
                                style={{ left: `${insertAnchor2Pct}%` }}
                              >
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-500 border-2 border-white shadow-md" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs text-xs">
                                Anchor: First frame of Clip B inserted here to stabilize
                                the generation.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">
                    {gapFrames} new frames will be generated and inserted between
                    the two clips to create a smooth transition.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="bg-green-500/40 border-r border-green-500/60 relative group flex items-center justify-center cursor-help"
                    style={{ flex: contextFlex }}
                  >
                    <span className="text-[9px] font-mono font-medium text-green-700 dark:text-green-300 z-10">
                      {contextFrames}
                    </span>
                    <div className="absolute inset-0 bg-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity z-0" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">
                    {contextFrames} context frames from Clip B are blended with the
                    generated frames to ensure smooth motion continuity.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="bg-green-500/30 relative group flex flex-col items-center justify-center cursor-help"
                style={{ flex: clipBKeptFlex }}
              >
                <span className="text-[9px] font-mono font-medium text-green-700 dark:text-green-300 opacity-70">
                  Clip B
                </span>
                {clipBKeptFrames !== null && (
                  <span className="text-[8px] font-mono text-green-600 dark:text-green-400 mt-0.5">
                    {clipBKeptFrames}
                  </span>
                )}
                <div className="absolute inset-0 bg-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs text-xs">
                {clipBKeptFrames !== null
                  ? `There are ${clipBKeptFrames} frames from Clip B that won't be included in the generation but will be re-attached afterwards.`
                  : 'This portion of Clip B is not used in generation - it will be stitched back together with the generated frames in the final output.'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="relative w-full h-8">
        <div
          className="absolute top-0 h-full flex flex-col items-center justify-start"
          style={{
            left: `${generationWindowLeftPct}%`,
            width: `${generationWindowWidthPct}%`,
          }}
        >
          <div className="w-full h-px bg-foreground/30" />
          <div className="absolute left-0 top-0 w-px h-3 bg-foreground/30" />
          <div className="absolute right-0 top-0 w-px h-3 bg-foreground/30" />
          <div className="mt-1 text-[9px] font-mono text-foreground/60 whitespace-nowrap">
            Generation Window: {totalFrames} frames
          </div>
        </div>
      </div>
    </div>
  );
}
