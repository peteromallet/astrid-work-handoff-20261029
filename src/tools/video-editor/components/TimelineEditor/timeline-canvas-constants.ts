export interface ResizeOverride {
  start: number;
  end: number;
}

export const ACTION_VERTICAL_MARGIN = 4;
export const CURSOR_WIDTH = 2;
export const RESIZE_HANDLE_WIDTH = 8;
export const TOUCH_RESIZE_HANDLE_WIDTH = 20;
export const RESIZE_ACTIVATION_THRESHOLD_PX = 4;
export const MIN_ACTION_WIDTH_PX = 24;
export const SNAP_THRESHOLD_PX = 8;
export const SHOT_GROUP_LABEL_HEIGHT = 18;
export const TIME_RULER_HEIGHT = 30;

export const EMPTY_RESIZE_PREVIEW_SNAPSHOT: Readonly<Record<string, ResizeOverride>> = Object.freeze({});
