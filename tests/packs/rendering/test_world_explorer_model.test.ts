import { describe, expect, it } from 'vitest';
import type { TimelineSnapshot } from '@astrid/editor-sdk';
import { buildRows } from '../../../astrid/packs/rendering/ui/threejs-live-editor/explorer/rows';
import { LIVE_SCENE_CLIP_TYPE_ID } from '../../../astrid/packs/rendering/ui/threejs-live-editor/identity';
import {
  TravelClock,
  shotIndexAt,
  shotsOrImplicit,
  chooseDefaultWorld,
  clampStretch,
  clipName,
  eventsInShot,
  exploreKey,
  fitToBox,
  freeVisualTrack,
  KEY_MAP,
  MIN_STRETCH,
  keyAction,
  lastWorldKey,
  moveRangeHandle,
  newClipId,
  libraryContent,
  parseLibrary,
  removeEntry,
  renameEntry,
  upsertEntry,
  withInfo,
  setStretchEnd,
  setStretchStart,
  sliderKeyTime,
  speedScaleLabel,
  stretchMatches,
  worldTitleFromFilename,
  stretchDuration,
  wheelSpeedScale,
  worldKey,
  worldsFromSnapshot,
  worldTimeIn,
  type ShotMove,
  type LibraryEntry,
  type WorldEvent,
} from '../../../astrid/packs/rendering/ui/threejs-live-editor/explorer/model';

function packageBody(duration: number, authoredFps = 24) {
  return JSON.stringify({ formatVersion: 1, entry: { filename: 'index.html' }, manifest: { formatVersion: 1, entry: 'index.html', duration, authoredFps } });
}

function worldClip(id: string, track: string, at: number, world: { objectId: string; revision: string; duration?: number; body?: string }, extra: Record<string, unknown> = {}) {
  return {
    id, track, at, duration: 2, clipType: LIVE_SCENE_CLIP_TYPE_ID,
    app: { liveScene: { revision: world.revision, source: { objectId: world.objectId, revision: world.revision }, packageBody: world.body ?? packageBody(world.duration ?? 4), html: '<html></html>' } },
    ...extra,
  };
}

function snap(partial: Record<string, unknown>): TimelineSnapshot {
  return {
    projectId: 'p1', baseVersion: 1, currentVersion: 1, extensionRequirements: [], assetKeys: [], app: {},
    clips: [], tracks: [{ id: 'V1', kind: 'visual', label: 'V1', muted: false }], ...partial,
  } as unknown as TimelineSnapshot;
}

function entry(objectId: string, revision = 'r1', name = objectId): LibraryEntry {
  return { objectId, revision, name, duration: 4, authoredFps: 24, events: [{ name: 'hit', start: 1 }], shots: [] };
}

describe('worldsFromSnapshot', () => {
  it('groups repeated uses of one world and maps from/to/speed', () => {
    const s = snap({
      clips: [
        worldClip('c2', 'V2', 5, { objectId: 'w', revision: 'a' }, { sourceOffset: 1, sourceEnd: 3, rate: 2 }),
        worldClip('c1', 'V1', 1, { objectId: 'w', revision: 'a' }),
      ],
    });
    const worlds = worldsFromSnapshot(s);
    expect(worlds).toHaveLength(1);
    expect(worldKey(worlds[0])).toBe('w@a');
    expect(worlds[0].duration).toBe(4);
    expect(worlds[0].authoredFps).toBe(24);
    expect(worlds[0].uses).toEqual([
      { clipId: 'c1', track: 'V1', at: 1, from: 0, to: 2, speed: 1 },
      { clipId: 'c2', track: 'V2', at: 5, from: 1, to: 3, speed: 2 },
    ]);
    expect(worlds[0].liveScene).toMatchObject({ revision: 'a' });
  });

  it('orders worlds by first use and separates different worlds', () => {
    const s = snap({
      clips: [
        worldClip('b', 'V1', 9, { objectId: 'B', revision: 'x' }),
        worldClip('a', 'V1', 2, { objectId: 'A', revision: 'x' }),
        worldClip('a2', 'V1', 12, { objectId: 'A', revision: 'x' }),
      ],
    });
    const worlds = worldsFromSnapshot(s);
    expect(worlds.map((w) => w.objectId)).toEqual(['A', 'B']);
    expect(worlds[0].uses.map((u) => u.clipId)).toEqual(['a', 'a2']);
  });

  it('separates same objectId at different revisions', () => {
    const s = snap({ clips: [worldClip('a', 'V1', 0, { objectId: 'A', revision: 'r1' }), worldClip('b', 'V1', 1, { objectId: 'A', revision: 'r2' })] });
    expect(worldsFromSnapshot(s).map(worldKey)).toEqual(['A@r1', 'A@r2']);
  });

  it('ignores non-live-scene clips and malformed live scene data', () => {
    const s = snap({
      clips: [
        { id: 'img', track: 'V1', at: 0, duration: 2, clipType: 'haus.astrid.image', app: {} },
        { id: 'noapp', track: 'V1', at: 0, duration: 2, clipType: LIVE_SCENE_CLIP_TYPE_ID },
        worldClip('badbody', 'V1', 0, { objectId: 'X', revision: 'r', body: '{not json' }),
        worldClip('nodur', 'V1', 0, { objectId: 'Y', revision: 'r', body: packageBody(0) }),
      ],
    });
    expect(worldsFromSnapshot(s)).toEqual([]);
  });
});

