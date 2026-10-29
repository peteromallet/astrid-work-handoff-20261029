/** Clip time arithmetic only. Kinds decide which source extents are playable. */
export function sourceToTimelineTime(
  clip: Readonly<{ at: number; from?: number; speed?: number }>,
  sourceTime: number,
): number {
  const rate = typeof clip.speed === 'number' && Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1;
  return clip.at + (sourceTime - (clip.from ?? 0)) / rate;
}

/** Inverse of sourceToTimelineTime for the same clip. */
export function timelineToSourceTime(
  clip: Readonly<{ at: number; from?: number; speed?: number }>,
  timelineTime: number,
): number {
  const rate = typeof clip.speed === 'number' && Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1;
  return (clip.from ?? 0) + (timelineTime - clip.at) * rate;
}
