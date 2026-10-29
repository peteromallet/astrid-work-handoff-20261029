import { cn } from '@/shared/components/ui/contracts/cn';

interface JoinClipsVisualizationInfoProps {
  actualTotal: number;
  quantizedTotal: number;
  shortestClipFrames?: number;
  minClipFramesRequired: number;
  replaceMode: boolean;
  gapFrames: number;
  contextFrames: number;
}

export function JoinClipsVisualizationInfo({
  actualTotal,
  quantizedTotal,
  shortestClipFrames,
  minClipFramesRequired,
  replaceMode,
  gapFrames,
  contextFrames,
}: JoinClipsVisualizationInfoProps) {
  return (
    <div className="text-xs text-muted-foreground">
      <span className="font-medium">Total generation:</span>{' '}
      <span className="font-mono font-medium">{actualTotal}</span> frames
      {quantizedTotal !== actualTotal && (
        <span className="text-muted-foreground/70"> → {quantizedTotal} (4N+1)</span>
      )}
      {shortestClipFrames && shortestClipFrames > 0 && (
        <>
          <span className="mx-2">•</span>
          {shortestClipFrames > 81 ? (
            <>
              <span className="font-medium">Constrained by max generation:</span>{' '}
              <span className="font-mono">81</span> frames
            </>
          ) : (
            <>
              <span className="font-medium">Constrained by shortest clip:</span>{' '}
              <span className="font-mono">{shortestClipFrames}</span> frames
            </>
          )}
          <span className="mx-2">•</span>
          <span className="font-medium">Min required:</span>{' '}
          <span
            className={cn(
              'font-mono',
              minClipFramesRequired > shortestClipFrames &&
                'text-red-600 dark:text-red-400',
              minClipFramesRequired > shortestClipFrames * 0.9 &&
                minClipFramesRequired <= shortestClipFrames &&
                'text-yellow-600 dark:text-yellow-400',
            )}
          >
            {minClipFramesRequired}
          </span>{' '}
          frames per clip
          {replaceMode && (
            <span className="text-muted-foreground/70 ml-1">
              ({gapFrames} gap + 2×{contextFrames} context)
            </span>
          )}
        </>
      )}
    </div>
  );
}