describe('library document model', () => {
  it('parseLibrary gives an empty list for non-document content', () => {
    expect(parseLibrary(undefined)).toEqual([]);
    expect(parseLibrary('nope')).toEqual([]);
    expect(parseLibrary([entry('A')])).toEqual([]);
    expect(parseLibrary({ version: 1 })).toEqual([]);
    expect(parseLibrary({ version: 1, worlds: 'nope' })).toEqual([]);
  });

  it('parseLibrary drops invalid entries and keeps the valid ones', () => {
    expect(parseLibrary({ version: 1, worlds: [entry('ok'), { objectId: 'bad' }, null, { ...entry('neg'), duration: -1 }, { ...entry('fps'), authoredFps: 0 }] }).map((e) => e.objectId)).toEqual(['ok']);
  });

  it('parseLibrary drops invalid events and shots, keeping the valid ones', () => {
    const [read] = parseLibrary({
      version: 1,
      worlds: [{
        ...entry('A'),
        events: [{ name: 'ok', start: 1 }, { name: 'span', start: 2, end: 3 }, { name: 'bad' }, { name: 'nan', start: 2, end: 'x' }],
        shots: [{ name: 'cam', start: 0, end: 4 }, { name: 'backwards', start: 5, end: 2 }, { name: 'nan', start: 0, end: 1, worldStart: NaN }],
      }],
    });
    expect(read.events).toEqual([{ name: 'ok', start: 1 }, { name: 'span', start: 2, end: 3 }]);
    expect(read.shots).toEqual([{ name: 'cam', start: 0, end: 4 }]);
  });

  it('reads an entry saved with only the old stops field as having no events or shots', () => {
    const list = parseLibrary({ version: 1, worlds: [{ objectId: 'A', revision: 'r1', name: 'A', duration: 4, authoredFps: 24, stops: [{ time: 1, name: 'hit' }] }] });
    expect(list).toEqual([{ objectId: 'A', revision: 'r1', name: 'A', duration: 4, authoredFps: 24, events: [], shots: [] }]);
  });

  it('keeps the sample flag only when it is true', () => {
    const [sample] = parseLibrary({ version: 1, worlds: [{ ...entry('S'), sample: true }] });
    expect(sample.sample).toBe(true);
    const [notSample] = parseLibrary({ version: 1, worlds: [{ ...entry('N'), sample: 'yes' }] });
    expect(notSample).not.toHaveProperty('sample');
  });

  it('libraryContent round-trips through parseLibrary', () => {
    const list = [{ ...entry('A'), sample: true as const }, entry('B', 'r2')];
    expect(libraryContent(list)).toEqual({ version: 1, worlds: list });
    expect(parseLibrary(libraryContent(list))).toEqual(list);
  });

  it('upsertEntry replaces in place by worldKey and appends new worlds', () => {
    const list = [entry('A', 'r1', 'first'), entry('B')];
    const replaced = upsertEntry(list, entry('A', 'r1', 'renamed'));
    expect(replaced.map((e) => e.name)).toEqual(['renamed', 'B']);
    expect(upsertEntry(replaced, entry('A', 'r2')).map(worldKey)).toEqual(['A@r1', 'B@r1', 'A@r2']);
    expect(list[0].name).toBe('first');
  });

  it('removeEntry removes by key and leaves the rest in order', () => {
    const list = [entry('A'), entry('B'), entry('A', 'r2')];
    expect(removeEntry(list, 'A@r2').map(worldKey)).toEqual(['A@r1', 'B@r1']);
    expect(removeEntry(list, 'C@r1')).toEqual(list);
  });

  it('renameEntry trims the new name, ignores a blank one, and touches only the keyed entry', () => {
    const list = [entry('A'), entry('B')];
    expect(renameEntry(list, 'A@r1', '  Lantern Valley  ').map((e) => e.name)).toEqual(['Lantern Valley', 'B']);
    expect(renameEntry(list, 'A@r1', '   ')).toEqual(list);
    expect(renameEntry(list, 'C@r1', 'Other')).toEqual(list);
  });

  it('withInfo returns the same content when nothing changed', () => {
    const list = [{ ...entry('A'), events: [{ name: 'hit', start: 1 }], shots: [{ name: 'Wide', start: 0, end: 4 }] }];
    expect(withInfo(list, 'A@r1', { events: [{ name: 'hit', start: 1 }], shots: [{ name: 'Wide', start: 0, end: 4 }] })).toEqual(list);
    expect(withInfo(list, 'B@r1', { events: [{ name: 'x', start: 0 }], shots: [] })).toEqual(list);
  });

  it('withInfo updates events and shots of the keyed entry and keeps its other fields', () => {
    const list = [entry('A'), entry('B')];
    const bridge: WorldEvent[] = [{ name: 'Bridge', start: 2 }];
    const cam: ShotMove[] = [{ name: 'Wide', start: 0, end: 4 }];
    const next = withInfo(list, 'A@r1', { events: bridge, shots: cam });
    expect(next).toEqual([{ ...entry('A'), events: bridge, shots: cam }, entry('B')]);
    expect(withInfo(next, 'A@r1', { events: [], shots: [] })[0]).toMatchObject({ events: [], shots: [], name: 'A' });
  });

  it('withInfo ignores a world that is not in the library', () => {
    const list = [entry('A')];
    expect(withInfo(list, 'B@r1', { events: [{ name: 'Bridge', start: 2 }], shots: [] })).toEqual(list);
  });
});

describe('stretch', () => {
  it('computes timeline duration from speed', () => {
    expect(stretchDuration({ from: 1, to: 5, speed: 2 })).toBe(2);
  });

  it('clamps to the world and keeps a minimum length', () => {
    expect(clampStretch({ from: -2, to: 99, speed: 1 }, 4)).toEqual({ from: 0, to: 4, speed: 1 });
    expect(clampStretch({ from: 3.99, to: 3.99, speed: 1 }, 4).to).toBeCloseTo(4);
    expect(clampStretch({ from: 3.95, to: 3.95, speed: 1 }, 4).from).toBeCloseTo(3.9);
    expect(clampStretch({ from: 0, to: 2, speed: 0 }, 4).speed).toBe(1);
    expect(clampStretch({ from: 0, to: 2, speed: NaN }, 4).speed).toBe(1);
  });

  it('moves start and end without crossing the other edge', () => {
    const s = { from: 1, to: 3, speed: 1 };
    expect(setStretchStart(s, 0.5, 4)).toEqual({ from: 0.5, to: 3, speed: 1 });
    expect(setStretchStart(s, 3.5, 4).from).toBeCloseTo(2.9);
    expect(setStretchEnd(s, 0.2, 4).to).toBeCloseTo(1.1);
    expect(setStretchEnd(s, 9, 4).to).toBe(4);
  });
});

