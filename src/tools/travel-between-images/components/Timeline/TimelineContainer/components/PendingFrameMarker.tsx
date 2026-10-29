import React from 'react';
import { TIMELINE_PADDING_OFFSET } from '../../constants';

interface PendingFrameMarkerProps {
  pendingFrame: number | null;
  fullMin: number;
  fullRange: number;
  containerWidth: number;
  imagesLength: number;
}

const PAIR_COLORS = ['bg-blue-300', 'bg-emerald-300', 'bg-purple-300', 'bg-orange-300', 'bg-rose-300', 'bg-teal-300'];

/** Vertical marker showing where a pending item will be placed */
export const PendingFrameMarker: React.FC<PendingFrameMarkerProps> = ({
  pendingFrame,
  fullMin,
  fullRange,
  containerWidth,
  imagesLength,
}) => {
  if (pendingFrame === null) return null;

  const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
  const pixelPos = TIMELINE_PADDING_OFFSET + ((pendingFrame - fullMin) / fullRange) * effectiveWidth;
  const leftPercent = (pixelPos / containerWidth) * 100;

  // Color matches the next pair color based on current item count
  const colorIndex = imagesLength % PAIR_COLORS.length;

  return (
    <div
      className={`absolute top-0 bottom-0 w-[2px] ${PAIR_COLORS[colorIndex]} pointer-events-none z-5 opacity-60`}
      style={{
        left: `${leftPercent}%`,
        transform: 'translateX(-50%)',
      }}
    />
  );
};
