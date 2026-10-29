import { finalVideoQueryKeys } from './finalVideos';
import { generationQueryKeys } from './generations';
import { presetQueryKeys } from './presets';
import { projectStatsQueryKeys } from './projectStats';
import { resourceQueryKeys } from './resources';
import { segmentQueryKeys } from './segments';
import { settingsQueryKeys } from './settings';
import { shotQueryKeys } from './shots';
import { taskQueryKeys } from './tasks';
import { unifiedGenerationQueryKeys } from './unified';

export const queryKeys = {
  shots: shotQueryKeys,
  generations: generationQueryKeys,
  unified: unifiedGenerationQueryKeys,
  finalVideos: finalVideoQueryKeys,
  segments: segmentQueryKeys,
  tasks: taskQueryKeys,
  settings: settingsQueryKeys,
  resources: resourceQueryKeys,
  presets: presetQueryKeys,
  projectStats: projectStatsQueryKeys,
} as const;

type QueryKeys = typeof queryKeys;
type QueryKeyOf<T> = T extends (...args: unknown[]) => infer R ? R : T;