describe('keyAction', () => {
  const ctx = { time: 10, duration: 20 };
  it('maps space to toggle', () => {
    expect(keyAction({ key: ' ', shiftKey: false }, ctx)).toEqual({ type: 'toggle' });
    expect(keyAction({ key: 'Space', shiftKey: false }, ctx)).toEqual({ type: 'toggle' });
  });
  it('seeks by 1s, or 5s with shift, clamped', () => {
    expect(keyAction({ key: 'ArrowLeft', shiftKey: false }, ctx)).toEqual({ type: 'seek', time: 9 });
    expect(keyAction({ key: 'ArrowRight', shiftKey: true }, ctx)).toEqual({ type: 'seek', time: 15 });
    expect(keyAction({ key: 'ArrowLeft', shiftKey: true }, { time: 2, duration: 20 })).toEqual({ type: 'seek', time: 0 });
    expect(keyAction({ key: 'ArrowRight', shiftKey: true }, { time: 18, duration: 20 })).toEqual({ type: 'seek', time: 20 });
  });
  it('maps i and o to stretch edges in either case', () => {
    expect(keyAction({ key: 'i', shiftKey: false }, ctx)).toEqual({ type: 'setStart' });
    expect(keyAction({ key: 'I', shiftKey: true }, ctx)).toEqual({ type: 'setStart' });
    expect(keyAction({ key: 'o', shiftKey: false }, ctx)).toEqual({ type: 'setEnd' });
    expect(keyAction({ key: 'O', shiftKey: false }, ctx)).toEqual({ type: 'setEnd' });
  });
  it('ignores other keys', () => {
    expect(keyAction({ key: 'x', shiftKey: false }, ctx)).toBeUndefined();
  });
});

describe('freeVisualTrack', () => {
  const clip = (id: string, track: string, at: number, duration: number) => ({ id, track, at, duration, clipType: 'x' });

  it('returns the first visual output track with no overlap', () => {
    const s = snap({
      tracks: [{ id: 'V1', kind: 'visual', label: '', muted: false }, { id: 'V2', kind: 'visual', label: '', muted: false }],
      clips: [clip('a', 'V1', 0, 5)],
    });
    expect(freeVisualTrack(s, 2, 1)).toEqual({ track: 'V2', isNew: false });
    expect(freeVisualTrack(s, 5, 1)).toEqual({ track: 'V1', isNew: false });
  });

  it('skips tracks blocked by shot placements', () => {
    const s = snap({
      tracks: [{ id: 'V1', kind: 'visual', label: '', muted: false }, { id: 'V2', kind: 'visual', label: '', muted: false }],
      shots: [{ id: 'sh', shotId: 'x', name: 'x', at: 0, duration: 3, track: 'V1', clips: [] }],
    });
    expect(freeVisualTrack(s, 1, 1).track).toBe('V2');
  });

  it('creates a new V id when every track is busy, avoiding existing ids', () => {
    const s = snap({
      tracks: [{ id: 'V1', kind: 'visual', label: '', muted: false }, { id: 'V2', kind: 'visual', label: '', muted: false }],
      clips: [clip('a', 'V1', 0, 5), clip('b', 'V2', 0, 5)],
    });
    expect(freeVisualTrack(s, 0, 1)).toEqual({ track: 'V3', isNew: true });
  });

  it('ignores source-role and audio tracks', () => {
    const s = snap({
      tracks: [
        { id: 'V1', kind: 'visual', label: '', muted: false, role: 'source' },
        { id: 'A1', kind: 'audio', label: '', muted: false },
      ],
    });
    expect(freeVisualTrack(s, 0, 1)).toEqual({ track: 'V2', isNew: true });
  });
});

describe('newClipId', () => {
  it('returns the smallest free n', () => {
    const s = snap({ clips: [{ id: 'world-1' }, { id: 'world-3' }] });
    expect(newClipId(s)).toBe('world-2');
    expect(newClipId(snap({}), 'dup')).toBe('dup-1');
  });
});

