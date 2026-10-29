import React from 'react';
import { createPortal } from 'react-dom';

interface GuidanceVideoStripPreviewPortalProps {
  hoverPosition: { x: number; y: number };
  isVisible: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  currentVideoFrame: number;
}

export const GuidanceVideoStripPreviewPortal: React.FC<GuidanceVideoStripPreviewPortalProps> = ({
  hoverPosition,
  isVisible,
  canvasRef,
  currentVideoFrame,
}) => {
  return createPortal(
    <div
      className="fixed pointer-events-none"
      style={{
        left: `${hoverPosition.x}px`,
        top: `${hoverPosition.y}px`,
        transform: 'translateX(-50%)',
        zIndex: 999999,
        display: isVisible ? 'block' : 'none',
      }}
    >
      <div className="bg-background border-2 border-primary rounded-lg shadow-2xl overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-32 h-auto block"
          style={{ imageRendering: 'auto' }}
        />
        <div className="px-2 py-1 bg-background/95 border-t border-primary/40">
          <span className="text-[10px] font-medium text-foreground">Frame {currentVideoFrame}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
};
