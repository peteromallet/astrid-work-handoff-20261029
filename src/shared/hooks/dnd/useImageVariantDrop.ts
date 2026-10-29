import { useCallback, useState } from 'react';
import type { DragEventHandler } from 'react';
import { getDragType, getGenerationDropData, markDropHandledByVariant, wasDropHandledByVariant } from '@/shared/lib/dnd/dragDrop';

export interface VariantDropParams {
  files?: File[];
  sourceGenerationId?: string;
  sourceVariantId?: string;
  imageUrl?: string;
  thumbUrl?: string;
  targetGenerationId: string;
  mode: 'variant' | 'main';
}

interface UseImageVariantDropProps {
  generationId: string | null;
  onVariantDrop: (params: VariantDropParams) => Promise<void>;
  disabled?: boolean;
  onTargetStateChange?: (isActive: boolean) => void;
}

function getRegionForEvent(element: HTMLDivElement, clientY: number): 'variant' | 'main' {
  const rect = element.getBoundingClientRect();
  const relativeY = clientY - rect.top;
  return relativeY <= rect.height * 0.75 ? 'variant' : 'main';
}

export function useImageVariantDrop({
  generationId,
  onVariantDrop,
  disabled = false,
  onTargetStateChange,
}: UseImageVariantDropProps) {
  const [isVariantDropTarget, setIsVariantDropTarget] = useState(false);
  const [activeRegion, setActiveRegion] = useState<'variant' | 'main' | null>(null);

  const resetState = useCallback(() => {
    setIsVariantDropTarget(false);
    setActiveRegion(null);
    onTargetStateChange?.(false);
  }, [onTargetStateChange]);

  const onDragEnter: DragEventHandler<HTMLDivElement> = useCallback((e) => {
    e.stopPropagation();

    if (!generationId || disabled) {
      resetState();
      return;
    }

    const dragType = getDragType(e);
    if (dragType !== 'file' && dragType !== 'generation') {
      resetState();
      return;
    }

    setIsVariantDropTarget(true);
    setActiveRegion(getRegionForEvent(e.currentTarget, e.clientY));
    onTargetStateChange?.(true);
  }, [disabled, generationId, onTargetStateChange, resetState]);

  const onDragOver: DragEventHandler<HTMLDivElement> = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!generationId || disabled) {
      resetState();
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    const dragType = getDragType(e);
    if (dragType !== 'file' && dragType !== 'generation') {
      resetState();
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    setIsVariantDropTarget(true);
    setActiveRegion(getRegionForEvent(e.currentTarget, e.clientY));
    onTargetStateChange?.(true);
    e.dataTransfer.dropEffect = 'copy';
  }, [disabled, generationId, onTargetStateChange, resetState]);

  const onDragLeave: DragEventHandler<HTMLDivElement> = useCallback((e) => {
    e.stopPropagation();

    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }

    resetState();
  }, [resetState]);

  const onDrop: DragEventHandler<HTMLDivElement> = useCallback(async (e) => {
    e.preventDefault();
    // Don't stopPropagation — let the parent's handleDrop fire so it can
    // reset its own visual state (isFileOver, dropTargetFrame, etc.).
    // Instead, mark the event so the parent knows to skip processing the action.

    if (!generationId || disabled) {
      resetState();
      return;
    }

    markDropHandledByVariant(e);

    const mode = activeRegion ?? getRegionForEvent(e.currentTarget, e.clientY);
    const dragType = getDragType(e);
    resetState();

    if (dragType === 'generation') {
      const data = getGenerationDropData(e);
      if (!data || data.generationId === generationId) {
        return;
      }

      await onVariantDrop({
        sourceGenerationId: data.generationId,
        sourceVariantId: data.variantId,
        imageUrl: data.imageUrl,
        thumbUrl: data.thumbUrl,
        targetGenerationId: generationId,
        mode,
      });
      return;
    }

    if (dragType !== 'file') {
      return;
    }

    const files = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) {
      return;
    }

    await onVariantDrop({
      files,
      targetGenerationId: generationId,
      mode,
    });
  }, [activeRegion, disabled, generationId, onVariantDrop, resetState]);

  return {
    isVariantDropTarget,
    activeRegion,
    dragHandlers: {
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop,
    },
  };
}