describe('TravelClock', () => {
  it('advances at speed while playing and records the first tick only', () => {
    const c = new TravelClock({ duration: 10 });
    c.setSpeed(2);
    c.play();
    c.tick(1000);
    expect(c.time).toBe(0);
    c.tick(1500);
    expect(c.time).toBeCloseTo(0.5); // 500ms gap clamped to 250ms, x2
    c.pause();
    c.tick(3000);
    expect(c.time).toBeCloseTo(0.5);
  });

  it('stops at the end without loop, and restarts on play', () => {
    const c = new TravelClock({ duration: 1 });
    c.play();
    c.tick(0);
    c.tick(200);
    c.tick(400);
    c.tick(600);
    c.tick(800);
    c.tick(1000);
    expect(c.time).toBeCloseTo(1);
    expect(c.playing).toBe(false);
    c.play();
    expect(c.time).toBe(0);
    expect(c.playing).toBe(true);
  });

  it('wraps when looping', () => {
    const c = new TravelClock({ duration: 1, loop: true });
    c.play();
    c.tick(0);
    c.tick(250);
    c.tick(500);
    c.tick(750);
    c.tick(1000);
    c.tick(1250);
    expect(c.playing).toBe(true);
    expect(c.time).toBeCloseTo(0.25);
  });

  it('clamps large gaps to 250ms', () => {
    const c = new TravelClock({ duration: 10 });
    c.play();
    c.tick(0);
    c.tick(60_000);
    expect(c.time).toBeCloseTo(0.25);
  });

  it('seeks clamp and keep the playing state', () => {
    const c = new TravelClock({ duration: 4 });
    c.seek(9);
    expect(c.time).toBe(4);
    c.seek(-1);
    expect(c.time).toBe(0);
    c.play();
    c.seek(2);
    expect(c.playing).toBe(true);
  });

  it('back-pressure: one render in flight, then newer time only', () => {
    const c = new TravelClock({ duration: 10 });
    expect(c.next()).toBe(0);
    expect(c.inFlight).toBe(0);
    expect(c.next()).toBeUndefined();
    c.ack(0);
    expect(c.shown).toBe(0);
    expect(c.inFlight).toBeUndefined();
    expect(c.next()).toBeUndefined();
    c.seek(2);
    expect(c.next()).toBe(2);
    c.seek(3);
    expect(c.next()).toBeUndefined();
    c.ack(2);
    expect(c.next()).toBe(3);
  });

  it('seek while in flight keeps the old render pending until ack', () => {
    const c = new TravelClock({ duration: 10 });
    c.seek(1);
    expect(c.next()).toBe(1);
    c.seek(5);
    expect(c.next()).toBeUndefined();
    expect(c.inFlight).toBe(1);
    c.ack(1);
    expect(c.next()).toBe(5);
  });

  it('fail clears the in-flight render and pauses', () => {
    const c = new TravelClock({ duration: 10 });
    c.play();
    c.tick(0);
    c.tick(100);
    expect(c.next()).toBeDefined();
    c.fail();
    expect(c.inFlight).toBeUndefined();
    expect(c.playing).toBe(false);
    expect(c.next()).toBeDefined();
  });

  it('reset returns to zero, unshown, paused', () => {
    const c = new TravelClock({ duration: 10 });
    c.seek(4);
    c.ack(c.next() as number);
    c.play();
    c.reset();
    expect([c.time, c.shown, c.inFlight, c.playing]).toEqual([0, undefined, undefined, false]);
  });
});

describe('TravelClock window', () => {
  it('starts as the whole world', () => {
    const c = new TravelClock({ duration: 6 });
    expect([c.windowStart, c.windowEnd]).toEqual([0, 6]);
  });

  it('pulls the time into the window and confines seek', () => {
    const c = new TravelClock({ duration: 10 });
    c.setWindow(2, 5);
    expect([c.windowStart, c.windowEnd, c.time]).toEqual([2, 5, 2]);
    c.seek(9);
    expect(c.time).toBe(5);
    c.seek(0);
    expect(c.time).toBe(2);
  });

  it('clamps the window to the world', () => {
    const c = new TravelClock({ duration: 4 });
    c.setWindow(-1, 9);
    expect([c.windowStart, c.windowEnd]).toEqual([0, 4]);
    c.setWindow(3, 1);
    expect([c.windowStart, c.windowEnd]).toEqual([3, 3]);
  });

  it('play from the window end restarts at the window start', () => {
    const c = new TravelClock({ duration: 10 });
    c.setWindow(2, 3);
    c.seek(3);
    c.play();
    expect(c.time).toBe(2);
    expect(c.playing).toBe(true);
  });

  it('stops at the window end without loop', () => {
    const c = new TravelClock({ duration: 10 });
    c.setWindow(2, 3);
    c.seek(2);
    c.play();
    c.tick(0);
    c.tick(250);
    c.tick(500);
    c.tick(750);
    c.tick(1000);
    expect(c.time).toBe(3);
    expect(c.playing).toBe(false);
  });

  it('wraps inside the window when looping', () => {
    const c = new TravelClock({ duration: 10, loop: true });
    c.setWindow(2, 3);
    c.seek(2.5);
    c.play();
    c.tick(0);
    c.tick(250);
    c.tick(500);
    expect(c.time).toBeCloseTo(2);
    c.tick(750);
    expect(c.time).toBeCloseTo(2.25);
    expect(c.playing).toBe(true);
  });

  it('reset returns to the window start', () => {
    const c = new TravelClock({ duration: 10 });
    c.setWindow(2, 5);
    c.seek(4);
    c.reset();
    expect(c.time).toBe(2);
  });

  it('shrinking the duration shrinks the window', () => {
    const c = new TravelClock({ duration: 10 });
    c.setWindow(2, 8);
    c.setDuration(5);
    expect([c.windowStart, c.windowEnd]).toEqual([2, 5]);
    c.setDuration(1);
    expect([c.windowStart, c.windowEnd]).toEqual([1, 1]);
  });
});

describe('shotsOrImplicit', () => {
  it('gives an empty world one implicit whole-world camera', () => {
    expect(shotsOrImplicit([], 4)).toEqual([{ name: 'Whole world', start: 0, end: 4 }]);
    expect(shotsOrImplicit([], -1)).toEqual([{ name: 'Whole world', start: 0, end: 0 }]);
  });

  it('returns a copy of declared shots', () => {
    const cams: ShotMove[] = [{ name: 'A', start: 0, end: 2 }];
    const out = shotsOrImplicit(cams, 4);
    expect(out).toEqual(cams);
    expect(out).not.toBe(cams);
  });
});

describe('worldTimeIn', () => {
  it('defaults worldStart to start, so world time equals source time', () => {
    const cam: ShotMove = { name: 'a', start: 2, end: 6 };
    expect(worldTimeIn(cam, 2)).toBe(2);
    expect(worldTimeIn(cam, 5)).toBe(5);
  });

  it('offsets world time by worldStart', () => {
    const cam: ShotMove = { name: 'b', start: 2, end: 6, worldStart: 10 };
    expect(worldTimeIn(cam, 2)).toBe(10);
    expect(worldTimeIn(cam, 5)).toBe(13);
  });
});

