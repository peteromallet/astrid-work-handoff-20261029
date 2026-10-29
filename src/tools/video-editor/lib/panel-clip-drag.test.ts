import { describe, expect, it, vi } from 'vitest';
import type { TimelineOps } from '@/sdk/video/timeline/timelineOps';
import {
  PANEL_CLIP_DRAG_TYPE,
  applyPanelClipPlacement,
  createPanelClipDragSource,
  isPanelClipDrag,
  planPanelClipPlacement,
  readPanelClipDrag,
  validatePanelClipSpec,
} from './panel-clip-drag.ts';

const OWNER = 'acme.worlds';
const ownership = { ownerOf: (clipType: string) => (clipType === 'acme.scene' ? OWNER : clipType === 'other.clip' ? 'someone.else' : undefined) };
const spec = { clipType: 'acme.scene', from: 2, to: 8, speed: 1.5, label: 'Shot 1', app: { liveScene: { revision: 'r1' } } };

function transfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: 'none',
    setData: (type: string, value: string) => { data.set(type, value); },
    getData: (type: string) => data.get(type) ?? '',
    get types() { return [...data.keys()]; },
  } as unknown as DataTransfer & { types: string[] };
}

describe('validatePanelClipSpec', () => {
  it('accepts a spec for an owned clip type and freezes a copy', () => {
    const result = validatePanelClipSpec(spec, OWNER, ownership);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec).toEqual(spec);
      expect(Object.isFrozen(result.spec)).toBe(true);
    }
  });
  it('rejects a clip type the extension does not own, or nobody owns', () => {
    expect(validatePanelClipSpec({ ...spec, clipType: 'other.clip' }, OWNER, ownership)).toMatchObject({ ok: false });
    expect(validatePanelClipSpec({ ...spec, clipType: 'nope' }, OWNER, ownership)).toMatchObject({ ok: false });
    expect(validatePanelClipSpec(spec, 'someone.else', ownership)).toMatchObject({ ok: false });
  });
  it.each([
    ['null', null],
    ['no clipType', { ...spec, clipType: '' }],
    ['negative from', { ...spec, from: -1 }],
    ['to <= from', { ...spec, to: 2 }],
    ['NaN to', { ...spec, to: Number.NaN }],
    ['zero speed', { ...spec, speed: 0 }],
    ['long label', { ...spec, label: 'x'.repeat(201) }],
    ['array app', { ...spec, app: [] }],
  ])('rejects %s', (_name, bad) => {
    expect(validatePanelClipSpec(bad, OWNER, ownership)).toMatchObject({ ok: false });
  });
});

describe('createPanelClipDragSource', () => {
  const source = createPanelClipDragSource(OWNER, ownership);
  it('returns null for an invalid or foreign spec so nothing can be dragged', () => {
    expect(source({ ...spec, clipType: 'other.clip' })).toBeNull();
    expect(source({ ...spec, to: 0 })).toBeNull();
  });
  it('puts only an opaque token on the transfer and marks the lane kind', () => {
    const props = source(spec)!;
    expect(props.draggable).toBe(true);
    const dt = transfer();
    props.onDragStart({ dataTransfer: dt });
    expect(isPanelClipDrag(dt.types)).toBe(true);
    expect(dt.types).toContain('asset-kind:visual');
    expect(dt.getData(PANEL_CLIP_DRAG_TYPE)).toMatch(/^panel-clip-\d+$/);
    expect(dt.getData(PANEL_CLIP_DRAG_TYPE)).not.toContain('acme');
    expect(dt.effectAllowed).toBe('copy');
  });
  it('resolves the live drag during the drop and forgets it on dragend', () => {
    const props = source(spec)!;
    const dt = transfer();
    props.onDragStart({ dataTransfer: dt });
    expect(readPanelClipDrag(dt)).toMatchObject({ extensionId: OWNER, spec });
    props.onDragEnd();
    expect(readPanelClipDrag(dt)).toBeNull();
  });
  it('does not trust a forged token or payload from outside', () => {
    const forged = transfer();
    forged.setData(PANEL_CLIP_DRAG_TYPE, 'panel-clip-9999');
    expect(readPanelClipDrag(forged)).toBeNull();
    const json = transfer();
    json.setData(PANEL_CLIP_DRAG_TYPE, JSON.stringify(spec));
    expect(readPanelClipDrag(json)).toBeNull();
  });
  it('accepts a large scene sidecar and refuses one that is unbounded or cyclic, without a per-render cost', () => {
    const big = { liveScene: { html: 'x'.repeat(2_000_000) } };
    const stringify = vi.spyOn(JSON, 'stringify');
    const props = source({ ...spec, app: big })!;
    expect(stringify).not.toHaveBeenCalled();
    const dt = transfer();
    props.onDragStart({ dataTransfer: dt });
    expect(isPanelClipDrag(dt.types)).toBe(true);
    stringify.mockRestore();

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const refused = transfer();
    source({ ...spec, app: cyclic })!.onDragStart({ dataTransfer: refused });
    expect(isPanelClipDrag(refused.types)).toBe(false);
    const huge = transfer();
    source({ ...spec, app: { html: 'x'.repeat(17 * 1024 * 1024) } })!.onDragStart({ dataTransfer: huge });
    expect(isPanelClipDrag(huge.types)).toBe(false);
  });
  it('ignores a drag start without a transfer', () => {
    expect(() => source(spec)!.onDragStart({ dataTransfer: null })).not.toThrow();
  });
});

