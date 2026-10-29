/** Storage keys for persisted settings and inheritance state. */

import { EDITOR_TOUR_VERSION } from '../editorTourVersion';

export const STORAGE_KEYS = {
  LAST_ACTIVE_SHOT_SETTINGS: (projectId: string) => `last-active-shot-settings-${projectId}`,
  LAST_ACTIVE_UI_SETTINGS: (projectId: string) => `last-active-ui-settings-${projectId}`,
  LAST_EDITED_LORA: (projectId: string) => `last-edited-lora-${projectId}`,
  GLOBAL_LAST_ACTIVE_SHOT_SETTINGS: 'global-last-active-shot-settings',
  EDITOR_TOUR_SEEN: `astrid-editor-tour-v${EDITOR_TOUR_VERSION}`,
  APPLY_PROJECT_DEFAULTS: (shotId: string) => `apply-project-defaults-${shotId}`,
  LAST_ACTIVE_JOIN_SEGMENTS_SETTINGS: (projectId: string) => `last-active-join-segments-${projectId}`,
  GLOBAL_LAST_ACTIVE_JOIN_SEGMENTS_SETTINGS: 'global-last-active-join-segments',
  APPLY_JOIN_SEGMENTS_DEFAULTS: (shotId: string) => `apply-join-segments-defaults-${shotId}`,
};