describe('shotIndexAt', () => {
  const cams: ShotMove[] = [{ name: 'a', start: 0, end: 4 }, { name: 'b', start: 4, end: 8 }];

  it('finds the camera holding a time', () => {
    expect(shotIndexAt(cams, 2)).toBe(0);
    expect(shotIndexAt(cams, 6)).toBe(1);
    expect(shotIndexAt(cams, 0)).toBe(0);
  });

  it('gives a shared boundary to the later camera', () => {
    expect(shotIndexAt(cams, 4)).toBe(1);
  });

  it('includes the end of the last camera', () => {
    expect(shotIndexAt(cams, 8)).toBe(1);
  });

  it('before the first camera is index 0', () => {
    expect(shotIndexAt([{ name: 'a', start: 2, end: 4 }], 1)).toBe(0);
  });

  it('in a gap, gives the earlier camera', () => {
    const gapped: ShotMove[] = [{ name: 'a', start: 0, end: 2 }, { name: 'b', start: 5, end: 8 }];
    expect(shotIndexAt(gapped, 3.5)).toBe(0);
  });

  it('past the last camera, gives the last camera', () => {
    expect(shotIndexAt(cams, 9)).toBe(1);
  });

  it('is 0 with no shots', () => {
    expect(shotIndexAt([], 3)).toBe(0);
  });
});

describe('eventsInShot', () => {
  const span = (name: string, start: number, end: number): WorldEvent => ({ name, start, end });

  it('maps events on an aligned camera to source time, clipping spans to the window', () => {
    const cam: ShotMove = { name: 'c', start: 4, end: 8 };
    const events: WorldEvent[] = [
      span('inside', 5, 6),
      { name: 'point-mid', start: 6 },
      { name: 'point-start-edge', start: 4 },
      { name: 'point-end-edge', start: 8 },
      span('clip-left', 2, 6),
      span('clip-right', 7, 12),
      span('before', 0, 3),
      span('after', 9, 10),
    ];
    expect(eventsInShot(events, cam)).toEqual([
      { event: events[0], from: 5, to: 6 },
      { event: events[1], from: 6, to: 6 },
      { event: events[2], from: 4, to: 4 },
      { event: events[3], from: 8, to: 8 },
      { event: events[4], from: 4, to: 6 },
      { event: events[5], from: 7, to: 8 },
    ]);
  });

  it('shows the same event from two shots with different worldStart', () => {
    const event = span('shared', 3, 5);
    const a: ShotMove = { name: 'A', start: 0, end: 4 };
    const b: ShotMove = { name: 'B', start: 10, end: 14, worldStart: 2 };
    expect(eventsInShot([event], a)).toEqual([{ event, from: 3, to: 4 }]);
    expect(eventsInShot([event], b)).toEqual([{ event, from: 11, to: 13 }]);
  });

  it('drops events outside the camera window', () => {
    const cam: ShotMove = { name: 'B', start: 10, end: 14, worldStart: 2 };
    expect(eventsInShot([span('gone', 0, 1), span('late', 7, 9)], cam)).toEqual([]);
  });

  it('returns nothing for no events', () => {
    expect(eventsInShot([], { name: 'c', start: 0, end: 4 })).toEqual([]);
  });
});

describe('exploreKey', () => {
  const move = (axis: 'forward' | 'right' | 'up', sign: 1 | -1) => ({ type: 'move', axis, sign });

  it('maps w/a/s/d and arrows to forward and right with the right sign', () => {
    for (const key of ['w', 'W', 'ArrowUp']) expect(exploreKey({ key })).toEqual(move('forward', 1));
    for (const key of ['s', 'S', 'ArrowDown']) expect(exploreKey({ key })).toEqual(move('forward', -1));
    for (const key of ['d', 'D', 'ArrowRight']) expect(exploreKey({ key })).toEqual(move('right', 1));
    for (const key of ['a', 'A', 'ArrowLeft']) expect(exploreKey({ key })).toEqual(move('right', -1));
  });

  it('maps e/q to up', () => {
    expect(exploreKey({ key: 'e' })).toEqual(move('up', 1));
    expect(exploreKey({ key: 'E' })).toEqual(move('up', 1));
    expect(exploreKey({ key: 'q' })).toEqual(move('up', -1));
    expect(exploreKey({ key: 'Q' })).toEqual(move('up', -1));
  });

  it('maps r to reset and space to pause', () => {
    expect(exploreKey({ key: 'r' })).toEqual({ type: 'reset' });
    expect(exploreKey({ key: 'R' })).toEqual({ type: 'reset' });
    expect(exploreKey({ key: ' ' })).toEqual({ type: 'pause' });
    expect(exploreKey({ key: 'Space' })).toEqual({ type: 'pause' });
  });

  it('ignores modifier chords', () => {
    expect(exploreKey({ key: 'w', ctrlKey: true })).toBeUndefined();
    expect(exploreKey({ key: 'w', metaKey: true })).toBeUndefined();
    expect(exploreKey({ key: 'w', altKey: true })).toBeUndefined();
  });

  it('ignores Escape, Tab, Shift and unbound keys', () => {
    expect(exploreKey({ key: 'Escape' })).toBeUndefined();
    expect(exploreKey({ key: 'Tab' })).toBeUndefined();
    expect(exploreKey({ key: 'Shift' })).toBeUndefined();
    expect(exploreKey({ key: 'x' })).toBeUndefined();
  });
});

