import type { ClipTab } from '@/tools/video-editor/hooks/useEditorPreferences.ts';
import {
  getClipTypeOverlayBehavior,
  getRegisteredClipTypeDescriptor,
  isClipTypeCommandAvailable,
  isSequenceParamsSchema,
} from '@/tools/video-editor/clip-types/index.ts';
import type { ResolvedTimelineClip, TrackDefinition } from '@/tools/video-editor/types/index.ts';

const BASE_TABS: ClipTab[] = ['effects', 'timing'];

const buildCommandContext = (
  clip: ResolvedTimelineClip | null,
  track: TrackDefinition | null,
) => (
  clip
    ? { clip, track, selectedClipIds: [clip.id] }
    : { clip, track, selectedClipIds: [] }
);

export const getVisibleClipTabs = (
  clip: ResolvedTimelineClip | null,
  track: TrackDefinition | null,
): ClipTab[] => {
  const descriptor = getRegisteredClipTypeDescriptor(clip?.clipType);
  const overlay = getClipTypeOverlayBehavior(descriptor);
  const isSequenceClip = Boolean(descriptor && isSequenceParamsSchema(descriptor.paramsSchema));
  const isEffectLayer = descriptor?.renderCapabilities.previewRoute === 'effect-layer';
  const supportsAudio = Boolean(
    descriptor && isClipTypeCommandAvailable(descriptor, 'toggle-mute', buildCommandContext(clip, track)),
  );

  if (isEffectLayer || isSequenceClip) {
    return BASE_TABS;
  }

  const tabs: ClipTab[] = [...BASE_TABS];
  if (track?.kind === 'visual' && overlay.allowsBoundsEditing) {
    tabs.push('position');
  }
  if (supportsAudio) {
    tabs.push('audio');
  }
  if (overlay.supportsInlineTextEdit) {
    tabs.push('text');
  }
  return tabs;
};

export const getBulkVisibleTabs = (
  clips: ResolvedTimelineClip[],
  tracks: TrackDefinition[],
): ClipTab[] => {
  if (clips.length === 0) {
    return BASE_TABS;
  }

  const trackById = new Map(tracks.map((track) => [track.id, track] as const));
  const visibleTabsByClip = clips.map((clip) => getVisibleClipTabs(clip, trackById.get(clip.track) ?? null));
  const hasTab = (tab: ClipTab) => visibleTabsByClip.some((tabs) => tabs.includes(tab));
  const everyTab = (tab: ClipTab) => visibleTabsByClip.every((tabs) => tabs.includes(tab));

  const tabs: ClipTab[] = [...BASE_TABS];
  if (hasTab('position')) {
    tabs.push('position');
  }
  if (hasTab('audio')) {
    tabs.push('audio');
  }
  if (everyTab('text')) {
    tabs.push('text');
  }
  return tabs;
};

/**
 * The tab a newly selected clip opens on: a text clip's words; otherwise Effects at a desk and
 * Timing on touch, where Inspector starts with when it starts and how long it runs.
 */
export const getSelectionDefaultClipTab = (
  clip: ResolvedTimelineClip | null,
  track: TrackDefinition | null,
  touch = false,
): ClipTab => {
  const visibleTabs = getVisibleClipTabs(clip, track);
  if (visibleTabs.includes('text')) return 'text';
  return touch ? 'timing' : 'effects';
};

export const getFallbackClipTab = (
  activeTab: ClipTab,
  visibleTabs: readonly ClipTab[],
): ClipTab => {
  return visibleTabs.includes(activeTab) ? activeTab : 'effects';
};

/**
 * Where a clip on `trackId` can go with Track up / Track down: the next track of its kind above or
 * below in track order (front to back). At the edge there is nowhere to go, and the action says so.
 */
export const getTrackMoveTargets = (
  tracks: readonly TrackDefinition[],
  trackId: string | undefined,
): { up: boolean; down: boolean } => {
  const index = tracks.findIndex((track) => track.id === trackId);
  if (index < 0) return { up: false, down: false };
  const { kind } = tracks[index];
  const sameKind = (track: TrackDefinition) => track.kind === kind;
  return { up: tracks.slice(0, index).some(sameKind), down: tracks.slice(index + 1).some(sameKind) };
};
