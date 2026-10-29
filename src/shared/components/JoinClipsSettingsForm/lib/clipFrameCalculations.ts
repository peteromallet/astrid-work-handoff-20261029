import type { ClipPairInfo } from '@/shared/components/JoinClipsSettingsForm/types';

interface ClipFrameCalculationsParams {
  gapFrames: number;
  contextFrames: number;
  replaceMode: boolean;
  selectedPair?: ClipPairInfo;
}

export interface ClipFrameCalculations {
  totalFrames: number;
  anchor1Idx: number;
  anchor2Idx: number;
  clipAKeptFrames: number | null;
  clipBKeptFrames: number | null;
  totalGenerationFlex: number;
  contextFlex: number;
  clipAKeptFlex: number;
  clipBKeptFlex: number;
  generationWindowLeftPct: number;
  generationWindowWidthPct: number;
}

function toPercent(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return (value / total) * 100;
}

export function getClipFrameCalculations({
  gapFrames,
  contextFrames,
  replaceMode,
  selectedPair,
}: ClipFrameCalculationsParams): ClipFrameCalculations {
  const totalFrames = contextFrames + gapFrames + contextFrames;
  const anchor1Idx = Math.floor(gapFrames / 3);
  const anchor2Idx = Math.floor((gapFrames * 2) / 3);

  const gapPortion = Math.ceil(gapFrames / 2);
  const framesUsedFromClipA = replaceMode
    ? contextFrames + gapPortion
    : contextFrames;
  const framesUsedFromClipB = replaceMode
    ? contextFrames + Math.floor(gapFrames / 2)
    : contextFrames;

  const clipAKeptFrames = selectedPair
    ? Math.max(0, selectedPair.clipA.frameCount - framesUsedFromClipA)
    : null;
  const clipBKeptFrames = selectedPair
    ? Math.max(0, selectedPair.clipB.frameCount - framesUsedFromClipB)
    : null;

  const totalGenerationFlex = replaceMode ? totalFrames : gapFrames;
  const contextFlex = contextFrames;
  const clipAKeptFlex = totalGenerationFlex / 2;
  const clipBKeptFlex = totalGenerationFlex / 2;

  const replaceTotalFlex = clipAKeptFlex + totalGenerationFlex + clipBKeptFlex;
  const insertTotalFlex =
    clipAKeptFlex + contextFlex + totalGenerationFlex + contextFlex + clipBKeptFlex;

  const generationWindowLeftPct = replaceMode
    ? toPercent(clipAKeptFlex, replaceTotalFlex)
    : toPercent(clipAKeptFlex, insertTotalFlex);
  const generationWindowWidthPct = replaceMode
    ? toPercent(totalGenerationFlex, replaceTotalFlex)
    : toPercent(contextFlex + totalGenerationFlex + contextFlex, insertTotalFlex);

  return {
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
  };
}