describe('wheelSpeedScale', () => {
  it('scrolling up steps through the ladder: 1, 1.5, 2, 3, 5, 10', () => {
    let scale = 1;
    const seen = [1];
    for (let i = 0; i < 6; i++) { scale = wheelSpeedScale(scale, -1); seen.push(scale); }
    expect(seen).toEqual([1, 1.5, 2, 3, 5, 10, 10]);
  });

  it('scrolling down steps back: 1, 0.75, 0.5, 0.25', () => {
    expect(wheelSpeedScale(1, 1)).toBe(0.75);
    expect(wheelSpeedScale(0.75, 1)).toBe(0.5);
    expect(wheelSpeedScale(0.5, 1)).toBe(0.25);
  });

  it('clamps to [0.25, 10]', () => {
    expect(wheelSpeedScale(10, -1)).toBe(10);
    expect(wheelSpeedScale(0.25, 1)).toBe(0.25);
  });

  it('a scale between rungs lands on the next rung in the scrolled direction', () => {
    expect(wheelSpeedScale(1.2, -1)).toBe(1.5);
    expect(wheelSpeedScale(1.2, 1)).toBe(1);
  });

  it('leaves the scale unchanged for zero or invalid deltas', () => {
    expect(wheelSpeedScale(1, 0)).toBe(1);
    expect(wheelSpeedScale(1, NaN)).toBe(1);
  });
});

describe('speedScaleLabel', () => {
  it('formats the scale with a multiplication sign', () => {
    expect(speedScaleLabel(1)).toBe('1×');
    expect(speedScaleLabel(1.25)).toBe('1.25×');
    expect(speedScaleLabel(0.5)).toBe('0.5×');
  });
});

describe('fitToBox', () => {
  it('is bounded by width when the box is tall', () => {
    expect(fitToBox(100, 300, 16 / 9)).toEqual({ width: 100, height: 56 });
  });

  it('is bounded by height when the box is wide', () => {
    expect(fitToBox(300, 100, 16 / 9)).toEqual({ width: 177, height: 99 });
  });

  it('returns whole pixels', () => {
    const { width, height } = fitToBox(333, 201, 4 / 3);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
  });

  it('returns 0x0 for zero or invalid inputs', () => {
    expect(fitToBox(0, 100, 2)).toEqual({ width: 0, height: 0 });
    expect(fitToBox(100, -5, 2)).toEqual({ width: 0, height: 0 });
    expect(fitToBox(100, 100, 0)).toEqual({ width: 0, height: 0 });
    expect(fitToBox(NaN, 100, 1)).toEqual({ width: 0, height: 0 });
    expect(fitToBox(100, 100, NaN)).toEqual({ width: 0, height: 0 });
  });
});

describe('chooseDefaultWorld', () => {
  const timeline = [{ key: 'a' }, { key: 'b' }];
  const library = [{ key: 'c' }, { key: 'd' }];

  it('prefers the last viewed world while it is still listed', () => {
    expect(chooseDefaultWorld(timeline, library, 'b')?.key).toBe('b');
    expect(chooseDefaultWorld(timeline, library, 'd')?.key).toBe('d');
  });

  it('falls back to the first timeline world', () => {
    expect(chooseDefaultWorld(timeline, library, 'gone')?.key).toBe('a');
    expect(chooseDefaultWorld(timeline, library, undefined)?.key).toBe('a');
  });

  it('falls back to the first library world when the timeline is empty', () => {
    expect(chooseDefaultWorld([], library, undefined)?.key).toBe('c');
    expect(chooseDefaultWorld([], library, 'gone')?.key).toBe('c');
  });

  it('is undefined when there are no worlds', () => {
    expect(chooseDefaultWorld([], [], 'a')).toBeUndefined();
  });
});

describe('lastWorldKey', () => {
  it('is per project', () => {
    expect(lastWorldKey('p1')).toBe('lastWorld:p1');
    expect(lastWorldKey('p2')).not.toBe(lastWorldKey('p1'));
    expect(lastWorldKey(null)).toBe('lastWorld:none');
    expect(lastWorldKey(undefined)).toBe('lastWorld:none');
  });
});

describe('moveRangeHandle', () => {
  it('snaps a handle to 0.1 s', () => {
    expect(moveRangeHandle({ from: 1, to: 5 }, 'to', 3.54, { start: 0, end: 10 })).toEqual({ from: 1, to: 3.5 });
    expect(moveRangeHandle({ from: 1, to: 5 }, 'from', 1.26, { start: 0, end: 10 })).toEqual({ from: 1.3, to: 5 });
  });
  const bounds = { start: 0, end: 4 };

  it('moves one handle to the requested time', () => {
    expect(moveRangeHandle({ from: 1, to: 3 }, 'from', 0.5, bounds)).toEqual({ from: 0.5, to: 3 });
    expect(moveRangeHandle({ from: 1, to: 3 }, 'to', 3.5, bounds)).toEqual({ from: 1, to: 3.5 });
  });

  it('clamps each handle inside the bounds', () => {
    expect(moveRangeHandle({ from: 1, to: 3 }, 'from', -2, bounds).from).toBe(0);
    expect(moveRangeHandle({ from: 1, to: 3 }, 'to', 9, bounds).to).toBe(4);
  });

  it('keeps the start handle from passing the end handle', () => {
    const moved = moveRangeHandle({ from: 1, to: 3 }, 'from', 3.5, bounds);
    expect(moved.from).toBeCloseTo(3 - MIN_STRETCH);
    expect(moved.to).toBe(3);
  });

  it('keeps the end handle from passing the start handle', () => {
    const moved = moveRangeHandle({ from: 1, to: 3 }, 'to', 0.2, bounds);
    expect(moved.to).toBeCloseTo(1 + MIN_STRETCH);
    expect(moved.from).toBe(1);
  });

  it('always leaves MIN_STRETCH between the handles when squeezed', () => {
    const squeezedStart = moveRangeHandle({ from: 2, to: 2.05 }, 'from', 2.04, bounds);
    expect(squeezedStart.to - squeezedStart.from).toBeGreaterThanOrEqual(MIN_STRETCH - 1e-9);
    const squeezedEnd = moveRangeHandle({ from: 2, to: 2.05 }, 'to', 2.06, bounds);
    expect(squeezedEnd.to - squeezedEnd.from).toBeGreaterThanOrEqual(MIN_STRETCH - 1e-9);
  });

  it('leaves the handle where it was for a non-finite time', () => {
    expect(moveRangeHandle({ from: 1, to: 3 }, 'from', NaN, bounds)).toEqual({ from: 1, to: 3 });
    expect(moveRangeHandle({ from: 1, to: 3 }, 'to', Infinity, bounds)).toEqual({ from: 1, to: 3 });
  });
});

