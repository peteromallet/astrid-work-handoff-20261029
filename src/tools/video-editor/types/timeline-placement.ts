export type TimelinePlacementIntent = "after_source" | "replace";

export type TimelinePlacement = {
  timeline_id: string;
  source_clip_id: string;
  target_track: string;
  insertion_time: number;
  intent: TimelinePlacementIntent;
};
