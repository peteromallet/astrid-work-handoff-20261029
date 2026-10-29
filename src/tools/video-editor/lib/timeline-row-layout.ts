import { arrayMove } from '@dnd-kit/sortable';
import type { DataLaneView } from '@/tools/video-editor/data/typed/envelope.ts';
import { visibleDataLanes } from '@/tools/video-editor/data-kinds/visibleDataLanes.ts';
import type { TrackDefinition } from '@/tools/video-editor/types/index.ts';

export interface TimelineDataLanePlacement {
  version: 1;
  lanes: Array<{ laneId: string; beforeTrackId: string | null }>;
}
export interface TimelineVisualRow {
  readonly sortableId: string;
  readonly kind: 'track' | 'dataLane';
  readonly id: string;
  readonly top: number;
  readonly height: number;
  readonly mediaRowIndex?: number;
}
export interface TimelineTrackRect {
  readonly top: number;
  readonly height: number;
  readonly mediaRowIndex: number;
}
export interface TimelineRowLayout {
  readonly rows: readonly TimelineVisualRow[];
  readonly totalHeight: number;
  readonly trackRects: ReadonlyMap<string, TimelineTrackRect>;
}
export function normalizeTimelineDataLanePlacement(value: unknown): TimelineDataLanePlacement {
  const result: TimelineDataLanePlacement = { version: 1, lanes: [] };
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
    || !('lanes' in value) || !Array.isArray(value.lanes)) return result;
  const seen = new Set<string>();
  for (const entry of value.lanes) {
    if (!entry || typeof entry !== 'object' || typeof entry.laneId !== 'string' || !entry.laneId
      || !(entry.beforeTrackId === null || typeof entry.beforeTrackId === 'string') || seen.has(entry.laneId)) continue;
    seen.add(entry.laneId);
    result.lanes.push({ laneId: entry.laneId, beforeTrackId: entry.beforeTrackId });
  }
  return result;
}
export function buildTimelineRowLayout({ tracks, lanes, placement, mediaRowHeight }: {
  tracks: readonly TrackDefinition[];
  lanes?: readonly DataLaneView[] | null;
  placement?: unknown;
  mediaRowHeight: number;
}): TimelineRowLayout {
  const visible = visibleDataLanes(lanes);
  const laneMap = new Map(visible.map(lane => [lane.laneId, lane]));
  const trackIds = new Set(tracks.map(track => track.id));
  const anchors = new Map<string | null, DataLaneView[]>();
  const placed = new Set<string>();
  for (const entry of normalizeTimelineDataLanePlacement(placement).lanes) {
    const lane = laneMap.get(entry.laneId);
    if (!lane) continue;
    const anchor = entry.beforeTrackId !== null && trackIds.has(entry.beforeTrackId) ? entry.beforeTrackId : null;
    anchors.set(anchor, [...(anchors.get(anchor) ?? []), lane]);
    placed.add(entry.laneId);
  }
  anchors.set(null, [...(anchors.get(null) ?? []), ...visible.filter(lane => !placed.has(lane.laneId))]);
  const rows: TimelineVisualRow[] = [];
  const trackRects = new Map<string, TimelineTrackRect>();
  let top = 0;
  const appendLanes = (anchor: string | null) => {
    for (const lane of anchors.get(anchor) ?? []) {
      const height = Number.isFinite(lane.height) && lane.height > 0 ? lane.height : 24;
      rows.push({ sortableId: `data-lane-${lane.laneId}`, kind: 'dataLane', id: lane.laneId, top, height });
      top += height;
    }
  };
  tracks.forEach((track, mediaRowIndex) => {
    appendLanes(track.id);
    const rect = { top, height: mediaRowHeight, mediaRowIndex };
    trackRects.set(track.id, rect);
    rows.push({ ...rect, sortableId: `track-${track.id}`, kind: 'track', id: track.id });
    top += mediaRowHeight;
  });
  appendLanes(null);
  return { rows, totalHeight: top, trackRects };
}
export function reorderTimelineRows({ tracks, lanes, placement, activeId, overId }: {
  tracks: TrackDefinition[]; lanes: readonly DataLaneView[]; placement?: unknown; activeId: string; overId: string;
}): { tracks: TrackDefinition[]; placement: TimelineDataLanePlacement } | null {
  const layout = buildTimelineRowLayout({ tracks, lanes, placement, mediaRowHeight: 1 });
  const from = layout.rows.findIndex(row => row.sortableId === activeId);
  const to = layout.rows.findIndex(row => row.sortableId === overId);
  if (from < 0 || to < 0 || from === to) return null;
  const reordered = arrayMove([...layout.rows], from, to);
  const nextTracks = reordered.filter(row => row.kind === 'track').map(row => tracks.find(track => track.id === row.id)!);
  const visibleIds = new Set(layout.rows.filter(row => row.kind === 'dataLane').map(row => row.id));
  const nextLanes = normalizeTimelineDataLanePlacement(placement).lanes.filter(entry => !visibleIds.has(entry.laneId));
  reordered.forEach((row, index) => {
    if (row.kind !== 'dataLane') return;
    nextLanes.push({ laneId: row.id, beforeTrackId: reordered.slice(index + 1).find(next => next.kind === 'track')?.id ?? null });
  });
  return {
    tracks: nextTracks.every((track, index) => track === tracks[index]) ? tracks : nextTracks,
    placement: { version: 1, lanes: nextLanes },
  };
}

/** Host-standard lane chrome; extensions can opt into an explicit laneHeight. */
export function resolveTimelineLaneHeight(lane: DataLaneView, mediaRowHeight: number): number {
  if (typeof lane.heightOverride === 'number' && Number.isFinite(lane.heightOverride) && lane.heightOverride > 0) return lane.heightOverride;
  if (lane.shape !== 'interval') return mediaRowHeight;
  const events: Array<{ time: number; delta: number }> = [];
  for (const item of lane.items) {
    if (!Number.isFinite(item.timelineStart) || !Number.isFinite(item.timelineEnd) || item.timelineEnd <= item.timelineStart) continue;
    events.push({ time: item.timelineStart, delta: 1 }, { time: item.timelineEnd, delta: -1 });
  }
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);
  let active = 0;
  let depth = 1;
  for (const event of events) { active += event.delta; depth = Math.max(depth, active); }
  return mediaRowHeight * Math.min(3, depth);
}
