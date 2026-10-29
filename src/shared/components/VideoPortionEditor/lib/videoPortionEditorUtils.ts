export function formatDuration(
  frames: number,
  videoFps: number | null | undefined
): string {
  if (!videoFps || videoFps <= 0) {
    return '';
  }
  const seconds = frames / videoFps;
  if (seconds < 1) {
    return `${Math.round(seconds * 1000)}ms`;
  }
  return `${seconds.toFixed(1)}s`;
}

export function getMaxGapFrames(contextFrames: number): number {
  return Math.max(1, 81 - contextFrames * 2);
}
