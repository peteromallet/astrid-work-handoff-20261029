/**
 * UI renderer contracts for the Astrid Editor SDK.
 *
 * Hosts the generic {@link ExtensionRenderer} type and the {@link ExtensionUiService}
 * exposed as `ctx.ui` during extension activation. Render-backed contributions
 * (e.g. `timelineOverlay`) declare a required `render` id in the manifest and
 * bind the matching renderer imperatively via `ui.registerRenderer()`.
 *
 * This module contains only data-only types and read-only surfaces; no
 * registry, provider, resolver, DOM, or React behaviour lives here.
 *
 * @publicContract
 */

import type { DisposeHandle } from './dispose';
import type { TimelineViewStore } from './video/timeline/viewState';
import type { TranscriptPanelAdapter } from './video/transcript';

/** A viewport rectangle, in CSS pixels, anchoring a host-owned frame tooltip. */
export interface PanelFrameAnchor {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PanelPreviewService {
  /** Show the composed film at timeline seconds. Dispose on leave, scroll or hide. */
  showFrame(input: { readonly seconds: number; readonly anchor: PanelFrameAnchor }): DisposeHandle;
}

/**
 * A clip an extension panel offers to the timeline: the same facts "Add to video" places.
 * The clip type must be one the extension owns; the host rejects anything else.
 */
export interface PanelClipSpec {
  /** A clip type declared and registered by the dragging extension. */
  readonly clipType: string;
  /** Source range start, seconds (>= 0). */
  readonly from: number;
  /** Source range end, seconds (> from). */
  readonly to: number;
  /** Playback rate; defaults to 1. */
  readonly speed?: number;
  /** Clip label shown on the timeline. */
  readonly label?: string;
  /** The clip's `app` sidecar (JSON-serialisable, bounded by the host). */
  readonly app?: Readonly<Record<string, unknown>>;
}

/**
 * Props to spread on any element that should drag a clip onto the timeline. They are
 * structural (no React dependency): `draggable`, `onDragStart`, `onDragEnd`.
 */
export interface PanelClipDragProps {
  readonly draggable: true;
  readonly onDragStart: (event: { readonly dataTransfer: DataTransfer | null }) => void;
  readonly onDragEnd: () => void;
}

/** Optional video context; a generic panel needs neither playback nor a lane. */
export interface PanelVideoAdapter {
  readonly view: TimelineViewStore;
  readonly transcript?: TranscriptPanelAdapter;
  readonly preview?: PanelPreviewService;
  /** Seek through the host player. The adapter owns validation/projection. */
  seek(seconds: number): void;
  /** Select these clips in the timeline, replacing the current selection. Unknown ids
   *  are ignored; an empty list clears it. Optional: absent where the host has no timeline. */
  select?(clipIds: readonly string[]): void;
  /**
   * Make an element a drag source for `spec`: spread the result on it. Dropping on the
   * timeline inserts the clip at the drop time and track and selects it. Returns null when
   * the spec is invalid or its clip type is not owned by this extension (nothing can be
   * dragged), or where the host has no timeline. Optional.
   */
  dragSource?(spec: PanelClipSpec): PanelClipDragProps | null;
}

/** Props supplied to a registered trusted React panel renderer. */
export interface PanelRenderProps {
  /** Host-controlled extension settings surface, when supplied by the dock. */
  readonly settings?: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void };
  /** Host-owned full-screen mode, present only where the host offers one. Lay out from your
   *  measured size, not from `active`; your DOM may move while mounted. */
  readonly fullscreen?: { readonly active: boolean; readonly enter: () => void; readonly exit: () => void };
  /** Stable for this contribution in this mounted host, distinct between hosts. */
  readonly instanceId: string;
  /** Hidden panels remain mounted; suspend observations while false. */
  readonly visible: boolean;
  readonly video?: PanelVideoAdapter;
}

/**
 * A renderer function registered by an extension and invoked by the host
 * with host-owned props.
 *
 * `Props` is the render-time props contract owned by the consuming family
 * (e.g. {@link TimelineOverlayRenderProps} for `timelineOverlay`). Renderers
 * are trusted local code; the return value is rendered by the host surface
 * (a React node for host React surfaces).
 */
export type ExtensionRenderer<Props> = (props: Props) => unknown;

/**
 * UI service available as `ctx.ui` during activate().
 *
 * Exposes only renderer registration. Extensions declare render-backed
 * contributions in their manifest (a required `render` id) and bind the
 * matching renderer imperatively via `registerRenderer()`. The returned
 * {@link DisposeHandle} unregisters the renderer on dispose.
 *
 * No other UI surface is exposed: chrome chrome/slot placement, dialogs,
 * and panels are governed by their own manifest contributions and services.
 */
export interface ExtensionUiService {
  /**
   * Register a renderer for a render-backed contribution.
   *
   * The `renderId` must match the `render` field of a contribution declared
   * by this extension in its manifest (e.g. a `timelineOverlay` contribution).
   *
   * Returns a DisposeHandle that unregisters the renderer when dispose() is
   * called (safe to call multiple times; idempotent).
   */
  registerRenderer<Props>(
    renderId: string,
    renderer: ExtensionRenderer<Props>,
  ): DisposeHandle;
}
