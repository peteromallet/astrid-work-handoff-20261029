import React from 'react';

// Type for a portion selection
export interface PortionSelection {
  id: string;
  start: number;  // Start time in seconds
  end: number;    // End time in seconds
  gapFrameCount?: number;  // Per-segment gap frame count (defaults to global setting)
  prompt?: string;  // Per-segment prompt (defaults to global prompt)
  name?: string;  // Optional user-defined name for the segment
}

export interface MultiPortionTimelineProps {
  duration: number;
  selections: PortionSelection[];
  activeSelectionId: string | null;
  onSelectionChange: (id: string, start: number, end: number) => void;
  onSelectionClick: (id: string | null) => void;
  onRemoveSelection: (id: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string;
  fps: number | null;
  /** Maximum gap frames allowed (to enforce limits from settings) */
  maxGapFrames?: number;
}

// Drag state for a handle being dragged
export interface HandleDragState {
  id: string;
  handle: 'start' | 'end';
}

// Drag offset for immediate visual feedback
export interface DragOffset {
  id: string;
  handle: 'start' | 'end';
  offsetPx: number;
}

// Colors for different selections
export const SELECTION_COLORS = [
  'bg-primary',
  'bg-blue-500',
  'bg-green-500',
  'bg-orange-500',
  'bg-purple-500',
];
