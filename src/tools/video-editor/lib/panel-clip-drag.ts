/**
 * Drag a clip from an extension panel onto the timeline.
 *
 * The DataTransfer carries only an opaque token. The validated spec stays in this module,
 * keyed by that token, so a foreign drag (another page, a forged payload) can never insert
 * a clip, and the dragging extension's identity is the one the host bound, not a claim.
 * The timeline's existing external-drop path (indicator, row/time resolution, edit
 * permission) is reused; only the final insert differs from an asset drop.
 */
import type { PanelClipDragProps, PanelClipSpec } from '@astrid/editor-sdk';
import type { TimelinePatch, TimelinePatchOperation } from '@/sdk/video/timeline/patch';
import type { TimelineOps } from '@/sdk/video/timeline/timelineOps';
import type { TrackDefinition } from '@/tools/video-editor/types/index.ts';
import { getCompatibleTrackId } from '@/tools/video-editor/lib/coordinate-utils.ts';

/** Lower-case on purpose: browsers lower-case DataTransfer keys. */
export const PANEL_CLIP_DRAG_TYPE = 'application/x-astrid-panel-clip';
/** The sidecar of a live scene carries its whole package (up to 8 MiB of entry HTML), so the cap is generous. */
const MAX_APP_CHARS = 16 * 1024 * 1024;
const MAX_LABEL = 200;

/** Size of the sidecar as JSON, or null when it cannot be serialised. Costly: call once per drag, not per render. */
export function panelClipAppSize(app: unknown): number | null {
  try { return JSON.stringify(app).length; } catch { return null; }
}

export interface PanelClipOwnership {
  /** Who owns a clip type, as the host's clip-type registry knows it. */
  ownerOf(clipType: string): string | undefined;
}

export type PanelClipValidation =
  | { readonly ok: true; readonly spec: PanelClipSpec }
  | { readonly ok: false; readonly reason: string };

export function validatePanelClipSpec(
  spec: unknown,
  extensionId: string,
  ownership: PanelClipOwnership,
): PanelClipValidation {
  if (!spec || typeof spec !== 'object') return { ok: false, reason: 'clip spec must be an object' };
  const { clipType, from, to, speed, label, app } = spec as Record<string, unknown>;
  if (typeof clipType !== 'string' || !clipType) return { ok: false, reason: 'clipType is required' };
  if (ownership.ownerOf(clipType) !== extensionId) {
    return { ok: false, reason: `clip type ${clipType} is not owned by ${extensionId}` };
  }
  if (typeof from !== 'number' || typeof to !== 'number' || !Number.isFinite(from) || !Number.isFinite(to)
    || from < 0 || to <= from) {
    return { ok: false, reason: 'from/to must be finite with 0 <= from < to' };
  }
  if (speed !== undefined && (typeof speed !== 'number' || !Number.isFinite(speed) || speed <= 0)) {
    return { ok: false, reason: 'speed must be a positive number' };
  }
  if (label !== undefined && (typeof label !== 'string' || label.length > MAX_LABEL)) {
    return { ok: false, reason: 'label must be a short string' };
  }
  if (app !== undefined) {
    if (!app || typeof app !== 'object' || Array.isArray(app)) return { ok: false, reason: 'app must be an object' };
  }
  return {
    ok: true,
    spec: Object.freeze({
      clipType, from, to,
      ...(speed !== undefined ? { speed: speed as number } : {}),
      ...(label !== undefined ? { label: label as string } : {}),
      ...(app !== undefined ? { app: app as Record<string, unknown> } : {}),
    }),
  };
}

interface ActiveDrag { readonly extensionId: string; readonly spec: PanelClipSpec }
const active = new Map<string, ActiveDrag>();
let sequence = 0;

