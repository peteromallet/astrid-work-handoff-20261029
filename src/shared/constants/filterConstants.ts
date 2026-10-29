export const SHOT_FILTER = {
  ALL: 'all',
  NO_SHOT: 'no-shot',
} as const;

type SpecialShotFilter = typeof SHOT_FILTER[keyof typeof SHOT_FILTER];
type ShotFilterValue = SpecialShotFilter | string; // string for shot UUIDs

export function isSpecialFilter(filter: string): filter is SpecialShotFilter {
  return filter === SHOT_FILTER.ALL || filter === SHOT_FILTER.NO_SHOT;
}
