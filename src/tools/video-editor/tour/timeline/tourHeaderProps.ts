import {
  EDITOR_TOUR_PROJECT_NAME,
  EDITOR_TOUR_TIMELINE_ID,
  EDITOR_TOUR_TIMELINE_NAME,
} from './tourStages.ts';

/** Shared labels and disabled state for the editor tour's inert project chrome. */
export function tourHeaderProps() {
  return {
    projectId: null,
    timelineId: EDITOR_TOUR_TIMELINE_ID,
    projectName: EDITOR_TOUR_PROJECT_NAME,
    timelineName: EDITOR_TOUR_TIMELINE_NAME,
    disabled: true,
  } as const;
}
