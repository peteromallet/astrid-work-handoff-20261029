import React from 'react';
import { Button } from '@/shared/components/ui/button';

interface ZoomControlsProps {
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomToStart: () => void;
  hasNoImages?: boolean;
}

/** Zoom controls overlay for the timeline */
export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomToStart,
  hasNoImages = false,
}) => {
  return (
    <div className={`flex items-center gap-2 w-fit pointer-events-auto bg-background/95 backdrop-blur-sm px-2 py-1 rounded shadow-md border border-border/50 ${hasNoImages ? 'opacity-30 blur-[0.5px]' : ''}`}>
      <span className="text-xs text-muted-foreground">Zoom: {zoomLevel.toFixed(1)}x</span>
      <Button
        variant="outline"
        size="sm"
        onClick={onZoomToStart}
        className="h-7 text-xs px-2"
      >
        ← Start
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onZoomOut}
        disabled={zoomLevel <= 1}
        className="h-7 w-7 p-0"
      >
        −
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onZoomIn}
        className="h-7 w-7 p-0"
      >
        +
      </Button>
      <Button
        variant={zoomLevel > 1.5 ? "default" : "outline"}
        size="sm"
        onClick={onZoomReset}
        disabled={zoomLevel <= 1}
        className={`h-7 text-xs px-2 transition-all ${
          zoomLevel > 3 ? 'animate-pulse ring-2 ring-primary' :
          zoomLevel > 1.5 ? 'ring-1 ring-primary/50' : ''
        }`}
        style={{
          transform: zoomLevel > 1.5 ? `scale(${Math.min(1 + (zoomLevel - 1.5) * 0.08, 1.3)})` : 'scale(1)',
        }}
      >
        Reset
      </Button>
    </div>
  );
};