describe('planPanelClipPlacement', () => {
  const drag = { extensionId: OWNER, spec: validatePanelClipSpec(spec, OWNER, ownership).ok ? spec : spec };
  const tracks = [{ id: 'V1', kind: 'visual' }, { id: 'A1', kind: 'audio' }] as never;
  const base = { drag, tracks, clipIds: new Set(['clip-1']), selectedTrackId: null, time: 12.5, version: 7 };
  it('inserts on the dropped visual track at the drop time with the sidecar and range', () => {
    const plan = planPanelClipPlacement({ ...base, trackId: 'V1', isNewTrack: false })!;
    expect(plan.trackId).toBe('V1');
    expect(plan.clipId).toBe('clip-2');
    expect(plan.patch).toMatchObject({ version: 7, source: OWNER });
    expect(plan.patch.operations).toEqual([
      { op: 'clip.add', target: 'clip-2', payload: { track: 'V1', at: 12.5, clipType: 'acme.scene' }, order: 0 },
      { op: 'clip.update', target: 'clip-2', payload: { mode: 'merge', from: 2, to: 8, speed: 1.5, app: spec.app, label: 'Shot 1' }, order: 1 },
    ]);
  });
  it('falls back to a compatible track when dropped on an audio lane', () => {
    expect(planPanelClipPlacement({ ...base, trackId: 'A1', isNewTrack: false })!.trackId).toBe('V1');
  });
  it('adds a fresh visual track for a new-track drop or when none exists', () => {
    const fresh = planPanelClipPlacement({ ...base, trackId: undefined, isNewTrack: true })!;
    expect(fresh.patch.operations[0]).toMatchObject({ op: 'track.add', payload: { kind: 'visual' } });
    expect(fresh.trackId).not.toBe('V1');
    const none = planPanelClipPlacement({ ...base, tracks: [{ id: 'A1', kind: 'audio' }] as never, trackId: undefined, isNewTrack: false })!;
    expect(none.patch.operations[0]).toMatchObject({ op: 'track.add', target: none.trackId });
  });
  it('clamps a negative drop time to zero and defaults speed to 1', () => {
    const plan = planPanelClipPlacement({ ...base, drag: { extensionId: OWNER, spec: { clipType: 'acme.scene', from: 0, to: 1 } }, time: -4, trackId: 'V1', isNewTrack: false })!;
    expect(plan.patch.operations[0].payload).toMatchObject({ at: 0 });
    expect(plan.patch.operations[1].payload).toEqual({ mode: 'merge', from: 0, to: 1, speed: 1 });
  });
});

describe('applyPanelClipPlacement', () => {
  const placement = { patch: { version: 1, operations: [], source: OWNER }, clipId: 'clip-2', trackId: 'V1' };
  const ops = (valid: boolean) => ({
    validate: vi.fn(() => (valid ? { valid: true, diagnostics: [] } : { valid: false, diagnostics: [{ message: 'no room' }] })),
    apply: vi.fn(() => ({})),
    flush: vi.fn(async () => ({ version: 2 })),
  }) as unknown as TimelineOps & { apply: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
  it('validates, applies and flushes, returning the new clip id', async () => {
    const o = ops(true);
    await expect(applyPanelClipPlacement(o, placement)).resolves.toBe('clip-2');
    expect(o.apply).toHaveBeenCalledWith(placement.patch);
    expect(o.flush).toHaveBeenCalled();
  });
  it('throws and applies nothing when the patch is invalid', async () => {
    const o = ops(false);
    await expect(applyPanelClipPlacement(o, placement)).rejects.toThrow('no room');
    expect(o.apply).not.toHaveBeenCalled();
  });
});
