import { TRAILING_ENDPOINT_KEY } from './timeline-constants';

// Get pair information from positions (excludes trailing endpoint)
export const getPairInfo = (framePositions: Map<string, number>) => {
  const sortedPositions = [...framePositions.entries()]
    .filter(([id]) => id !== TRAILING_ENDPOINT_KEY)
    .map(([id, pos]) => ({ id, pos }))
    .sort((a, b) => a.pos - b.pos);

  const pairs = [];
  for (let i = 0; i < sortedPositions.length - 1; i++) {
    const startFrame = sortedPositions[i].pos;
    const endFrame = sortedPositions[i + 1].pos;
    const pairFrames = endFrame - startFrame;

    pairs.push({
      index: i,
      startId: sortedPositions[i].id,
      endId: sortedPositions[i + 1].id,
      startFrame,
      endFrame,
      frames: pairFrames,
      generationStart: startFrame,
      contextStart: endFrame,
      contextEnd: endFrame,
    });
  }

  return pairs;
};
