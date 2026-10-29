import { useEffect, useMemo } from 'react';
import { getQuantizedGap, quantizeTotalFrames } from '../utils';

const STANDARD_MAX_TOTAL = 81;
const STANDARD_MAX_CONTEXT = 30;

interface UseJoinClipsSettingsControllerParams {
  gapFrames: number;
  setGapFrames: (val: number) => void;
  contextFrames: number;
  setContextFrames: (val: number) => void;
  replaceMode: boolean;
  shortestClipFrames?: number;
  keepBridgingImagesValue: boolean;
  setKeepBridgingImages?: (val: boolean) => void;
}

interface JoinClipsSettingsController {
  maxGapFrames: number;
  maxContextFrames: number;
  minClipFramesRequired: number;
  actualTotal: number;
  quantizedTotal: number;
  handleContextFramesChange: (val: number) => void;
  sliderNumber: (value: number | readonly number[]) => number;
}

export function useJoinClipsSettingsController({
  gapFrames,
  setGapFrames,
  contextFrames,
  setContextFrames,
  replaceMode,
  shortestClipFrames,
  keepBridgingImagesValue,
  setKeepBridgingImages,
}: UseJoinClipsSettingsControllerParams): JoinClipsSettingsController {
  const { maxGapFrames, maxContextFrames, minClipFramesRequired } = useMemo(() => {
    const minRequired = replaceMode
      ? gapFrames + 2 * contextFrames
      : contextFrames;

    if (!shortestClipFrames || shortestClipFrames <= 0) {
      const defaultMaxGap = Math.max(1, STANDARD_MAX_TOTAL - contextFrames * 2);
      return {
        maxGapFrames: defaultMaxGap,
        maxContextFrames: STANDARD_MAX_CONTEXT,
        minClipFramesRequired: minRequired,
      };
    }

    if (replaceMode) {
      const maxGapForClip = Math.max(1, shortestClipFrames - 2 * contextFrames);
      const maxGapForTotal = Math.max(1, STANDARD_MAX_TOTAL - contextFrames * 2);
      let finalMaxGap = Math.min(maxGapForClip, maxGapForTotal);
      finalMaxGap = Math.max(1, Math.floor((finalMaxGap - 1) / 4) * 4 + 1);

      const maxContextForClip = Math.floor((shortestClipFrames - gapFrames) / 2);
      const maxContextForTotal = Math.floor((STANDARD_MAX_TOTAL - gapFrames) / 2);
      const finalMaxContext = Math.max(
        4,
        Math.min(maxContextForClip, maxContextForTotal, STANDARD_MAX_CONTEXT),
      );

      return {
        maxGapFrames: Math.max(1, finalMaxGap),
        maxContextFrames: finalMaxContext,
        minClipFramesRequired: minRequired,
      };
    }

    const maxContextForClip = shortestClipFrames;
    const finalMaxContext = Math.max(
      4,
      Math.min(maxContextForClip, STANDARD_MAX_CONTEXT),
    );
    const maxGapForTotal = Math.max(1, STANDARD_MAX_TOTAL - contextFrames * 2);

    return {
      maxGapFrames: maxGapForTotal,
      maxContextFrames: finalMaxContext,
      minClipFramesRequired: minRequired,
    };
  }, [shortestClipFrames, contextFrames, gapFrames, replaceMode]);

  useEffect(() => {
    if (gapFrames > maxGapFrames) {
      setGapFrames(getQuantizedGap(maxGapFrames, contextFrames));
    }
  }, [maxGapFrames, gapFrames, contextFrames, setGapFrames]);

  useEffect(() => {
    if (contextFrames > maxContextFrames) {
      setContextFrames(maxContextFrames);
    }
  }, [maxContextFrames, contextFrames, setContextFrames]);

  useEffect(() => {
    if (gapFrames <= 8 && keepBridgingImagesValue) {
      setKeepBridgingImages?.(false);
    }
  }, [gapFrames, keepBridgingImagesValue, setKeepBridgingImages]);

  const handleContextFramesChange = (val: number) => {
    setContextFrames(Math.max(4, val));
  };

  const sliderNumber = (value: number | readonly number[]): number => {
    if (typeof value === 'number') {
      return value;
    }
    return value[0] ?? 0;
  };

  const actualTotal = contextFrames * 2 + gapFrames;
  const quantizedTotal = quantizeTotalFrames(actualTotal);

  return {
    maxGapFrames,
    maxContextFrames,
    minClipFramesRequired,
    actualTotal,
    quantizedTotal,
    handleContextFramesChange,
    sliderNumber,
  };
}
