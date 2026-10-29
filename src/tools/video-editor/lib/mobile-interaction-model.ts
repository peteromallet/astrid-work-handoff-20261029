import type { TimelineDataItemRef } from '@/shared/state/selectionStore.ts';
import { TABLET_MAX_WIDTH } from '@/shared/hooks/mobile/deviceDetection';

export type TimelineDeviceClass = 'desktop' | 'tablet' | 'phone';

export type TimelineInputModality = 'mouse' | 'touch' | 'pen' | 'keyboard' | 'unknown';

export type TimelineInteractionMode = 'browse' | 'select' | 'move' | 'trim';

/**
 * The gesture-ownership values the host and stylesheet key on.
 *
 * `overlay` is **host-internal**: while a timeline-overlay contribution holds
 * the pointer claim, the host sets the owner to `'overlay'` so marquee, pinch,
 * and other timeline gestures decline. There is deliberately no public setter
 * or lease model here — ownership is assigned by the host's claim record (see
 * `TimelineExtensionOverlayHost`), never by extension code, so an extension
 * cannot seize or inspect the gesture.
 */
export type TimelineGestureOwner =
  | 'none'
  | 'timeline'
  | 'ruler'
  | 'clip'
  | 'trim'
  | 'preview'
  | 'inspector'
  | 'shell'
  | 'overlay';

export type TimelineInteractionTargetKind =
  | 'clip'
  | 'shader'
  | 'track'
  | 'timeline'
  | 'selection'
  | 'preview'
  | 'overlay'
  | 'dataLane'
  | 'dataItem'
  | 'shotOccurrence'
  | 'shell';

export interface TimelineInteractionTarget {
  kind: TimelineInteractionTargetKind;
  clipId?: string | null;
  trackId?: string | null;
  clipIds?: string[];
  dataItems?: readonly TimelineDataItemRef[];
  shaderScope?: 'clip' | 'postprocess';
  shaderId?: string | null;
  extensionId?: string | null;
  laneId?: string | null;
  itemId?: string | null;
  contributionId?: string | null;
  occurrenceId?: string | null;
  shotId?: string | null;
  revisionId?: string | null;
  parentDocumentId?: string | null;
  shotName?: string | null;
  start?: number;
  end?: number;
}

export type TimelineContextTarget = TimelineInteractionTarget | null;
export type TimelineInspectorTarget = TimelineInteractionTarget | null;

export interface MobileInteractionPolicy {
  deviceClass: TimelineDeviceClass;
  inputModality: TimelineInputModality;
  interactionMode: TimelineInteractionMode;
  gestureOwner: TimelineGestureOwner;
  contextTarget: TimelineContextTarget;
  inspectorTarget: TimelineInspectorTarget;
}

/**
 * Which editor a device gets. Pure: the caller reads the signals (see
 * `hooks/useTimelineState.ts`), this decides.
 *
 * Phone and tablet get the same touch editor (the shell lays it out by the
 * screen's shape, not by this name); the split that matters is touch vs desktop.
 *
 * The shared `computeIsMobile` is true for *any* coarse pointer at any width,
 * so on its own it would hand the touch editor to a 27-inch touchscreen desktop.
 *
 * Owner's decision: **large coarse-pointer screens are desktops unless the
 * hardware is a tablet.** Width alone stops being evidence of a phone at
 * `TABLET_MAX_WIDTH`; past it the tablet-hardware hint (tablet UA / iPadOS-like,
 * `isTabletHardware` in `shared/hooks/mobile/deviceDetection.ts`) is the only
 * thing that keeps touch editing on. A desktop with a touchscreen gets the
 * desktop editor — hover affordances and drag handles work there, and a
 * modeless surface beats a mode bar on a 27-inch screen.
 *
 * The shared signals keep their app-wide semantics; the correction lives here,
 * at the timeline seam, because it is a timeline-layout judgement.
 */
export function resolveTimelineDeviceClass({
  isMobile,
  isTablet,
  viewportWidth,
  isTabletHardware,
}: {
  isMobile: boolean;
  isTablet: boolean;
  /** CSS-pixel viewport width. */
  viewportWidth: number;
  /** Tablet UA / iPadOS-like platform, independent of width. */
  isTabletHardware: boolean;
}): TimelineDeviceClass {
  if (isTablet) {
    return 'tablet';
  }

  if (!isMobile) {
    return 'desktop';
  }

  if (viewportWidth < TABLET_MAX_WIDTH) {
    return 'phone';
  }

  return isTabletHardware ? 'tablet' : 'desktop';
}

export function resolveInputModalityFromPointerType(
  pointerType: string | null | undefined,
): TimelineInputModality {
  switch (pointerType) {
    case 'mouse':
      return 'mouse';
    case 'touch':
      return 'touch';
    case 'pen':
      return 'pen';
    default:
      return 'unknown';
  }
}

