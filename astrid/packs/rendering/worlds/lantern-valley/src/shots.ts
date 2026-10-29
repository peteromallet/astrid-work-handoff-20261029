// Shots that live in the world: three named camera moves laid end to end on
// the SOURCE clock, plus the free-explore descriptor.
//
// Each move has a source span [start, end) and a worldStart: the world time at
// its first frame (worldTime = worldStart + sourceTime - start). Two moves can
// watch the same event from different places by giving them overlapping world
// times, as "Riverside walk" and "Moon overlook" both do for the lantern lift-off.
import { CatmullRomCurve3, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { WATER_Y, bridgeFrame, riverXAt, terrainHeight } from './world/layout';

interface Knot {
  /** x, height above the ground or water beneath, z */
  at: [number, number, number];
  /** what the camera looks at (absolute) */
  look: [number, number, number];
}

interface CameraMoveDef {
  name: string;
  start: number;
  end: number;
  worldStart: number;
  knots: Knot[];
  /** gentle bank into turns, radians at most */
  bank: number;
}

// A point on the river's line through the bridge arch, `offset` metres downstream.
const bridge = bridgeFrame();
const throughArch = (offset: number, y: number): [number, number, number] => {
  const p = bridge.center.clone().addScaledVector(bridge.along, offset);
  return [p.x, y, p.z];
};

const MOVES: CameraMoveDef[] = [
  {
    // High and sweeping, flying north as the moon climbs out of the far gap.
    name: 'Valley flight',
    start: 0,
    end: 25,
    worldStart: 0, // aligned: sees the moonrise and the shooting star as they happen
    bank: 0.07,
    knots: [
      { at: [118, 46, 300], look: [40, 45, 120] },
      { at: [72, 50, 222], look: [0, 42, 40] },
      { at: [22, 54, 150], look: [-20, 58, -60] },
      { at: [-22, 54, 76], look: [10, 30, -90] },
      { at: [-52, 46, 4], look: [40, 20, -86] },
      { at: [-64, 34, -40], look: [70, 22, -92] },
    ],
  },
  {
    // Low along the water: under the old bridge and out onto the lake as the
    // lanterns lift off, ending by the moored boat as a fish leaps.
    name: 'Riverside walk',
    start: 25,
    end: 50,
    worldStart: 20,
    bank: 0.03,
    knots: [
      { at: [riverXAt(104), 2.4, 104], look: [riverXAt(60), 3.2, 60] },
      { at: [riverXAt(82), 2.1, 82], look: throughArch(0, 3.0) },
      { at: throughArch(-16, 1.9), look: throughArch(30, 2.6) },
      { at: throughArch(0, 1.7), look: throughArch(46, 2.4) },
      { at: throughArch(18, 1.9), look: [34, 4, -60] },
      { at: [riverXAt(-14) + 4, 2.2, -14], look: [56, 6, -80] },
      { at: [17, 2.4, -40], look: [66, 6, -84] },
      { at: [22, 2.5, -48], look: [70, 6, -86] },
    ],
  },
  {
    // A slow rise from the north shore, past the standing stones against the
    // moon, to the vista up the valley; the same lift-off, seen from the hill.
    name: 'Moon overlook',
    start: 50,
    end: 75,
    worldStart: 22,
    bank: 0.04,
    knots: [
      { at: [30, 3, -100], look: [-22, 24, -190] },
      { at: [8, 7, -126], look: [-30, 27, -200] },
      { at: [-12, 10, -150], look: [-37, 29, -212] },
      { at: [-24, 13, -172], look: [-40, 30, -240] },
      { at: [-32, 24, -208], look: [-46, 48, -330] },
      { at: [-34, 40, -250], look: [-54, 74, -385] },
    ],
  },
];

/** Total source length: the package duration. */
export const DURATION = MOVES[MOVES.length - 1].end;
export const AUTHORED_FPS = 30;

export interface Pose {
  position: Vector3;
  quaternion: Quaternion;
  fov: number;
}

const BASE_FOV = 40;
const surface = (x: number, z: number) => Math.max(terrainHeight(x, z), WATER_Y);

export class CameraMove {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly worldStart: number;
  private readonly bank: number;
  private readonly path: CatmullRomCurve3;
  private readonly look: CatmullRomCurve3;
  private readonly timing = new Float64Array(2001); // curve parameter -> normalized nominal time
  private readonly easing = new Float64Array(3001); // normalized time -> eased progress

  constructor(def: CameraMoveDef) {
    this.name = def.name;
    this.start = def.start;
    this.end = def.end;
    this.worldStart = def.worldStart;
    this.bank = def.bank;
    this.path = new CatmullRomCurve3(
      def.knots.map((k) => new Vector3(k.at[0], surface(k.at[0], k.at[2]) + k.at[1], k.at[2])),
      false,
      'centripetal',
    );
    this.look = new CatmullRomCurve3(def.knots.map((k) => new Vector3(...k.look)), false, 'centripetal');

    // Low passes go slower than high ones, so the ground never rushes by.
    const a = this.path.getPoint(0);
    const b = new Vector3();
    for (let i = 1; i < this.timing.length; i++) {
      this.path.getPoint(i / (this.timing.length - 1), b);
      const above = (a.y + b.y) / 2 - surface((a.x + b.x) / 2, (a.z + b.z) / 2);
      const speed = MathUtils.lerp(1, 1.8, MathUtils.smoothstep(above, 4, 45));
      this.timing[i] = this.timing[i - 1] + a.distanceTo(b) / speed;
      a.copy(b);
    }
    normalize(this.timing);

    // Every move starts from rest and comes to rest, so it stands alone in a cut.
    const vel = (tau: number) =>
      Math.min(MathUtils.smootherstep(tau, 0, 0.18), 1 - MathUtils.smootherstep(tau, 0.8, 1));
    for (let i = 1; i < this.easing.length; i++) {
      const t0 = (i - 1) / (this.easing.length - 1);
      const t1 = i / (this.easing.length - 1);
      this.easing[i] = this.easing[i - 1] + ((vel(t0) + vel(t1)) / 2) * (t1 - t0);
    }
    normalize(this.easing);
  }

  worldTime(sourceTime: number): number {
    return this.worldStart + (sourceTime - this.start);
  }

  private param(sourceTime: number): number {
    const tau = MathUtils.clamp((sourceTime - this.start) / (this.end - this.start), 0, 1);
    return invert(this.timing, lookup(this.easing, tau));
  }

  position(sourceTime: number, out = new Vector3()): Vector3 {
    return this.path.getPoint(this.param(sourceTime), out);
  }

  pose(sourceTime: number, out: Pose): Pose {
    const u = this.param(sourceTime);
    this.path.getPoint(u, out.position);
    const target = this.look.getPoint(u);
    // bank a few degrees into turns, like a drone
    const yaw = (t: number) => {
      const v = this.param(t);
      const p = this.path.getPoint(v);
      const l = this.look.getPoint(v);
      return Math.atan2(l.x - p.x, -(l.z - p.z));
    };
    let turn = yaw(Math.min(sourceTime + 0.6, this.end)) - yaw(Math.max(sourceTime - 0.6, this.start));
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const roll = MathUtils.clamp(-turn * 0.22, -this.bank, this.bank);
    lookRotation(out.position, target, roll, out.quaternion);
    out.fov = BASE_FOV;
    return out;
  }
}

const cameraMoves = MOVES.map((def) => new CameraMove(def));

/** The move that owns a source time (spans are half-open; the last frame belongs to the last move). */
export function moveAt(sourceTime: number): CameraMove {
  return cameraMoves.find((m) => sourceTime < m.end) ?? cameraMoves[cameraMoves.length - 1];
}

/** What the host lists: names and spans. worldStart says which world moment each move watches. */
export const SHOTS = cameraMoves.map((m) => ({ name: m.name, start: m.start, end: m.end, worldStart: m.worldStart }));

/** Path samples for checks. */
export function moveSamples(): { name: string; t: number; worldTime: number; position: Vector3 }[] {
  const out: { name: string; t: number; worldTime: number; position: Vector3 }[] = [];
  for (const m of cameraMoves) {
    for (let t = m.start; t < m.end; t += 0.25) out.push({ name: m.name, t, worldTime: m.worldTime(t), position: m.position(t) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Free exploring: where a visitor starts, how fast they walk, how far they may go.

export const EXPLORE = {
  start: { position: [52, 26, 238] as [number, number, number], target: [4, 12, 118] as [number, number, number] },
  /** metres per second; the valley is about a kilometre long. The village is ~320 m from the start: ~5.5 s of W at 1x. */
  speed: 60,
  bounds: { min: [-360, 0, -660] as [number, number, number], max: [360, 180, 440] as [number, number, number] },
};

/** Keep a visitor's eye inside the bounds and a little above the ground or water. */
export function settleView(position: Vector3): Vector3 {
  const { min, max } = EXPLORE.bounds;
  position.x = MathUtils.clamp(position.x, min[0], max[0]);
  position.z = MathUtils.clamp(position.z, min[2], max[2]);
  position.y = MathUtils.clamp(position.y, Math.max(min[1], surface(position.x, position.z) + 1.6), max[1]);
  return position;
}

// ---------------------------------------------------------------------------

function normalize(table: Float64Array): void {
  const total = table[table.length - 1];
  for (let i = 0; i < table.length; i++) table[i] /= total;
}

function lookup(table: Float64Array, x: number): number {
  const n = table.length - 1;
  const f = MathUtils.clamp(x, 0, 1) * n;
  const i = Math.min(Math.floor(f), n - 1);
  return table[i] + (table[i + 1] - table[i]) * (f - i);
}

function invert(table: Float64Array, y: number): number {
  let lo = 0;
  let hi = table.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid] < y) lo = mid;
    else hi = mid;
  }
  const span = table[hi] - table[lo];
  return (lo + (span > 0 ? (y - table[lo]) / span : 0)) / (table.length - 1);
}

const _z = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const UP = new Vector3(0, 1, 0);
const _m = new Matrix4();
const _roll = new Quaternion();
const _forwardAxis = new Vector3(0, 0, 1);

/** A camera orientation looking from `eye` at `target`, rolled about the view axis. */
function lookRotation(eye: Vector3, target: Vector3, roll: number, out: Quaternion): Quaternion {
  _z.copy(eye).sub(target).normalize(); // cameras look down -z
  _x.crossVectors(UP, _z).normalize();
  _y.crossVectors(_z, _x);
  out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
  if (roll) out.multiply(_roll.setFromAxisAngle(_forwardAxis, roll));
  return out;
}
