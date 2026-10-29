const FRAME_QUANTIZATION_STEP = 4;
const FRAME_QUANTIZATION_OFFSET = 1;

export function quantizeTotalFrames(total: number, minTotal: number = 17): number {
  const quantized =
    Math.round((total - FRAME_QUANTIZATION_OFFSET) / FRAME_QUANTIZATION_STEP) *
      FRAME_QUANTIZATION_STEP +
    FRAME_QUANTIZATION_OFFSET;
  return Math.max(minTotal, quantized);
}

export function getQuantizedGap(
  desiredGap: number,
  context: number,
  minTotal: number = 17
): number {
  const total = context * 2 + desiredGap;
  const quantizedTotal = quantizeTotalFrames(total, minTotal);
  const gap = quantizedTotal - context * 2;

  if (gap >= 1) {
    return gap;
  }

  const minimumTotalWithPositiveGap = context * 2 + 1;
  const validTotal = quantizeTotalFrames(minimumTotalWithPositiveGap, minTotal);
  return validTotal - context * 2;
}