/**
 * Touch rests in `browse`: a drag pans the timeline and a tap selects a clip.
 * There is no global mode control on touch; `move`/`trim` are armed from the
 * selected clip's actions and released with Done (see `resolveArmedTouchGesture`).
 * Desktop is modeless and keeps `select`.
 */
export function getDefaultInteractionMode(
  deviceClass: TimelineDeviceClass,
): TimelineInteractionMode {
  return deviceClass === 'desktop' ? 'select' : 'browse';
}

export function createMobileInteractionPolicy(
  deviceClass: TimelineDeviceClass,
): MobileInteractionPolicy {
  return {
    deviceClass,
    inputModality: 'unknown',
    interactionMode: getDefaultInteractionMode(deviceClass),
    gestureOwner: 'none',
    contextTarget: null,
    inspectorTarget: null,
  };
}

export function isTouchTimelineInput(
  deviceClass: TimelineDeviceClass,
  inputModality: TimelineInputModality,
): boolean {
  return inputModality === 'touch' && deviceClass !== 'desktop';
}

export function shouldAllowTouchClipDrag(
  deviceClass: TimelineDeviceClass,
  inputModality: TimelineInputModality,
  interactionMode: TimelineInteractionMode,
): boolean {
  if (!isTouchTimelineInput(deviceClass, inputModality)) {
    return true;
  }

  return interactionMode === 'move';
}

export function shouldExpandTouchTrimHandles(
  deviceClass: TimelineDeviceClass,
  inputModality: TimelineInputModality,
  interactionMode: TimelineInteractionMode,
): boolean {
  return isTouchTimelineInput(deviceClass, inputModality) && interactionMode === 'trim';
}

/**
 * The touch gesture a clip action has armed, or `null` while touch rests in its
 * default mode.
 *
 * Touch has no mode switcher. A clip's Move or Trim action (the inspector's
 * action grid, reached by tapping the clip) arms the gesture; the shell then
 * shows a Done control, which returns touch to `getDefaultInteractionMode`.
 * This is what keeps `move`/`trim` reachable *and* leavable on every touch
 * device class (Key Invariant 2 in `docs/structure_detail/tool_video_editor.md`).
 * Desktop is modeless, so nothing is ever armed there.
 *
 * This is also the element-ownership mode the stylesheet keys on, as
 * `data-touch-gesture-mode`: `move` hands the touch to the clips, `trim` to the
 * trim handles. Whatever it selects must set `touch-action: none`, or the
 * browser claims the touch for native panning and cancels the pointer stream.
 * Keyed on device class rather than `inputModality`: the CSS has to be in place
 * before the first pointer event, which is what resolves the modality.
 */
export function resolveArmedTouchGesture(
  deviceClass: TimelineDeviceClass,
  interactionMode: TimelineInteractionMode,
): 'move' | 'trim' | null {
  if (deviceClass === 'desktop') {
    return null;
  }

  return interactionMode === 'move' || interactionMode === 'trim' ? interactionMode : null;
}

/**
 * Whether a two-finger pinch on the timeline drives zoom. Touch only: a desktop
 * trackpad pinch arrives as a ctrl+wheel event rather than a two-touch stream,
 * and the toolbar +/- buttons already serve pointer users.
 */
export function shouldEnableTimelinePinchZoom(deviceClass: TimelineDeviceClass): boolean {
  return deviceClass !== 'desktop';
}

export function shouldPreserveTouchSelectionForMove(
  deviceClass: TimelineDeviceClass,
  inputModality: TimelineInputModality,
  interactionMode: TimelineInteractionMode,
): boolean {
  return isTouchTimelineInput(deviceClass, inputModality) && interactionMode === 'move';
}

export function areTimelineInteractionTargetsEqual(
  left: TimelineInteractionTarget | null | undefined,
  right: TimelineInteractionTarget | null | undefined,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  if (
    left.kind !== right.kind
    || left.clipId !== right.clipId
    || left.trackId !== right.trackId
    || left.laneId !== right.laneId
    || left.itemId !== right.itemId
  ) {
    return false;
  }

  const leftClipIds = left.clipIds ?? [];
  const rightClipIds = right.clipIds ?? [];
  if (leftClipIds.length !== rightClipIds.length) {
    return false;
  }

  const leftData = left.dataItems ?? [];
  const rightData = right.dataItems ?? [];
  if (leftData.length !== rightData.length || leftData.some((ref, i) => ref.laneId !== rightData[i].laneId || ref.itemId !== rightData[i].itemId)) return false;

  return leftClipIds.every((clipId, index) => clipId === rightClipIds[index]);
}