describe('sliderKeyTime', () => {
  const ctx = { time: 1, start: 0, end: 4, step: 0.5 };
  const press = (key: string, shiftKey = false) => sliderKeyTime({ key, shiftKey }, ctx);

  it('steps by one step on ArrowRight and ArrowLeft', () => {
    expect(press('ArrowRight')).toBe(1.5);
    expect(press('ArrowLeft')).toBe(0.5);
  });

  it('steps five times as far with Shift', () => {
    expect(press('ArrowRight', true)).toBe(3.5);
    expect(press('ArrowLeft', true)).toBe(0);
  });

  it('clamps to the bounds', () => {
    expect(sliderKeyTime({ key: 'ArrowRight', shiftKey: true }, { ...ctx, time: 3 })).toBe(4);
    expect(sliderKeyTime({ key: 'ArrowLeft', shiftKey: false }, { ...ctx, time: 0 })).toBe(0);
  });

  it('jumps to the start on Home and the end on End', () => {
    expect(press('Home')).toBe(0);
    expect(press('End')).toBe(4);
  });

  it('ignores other keys', () => {
    expect(press('a')).toBeUndefined();
    expect(press('Enter')).toBeUndefined();
    expect(press('Tab')).toBeUndefined();
  });
});

describe('stretchMatches', () => {
  const at = (from: number, to: number, speed = 1) => ({ from, to, speed });

  it('matches within half an output frame at the given fps', () => {
    expect(stretchMatches(at(1, 3), at(1.016, 3), 30)).toBe(true);
    expect(stretchMatches(at(1, 3), at(1.02, 3), 30)).toBe(false);
    expect(stretchMatches(at(1, 3), at(1, 3.016), 30)).toBe(true);
    expect(stretchMatches(at(1, 3), at(1, 3.02), 30)).toBe(false);
  });

  it('scales the tolerance with speed above 1', () => {
    expect(stretchMatches(at(1, 3, 2), at(1.02, 3, 2), 30)).toBe(true);
    expect(stretchMatches(at(1, 3, 1), at(1.02, 3, 1), 30)).toBe(false);
  });

  it('rejects a speed difference beyond 1e-3 relative', () => {
    expect(stretchMatches(at(1, 3, 1), at(1, 3, 1.01), 30)).toBe(false);
    expect(stretchMatches(at(1, 3, 1), at(1, 3, 1.0005), 30)).toBe(true);
  });

  it('falls back to 30 fps when fps is invalid', () => {
    for (const fps of [NaN, 0, -5]) {
      expect(stretchMatches(at(1, 3), at(1.016, 3), fps)).toBe(true);
      expect(stretchMatches(at(1, 3), at(1.02, 3), fps)).toBe(false);
    }
  });
});

describe('KEY_MAP', () => {
  const keys = KEY_MAP.map((row) => row.keys).join(' | ');

  it('mentions every key of the free viewer', () => {
    expect(keys).toMatch(/\bW\b/);
    expect(keys).toMatch(/\bA\b/);
    expect(keys).toMatch(/\bS\b/);
    expect(keys).toMatch(/\bD\b/);
    expect(keys).toMatch(/\bE\b/);
    expect(keys).toMatch(/\bQ\b/);
    expect(keys).toMatch(/\bShift\b/);
    expect(keys).toMatch(/\bScroll\b/);
    expect(keys).toMatch(/\bR\b/);
    expect(keys).toMatch(/\bSpace\b/);
  });
});

describe('worldTitleFromFilename, clipName and renameEntry', () => {
  it('turns a file name into a sentence-case world title', () => {
    expect(worldTitleFromFilename('world-template.scene.json')).toBe('World template');
    expect(worldTitleFromFilename('broken.scene')).toBe('Broken');
    expect(worldTitleFromFilename('Lantern_Valley.json')).toBe('Lantern valley');
    expect(worldTitleFromFilename('My.World--v2.SCENE.JSON')).toBe('My world v2');
    expect(worldTitleFromFilename('nested.scene.json.json')).toBe('Nested');
  });

  it('falls back to Imported world when nothing is left of the name', () => {
    expect(worldTitleFromFilename('.scene.json')).toBe('Imported world');
    expect(worldTitleFromFilename('___.json')).toBe('Imported world');
    expect(worldTitleFromFilename('')).toBe('Imported world');
  });

  it('names a clip by its world, with the camera after a middle dot when one is shown', () => {
    expect(clipName('Lantern valley', 'Dawn push')).toBe('Lantern valley · Dawn push');
    expect(clipName('Lantern valley')).toBe('Lantern valley');
    expect(clipName('Lantern valley', '')).toBe('Lantern valley');
  });

  it('renames one entry and leaves the others alone; a blank name changes nothing', () => {
    const list = [
      { objectId: 'o1', revision: 'r1', name: 'First', duration: 10, authoredFps: 24, events: [], shots: [] },
      { objectId: 'o2', revision: 'r1', name: 'Second', duration: 12, authoredFps: 24, events: [], shots: [] },
    ];
    expect(renameEntry(list, 'o2@r1', '  Renamed  ').map((e) => e.name)).toEqual(['First', 'Renamed']);
    expect(renameEntry(list, 'o2@r1', '   ').map((e) => e.name)).toEqual(['First', 'Second']);
    expect(renameEntry(list, 'o2@r1', '')).toEqual(list);
  });
});

