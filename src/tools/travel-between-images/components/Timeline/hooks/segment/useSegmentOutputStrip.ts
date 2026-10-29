/**
 * useSegmentOutputStrip - Orchestrator hook for SegmentOutputStrip.
 *
 * Composes sub-hooks for scrubbing and lightbox concerns.
 * Pure functions handle display slot computation and source info extraction.
 */

import { useCallback, useMemo, useEffect } from 'react';
import { useMarkVariantViewed } from '@/shared/hooks/variants/useMarkVariantViewed';
import { TIMELINE_PADDING_OFFSET } from '../../constants';
import type { SegmentSlot } from '@/shared/hooks/segments';

import { useSegmentScrubbing } from './useSegmentScrubbing';
import { useSegmentLightbox } from './useSegmentLightbox';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PairInfo {
  index: number;
  startId: string;
  endId: string;
  startFrame: number;
  endFrame: number;
  frames: number;
}

interface TrailingSegmentMode {
  imageId: string;
  imageFrame: number;
  endFrame: number;
}

/** A display slot merged with its pixel position — ready for rendering */
interface PositionedSlot {
  slot: SegmentSlot;
  leftPercent: number;
  widthPercent: number;
  isTrailing: boolean;
}

interface UseSegmentOutputStripProps {
  shotId: string;
  projectAspectRatio?: string;
  containerWidth: number;
  fullMin: number;
  fullRange: number;
  pairInfo: PairInfo[];
  rawSegmentSlots: SegmentSlot[];
  trailingSegmentMode?: TrailingSegmentMode;
  hasPendingTaskProp?: (pairShotGenerationId: string | null | undefined) => boolean;
  onTrailingVideoInfo?: (videoUrl: string | null) => void;
  selectedParentId?: string | null;
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Build the ordered list of display slots from raw segment slots and pair info.
 *
 * Matches raw slots to pairs by pairShotGenerationId (the start-image ID),
 * which stays correct during drag even when sequential indices shift.
 * Falls back to index-based matching for slots without a pairShotGenerationId.
 */
function buildDisplaySlots(
  pairInfo: PairInfo[],
  rawSegmentSlots: SegmentSlot[],
  trailingSegmentMode?: TrailingSegmentMode,
): SegmentSlot[] {
  // Index raw slots by pairShotGenerationId (start image ID) for drag-stable matching.
  // Prefer child over placeholder when both exist for the same key.
  const slotByPsgId = new Map<string, SegmentSlot>();
  const slotByIndex = new Map<number, SegmentSlot>();
  for (const slot of rawSegmentSlots) {
    const psgId = slot.pairShotGenerationId;
    if (psgId) {
      const existing = slotByPsgId.get(psgId);
      if (!existing || (slot.type === 'child' && existing.type !== 'child')) {
        slotByPsgId.set(psgId, slot);
      }
    }
    // Also keep index-based fallback
    const existingByIndex = slotByIndex.get(slot.index);
    if (!existingByIndex || (slot.type === 'child' && existingByIndex.type !== 'child')) {
      slotByIndex.set(slot.index, slot);
    }
  }

  // Walk pairs: match by startId first (drag-stable), fall back to index
  const slots: SegmentSlot[] = [];

  for (const pair of pairInfo) {
    const raw = slotByPsgId.get(pair.startId) || slotByIndex.get(pair.index);
    slots.push(raw ?? { type: 'placeholder', index: pair.index });
  }

  // Trailing segment (slot after all pairs)
  if (trailingSegmentMode) {
    const trailingIndex = pairInfo.length;
    const raw = slotByPsgId.get(trailingSegmentMode.imageId) || slotByIndex.get(trailingIndex);
    slots.push(raw ?? {
      type: 'placeholder',
      index: trailingIndex,
      pairShotGenerationId: trailingSegmentMode.imageId,
      expectedFrames: trailingSegmentMode.endFrame - trailingSegmentMode.imageFrame,
    });
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSegmentOutputStrip({
  shotId,
  projectAspectRatio,
  containerWidth,
  fullMin,
  fullRange,
  pairInfo,
  rawSegmentSlots,
  trailingSegmentMode,
  hasPendingTaskProp,
  onTrailingVideoInfo,
  selectedParentId,
}: UseSegmentOutputStripProps) {
  // ===== DISPLAY SLOTS =====
  const displaySlots = useMemo(
    () => buildDisplaySlots(pairInfo, rawSegmentSlots, trailingSegmentMode),
    [pairInfo, rawSegmentSlots, trailingSegmentMode],
  );

  // ===== SUB-HOOKS =====
  const scrubbingHook = useSegmentScrubbing({ projectAspectRatio, displaySlots });
  const lightbox = useSegmentLightbox({ displaySlots, selectedParentId });
  const { clearScrubbing } = scrubbingHook;
  const { setLightboxIndex } = lightbox;
  const { markAllViewed } = useMarkVariantViewed();

  // ===== PENDING TASK CHECKER =====
  const hasPendingTask = hasPendingTaskProp ?? (() => false);

  // ===== SEGMENT CLICK =====
  const handleSegmentClick = useCallback((
    slot: SegmentSlot,
    slotIndex: number,
    onOpenPairSettings?: (pairIndex: number) => void,
  ) => {
    clearScrubbing();
    if (slot.type === 'child') {
      markAllViewed(slot.child.id);
    }

    if (onOpenPairSettings) {
      // The strip can render a slot at a different visible pair index than the
      // child's original raw index after timeline reorders. Open the currently
      // displayed pair so the lightbox resolves the matching segment video.
      onOpenPairSettings(slotIndex);
    } else if (slot.type === 'child') {
      // No pair settings handler — fall back to inline SegmentOutputStrip lightbox
      setLightboxIndex(slotIndex);
    }
  }, [markAllViewed, clearScrubbing, setLightboxIndex]);

  // ===== TRAILING VIDEO INFO REPORTING =====
  // Trailing slot is always the last displaySlot when trailingSegmentMode is active
  useEffect(() => {
    if (!onTrailingVideoInfo || !trailingSegmentMode) {
      onTrailingVideoInfo?.(null);
      return;
    }
    const trailingSlot = displaySlots.length > pairInfo.length
      ? displaySlots[displaySlots.length - 1]
      : undefined;
    if (trailingSlot?.type === 'child' && trailingSlot.child.location) {
      onTrailingVideoInfo(trailingSlot.child.location);
    } else {
      onTrailingVideoInfo(null);
    }
  }, [displaySlots, pairInfo.length, trailingSegmentMode, onTrailingVideoInfo]);

  // ===== POSITIONED SLOTS (slot + pixel position in single computation) =====
  // Uses array index (not slot.index) to pair displaySlots with pairInfo,
  // since buildDisplaySlots outputs one slot per pair in matching order.
  const positionedSlots = useMemo((): PositionedSlot[] => {
    if (fullRange <= 0 || containerWidth <= 0) return [];
    const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);

    const result = displaySlots.map((slot, i) => {
      const isTrailing = i >= pairInfo.length && !!trailingSegmentMode;

      let startFrame: number;
      let endFrame: number;
      if (isTrailing) {
        startFrame = trailingSegmentMode!.imageFrame;
        endFrame = trailingSegmentMode!.endFrame;
      } else {
        const pair = pairInfo[i];
        if (!pair) return { slot, leftPercent: 0, widthPercent: 0, isTrailing: false };
        startFrame = pair.startFrame;
        endFrame = pair.endFrame;
      }

      const startPixel = TIMELINE_PADDING_OFFSET + ((startFrame - fullMin) / fullRange) * effectiveWidth;
      const endPixel = TIMELINE_PADDING_OFFSET + ((endFrame - fullMin) / fullRange) * effectiveWidth;
      const width = endPixel - startPixel;

      return {
        slot,
        leftPercent: (startPixel / containerWidth) * 100,
        widthPercent: (width / containerWidth) * 100,
        isTrailing,
      };
    });

    return result;
  }, [displaySlots, pairInfo, fullMin, fullRange, containerWidth, trailingSegmentMode]);

  return {
    // Refs
    previewVideoRef: scrubbingHook.previewVideoRef,
    stripContainerRef: scrubbingHook.stripContainerRef,

    // Mobile
    isMobile: scrubbingHook.isMobile,

    // Display data
    positionedSlots,
    hasPendingTask,

    // Scrubbing
    activeScrubbingIndex: scrubbingHook.activeScrubbingIndex,
    activeSegmentSlot: scrubbingHook.activeSegmentSlot,
    activeSegmentVideoUrl: scrubbingHook.activeSegmentVideoUrl,
    scrubbing: scrubbingHook.scrubbing,
    previewPosition: scrubbingHook.previewPosition,
    previewDimensions: scrubbingHook.previewDimensions,
    clampedPreviewX: scrubbingHook.clampedPreviewX,
    handleScrubbingStart: scrubbingHook.handleScrubbingStart,

    // Lightbox
    lightboxIndex: lightbox.lightboxIndex,
    lightboxMedia: lightbox.lightboxMedia,
    currentLightboxMedia: lightbox.currentLightboxMedia,
    childSlotIndices: lightbox.childSlotIndices,
    handleSegmentClick,
    handleLightboxNext: lightbox.handleLightboxNext,
    handleLightboxPrev: lightbox.handleLightboxPrev,
    handleLightboxClose: lightbox.handleLightboxClose,

    shotId,
  };
}