/** Build the per-extension `video.dragSource`. */
export function createPanelClipDragSource(extensionId: string, ownership: PanelClipOwnership) {
  const mine = new Set<string>();
  return (spec: PanelClipSpec): PanelClipDragProps | null => {
    const checked = validatePanelClipSpec(spec, extensionId, ownership);
    if (!checked.ok) return null;
    return {
      draggable: true,
      onDragStart: (event) => {
        const transfer = event.dataTransfer;
        if (!transfer) return;
        // Checked here, once per drag, because stringifying a scene's package on every render would be wasteful.
        if (checked.spec.app) {
          const size = panelClipAppSize(checked.spec.app);
          if (size === null || size > MAX_APP_CHARS) return;
        }
        const token = `panel-clip-${++sequence}`;
        mine.add(token);
        active.set(token, { extensionId, spec: checked.spec });
        transfer.effectAllowed = 'copy';
        transfer.setData(PANEL_CLIP_DRAG_TYPE, token);
        // The timeline reads the lane kind from the types during dragover.
        transfer.setData('asset-kind:visual', '');
      },
      // A re-render may swap these handlers mid-drag, so end clears every token this source issued.
      onDragEnd: () => {
        for (const token of mine) active.delete(token);
        mine.clear();
      },
    };
  };
}

export function isPanelClipDrag(types: ArrayLike<string>): boolean {
  return Array.from(types).includes(PANEL_CLIP_DRAG_TYPE);
}

/** The live drag this transfer refers to, or null for a foreign/stale token. */
export function readPanelClipDrag(transfer: Pick<DataTransfer, 'getData'>): ActiveDrag | null {
  const token = transfer.getData(PANEL_CLIP_DRAG_TYPE);
  return token ? active.get(token) ?? null : null;
}

export interface PanelClipPlacementInput {
  readonly drag: ActiveDrag;
  readonly tracks: readonly TrackDefinition[];
  readonly clipIds: ReadonlySet<string>;
  readonly trackId: string | undefined;
  readonly isNewTrack: boolean;
  readonly selectedTrackId: string | null;
  readonly time: number;
  readonly version: number;
}

export interface PanelClipPlacement {
  readonly patch: TimelinePatch;
  readonly clipId: string;
  readonly trackId: string;
}

function freshId(prefix: string, taken: ReadonlySet<string>): string {
  for (let n = taken.size + 1; ; n += 1) {
    const id = `${prefix}${n}`;
    if (!taken.has(id)) return id;
  }
}

/** The patch that inserts the dragged clip (same operations "Add to video" emits). */
export function planPanelClipPlacement(input: PanelClipPlacementInput): PanelClipPlacement | null {
  const { drag, tracks, clipIds } = input;
  const existing = input.isNewTrack ? null
    : getCompatibleTrackId([...tracks], input.trackId, 'visual', input.selectedTrackId);
  const operations: TimelinePatchOperation[] = [];
  let order = 0;
  let trackId = existing;
  if (!trackId) {
    trackId = freshId('V', new Set(tracks.map((track) => track.id)));
    operations.push({ op: 'track.add', target: trackId, payload: { kind: 'visual', label: trackId }, order: order++ });
  }
  const clipId = freshId('clip-', clipIds);
  const { spec } = drag;
  operations.push({
    op: 'clip.add', target: clipId,
    payload: { track: trackId, at: Math.max(0, input.time), clipType: spec.clipType }, order: order++,
  });
  operations.push({
    op: 'clip.update', target: clipId,
    payload: {
      mode: 'merge', from: spec.from, to: spec.to, speed: spec.speed ?? 1,
      ...(spec.app ? { app: spec.app } : {}),
      ...(spec.label ? { label: spec.label } : {}),
    },
    order: order++,
  });
  return { patch: { version: input.version, operations, source: drag.extensionId }, clipId, trackId };
}

/** Validate, apply and flush the placement; returns the new clip id or throws. */
export async function applyPanelClipPlacement(ops: TimelineOps, placement: PanelClipPlacement): Promise<string> {
  const validation = ops.validate(placement.patch);
  if (!validation.valid) {
    throw new Error(`Panel clip rejected: ${validation.diagnostics.map((item) => item.message).join('; ')}`);
  }
  ops.apply(placement.patch);
  await ops.flush();
  return placement.clipId;
}
