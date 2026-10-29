import { useState, useEffect, useCallback } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import { useAppEventListener } from '@/shared/lib/typedEvents';

interface UsePendingFramesProps {
  shotId: string;
  images: GenerationRow[];
  isUploadingImage: boolean;
}

interface UsePendingFramesReturn {
  pendingDropFrame: number | null;
  setPendingDropFrame: (frame: number | null) => void;
  pendingExternalAddFrame: number | null;
  isInternalDropProcessing: boolean;
  setIsInternalDropProcessing: (processing: boolean) => void;
  /** Combined pending frame (for marker display) */
  activePendingFrame: number | null;
}

/**
 * Manages pending frame state for skeleton placeholders during:
 * - File drops
 * - External adds (from GenerationsPane)
 */
export function usePendingFrames({
  shotId,
  images,
  isUploadingImage,
}: UsePendingFramesProps): UsePendingFramesReturn {
  const [pendingDropFrame, setPendingDropFrame] = useState<number | null>(null);
  const [pendingExternalAddFrame, setPendingExternalAddFrame] = useState<number | null>(null);
  const [isInternalDropProcessing, setIsInternalDropProcessing] = useState(false);

  // Listen for global pending add events (from GenerationsPane)
  const handlePendingAdd = useCallback((detail: { frame: number; shotId?: string }) => {
    const { frame, shotId: targetShotId } = detail;

    // Only handle if this is for the current shot
    if (targetShotId && targetShotId !== shotId) {
      return;
    }

    setPendingExternalAddFrame(frame);
  }, [shotId]);

  useAppEventListener('timeline:pending-add', handlePendingAdd);

  // Clear pending drop frame when upload finishes
  useEffect(() => {
    if (!isUploadingImage && !isInternalDropProcessing) {
      setPendingDropFrame(null);
    }
  }, [isUploadingImage, isInternalDropProcessing]);

  // Clear pending external add frame when the new item appears
  useEffect(() => {
    if (pendingExternalAddFrame !== null) {
      const imageAtFrame = images.find(img => img.timeline_frame === pendingExternalAddFrame);
      if (imageAtFrame) {
        setTimeout(() => setPendingExternalAddFrame(null), 100);
      }
    }
  }, [images, pendingExternalAddFrame]);

  // Safety timeout for pending external add frame
  useEffect(() => {
    if (pendingExternalAddFrame !== null) {
      const timer = setTimeout(() => {
        setPendingExternalAddFrame(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pendingExternalAddFrame]);

  const activePendingFrame = pendingDropFrame ?? pendingExternalAddFrame;

  return {
    pendingDropFrame,
    setPendingDropFrame,
    pendingExternalAddFrame,
    isInternalDropProcessing,
    setIsInternalDropProcessing,
    activePendingFrame,
  };
}
