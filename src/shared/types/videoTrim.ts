/** Shared types for video trim controls. */

export interface TrimState {
  startTrim: number;
  endTrim: number;
  videoDuration: number;
  isValid: boolean;
}

export interface UseVideoTrimmingReturn {
  trimState: TrimState;
  setStartTrim: (seconds: number) => void;
  setEndTrim: (seconds: number) => void;
  resetTrim: () => void;
  setVideoDuration: (duration: number) => void;
  /** Duration after trimming is applied */
  trimmedDuration: number;
  /** Preview start time (where kept portion begins) */
  previewStartTime: number;
  /** Preview end time (where kept portion ends) */
  previewEndTime: number;
  /** Whether any trimming has been applied */
  hasTrimChanges: boolean;
}