describe('timeline world names', () => {
  const body = (manifest: Record<string, unknown>) => JSON.stringify({ formatVersion: 1, manifest: { formatVersion: 1, duration: 4, authoredFps: 24, ...manifest } });
  const rowFor = (clipExtra: Record<string, unknown>, manifest: Record<string, unknown>, library: LibraryEntry[] = []) => {
    const s = snap({ clips: [worldClip('c1', 'V1', 0, { objectId: 'W', revision: 'r1', body: body(manifest) }, clipExtra)] });
    return buildRows(s, library).timeline[0].name;
  };
  it('takes the clip label before the camera part, then a declared name, a library sibling, a filename, else Untitled', () => {
    expect(rowFor({ label: 'Harbour · Pier' }, { entry: 'a.html', name: 'Declared' })).toBe('Harbour');
    expect(rowFor({}, { entry: 'a.html', name: 'Declared' })).toBe('Declared');
    expect(rowFor({}, { entry: 'harbour-dusk.html' }, [{ ...entry('W', 'other', 'Sibling') }])).toBe('Sibling');
    expect(rowFor({}, { entry: 'scenes/harbour-dusk.html' })).toBe('Harbour dusk');
    expect(rowFor({}, { entry: 'index.html' })).toBe('Untitled world');
  });
  it('a saved real name wins, and a saved placeholder yields to a derived one', () => {
    expect(rowFor({ label: 'Label' }, {}, [entry('W', 'r1', 'Saved')])).toBe('Saved');
    expect(rowFor({ label: 'Label' }, {}, [entry('W', 'r1', 'Untitled world')])).toBe('Label');
  });
});

describe('world name spelling and collisions', () => {
  const body = (manifest: Record<string, unknown> = {}) => JSON.stringify({ formatVersion: 1, manifest: { formatVersion: 1, duration: 4, authoredFps: 24, ...manifest } });
  const rows = (clipExtra: Record<string, unknown>, manifest: Record<string, unknown>, library: LibraryEntry[], ids = { objectId: 'W', revision: 'r1' }) =>
    buildRows(snap({ clips: [worldClip('c1', 'V1', 0, { ...ids, body: body(manifest) }, clipExtra)] }), library);

  it('a name from a filename or label adopts the spelling of a case-insensitive library match', () => {
    const lib = [entry('L', 'r2', 'Lantern Valley')];
    expect(rows({}, { entry: 'lantern-valley.html' }, lib).timeline[0].name).toBe('Lantern Valley');
    expect(rows({ label: 'lantern valley · Dawn' }, {}, lib).timeline[0].name).toBe('Lantern Valley');
  });
  it('placeholder labels are never name hints', () => {
    for (const label of ['world-1', 'World 2', 'Untitled world · Valley flight', 'Untitled world 3', 'Scene 4']) {
      expect(rows({ label }, { entry: 'harbour-dusk.html' }, []).timeline[0].name).toBe('Harbour dusk');
    }
    expect(rows({ label: 'world-1' }, {}, []).timeline[0].name).toBe('Untitled world');
  });
  it('rows that still share a name carry a qualifier, others none', () => {
    const lib = [entry('L', 'r2', 'Lantern Valley'), entry('M', 'r3', 'Meadow')];
    const { timeline, library } = rows({}, { entry: 'lantern-valley.html' }, lib);
    expect(timeline[0].name).toBe('Lantern Valley');
    expect(timeline[0].qualifier).toBeUndefined();
    expect(library.find((r) => r.objectId === 'L')?.qualifier).toBe('library');
    expect(library.find((r) => r.objectId === 'M')?.qualifier).toBeUndefined();
  });
  const twoVersions = (library: LibraryEntry[], tracksB = 'V6') => buildRows(snap({
    tracks: [{ id: 'V1', kind: 'visual', label: 'V1', muted: false }],
    clips: [
      worldClip('a', 'V3', 0, { objectId: 'W', revision: 'r1', body: body({ entry: 'lantern-valley.html' }) }),
      worldClip('b', tracksB, 2, { objectId: 'W', revision: 'r2', body: body({ name: 'Lantern Valley' }) }),
    ],
  }), library);
  it('two versions both in the video share one spelling and are told apart by their tracks, never "in video"', () => {
    const { timeline } = twoVersions([]);
    expect(timeline.map((r) => r.name)).toEqual(['Lantern Valley', 'Lantern Valley']);
    expect(timeline.map((r) => r.qualifier)).toEqual(['on V3', 'on V6']);
    expect(JSON.stringify(timeline)).not.toContain('in video');
  });
  it('a declared name outranks a filename spelling, and a library spelling outranks both', () => {
    expect(twoVersions([]).timeline[0].name).toBe('Lantern Valley');
    expect(twoVersions([entry('Z', 'r9', 'LANTERN valley')]).timeline.map((r) => r.name)).toEqual(['LANTERN valley', 'LANTERN valley']);
  });
  it('versions on the same tracks fall back to a short revision', () => {
    const { timeline } = twoVersions([], 'V3');
    expect(timeline.map((r) => r.qualifier)).toEqual(['rev r1', 'rev r2']);
  });
  it('a timeline row beside a library copy keeps no qualifier; only the library row says "library"', () => {
    const { timeline, library } = twoVersions([entry('L', 'r5', 'Lantern Valley')]);
    expect(timeline.map((r) => r.qualifier)).toEqual(['on V3', 'on V6']);
    expect(library[0].qualifier).toBe('library');
  });
});
