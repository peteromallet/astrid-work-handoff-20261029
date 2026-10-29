// The land of Lantern Valley: river, lake, terrain height, and where things stand.
//
// Everything here is a pure function of fixed constants and seeds (no WebGL), so
// the same valley is built on every load, and node scripts can check it.
// Units are metres. +x is east, -z is north (toward the moon), +y is up.
import { CatmullRomCurve3, Vector3 } from 'three';
import { clamp, fbm, lerp, mulberry32, smoothstep } from '../rng';

export const WATER_Y = 0;
export const RIVER_HALF_WIDTH = 6;

/** The moon hangs low in the north, a touch west: radians east of north, and up. */
export const MOON_AZIMUTH = -0.14;
export const MOON_ELEVATION = 0.168;

/** Landmarks. */
export const LAKE = { x: 0, z: -75, rx: 52, rz: 42 };
export const VILLAGE = { x: 70, z: -82 };
export const STONES = { x: -34, z: -182, radius: 10 };
export const HAMLET = { x: -22, z: -468 };
export const BRIDGE_Z = 40;

/** The modelled ground: far enough out that fog has swallowed its edge long before. */
export const GROUND = { x0: -2500, x1: 2500, z0: -2700, z1: 2300 };
/** The finely modelled middle of the ground, where people travel. */
export const HEART = { x0: -560, x1: 560, z0: -760, z1: 500 };

// The river runs the length of the valley and on out of sight at both ends; to
// the north its valley is the low gap that leads the eye to the moon.
const RIVER_POINTS: [number, number][] = [
  [150, 2400], [110, 2200], [140, 2000], [120, 1800], [90, 1600], [120, 1450], [130, 1300], [100, 1100], [120, 920], [92, 780], [110, 640], [90, 520], [80, 420], [55, 330],
  [22, 262], [-14, 200], [-20, 140], [-2, 86], [12, 40], [6, -18], [0, -75], [16, -132],
  [40, -190], [44, -262], [12, -340], [-36, -430], [-62, -540], [-40, -660], [-6, -790],
  [10, -920], [40, -1060], [20, -1200], [-30, -1340], [-10, -1480], [20, -1620], [0, -1800],
  [-40, -2000], [-10, -2200], [30, -2400], [0, -2600], [-20, -2800],
];

export const riverCurve = new CatmullRomCurve3(
  RIVER_POINTS.map(([x, z]) => new Vector3(x, WATER_Y, z)),
  false,
  'centripetal',
);

const RIVER_SAMPLES = riverCurve.getSpacedPoints(2400).map((p) => [p.x, p.z] as [number, number]);

function segDist2(px: number, pz: number, i: number): number {
  const [ax, az] = RIVER_SAMPLES[i];
  const [bx, bz] = RIVER_SAMPLES[i + 1];
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const len2 = vx * vx + vz * vz;
  const t = len2 > 0 ? clamp((wx * vx + wz * vz) / len2, 0, 1) : 0;
  const dx = wx - vx * t;
  const dz = wz - vz * t;
  return dx * dx + dz * dz;
}

/** Horizontal distance from (x, z) to the river's centreline. */
export function riverDistance(x: number, z: number): number {
  const n = RIVER_SAMPLES.length;
  let best = Infinity;
  let bestI = 0;
  for (let i = 0; i < n; i += 8) {
    const [sx, sz] = RIVER_SAMPLES[i];
    const d = (sx - x) * (sx - x) + (sz - z) * (sz - z);
    if (d < best) {
      best = d;
      bestI = i;
    }
  }
  let min = Infinity;
  const lo = Math.max(0, bestI - 16);
  const hi = Math.min(n - 2, bestI + 16);
  for (let i = lo; i <= hi; i++) min = Math.min(min, segDist2(x, z, i));
  return Math.sqrt(min);
}

/** The river's centreline x where it crosses a given z (for cameras that follow the water). */
export function riverXAt(z: number): number {
  let best = RIVER_SAMPLES[0];
  for (const s of RIVER_SAMPLES) if (Math.abs(s[1] - z) < Math.abs(best[1] - z)) best = s;
  return best[0];
}

function lakeSdf(x: number, z: number): number {
  const kx = (x - LAKE.x) / LAKE.rx;
  const kz = (z - LAKE.z) / LAKE.rz;
  const wobble = (fbm(x / 22, z / 22, 2, 71) - 0.5) * 12;
  return (Math.sqrt(kx * kx + kz * kz) - 1) * Math.min(LAKE.rx, LAKE.rz) + wobble;
}

/** Signed horizontal distance to the shoreline: negative over water. */
export function waterDistance(x: number, z: number): number {
  const riverEdge = riverDistance(x, z) - RIVER_HALF_WIDTH - (fbm(x / 30, z / 30, 2, 5) - 0.5) * 3;
  return Math.min(riverEdge, lakeSdf(x, z));
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** How high the far skyline stands in a direction: low toward the moon, full elsewhere. */
export function skylineOpenness(azimuth: number): number {
  return 0.15 + 0.85 * smoothstep(0.18, 0.7, Math.abs(wrapAngle(azimuth - MOON_AZIMUTH)));
}

function landHeight(x: number, z: number, inland: number): number {
  let h = 0.5 + inland * 0.03 + 30 * smoothstep(12, 200, inland) + 110 * smoothstep(190, 460, inland);
  const n1 = fbm(x / 90, z / 90, 4, 11) - 0.5;
  const n2 = fbm(x / 28, z / 28, 3, 23) - 0.5;
  h += n1 * 34 * smoothstep(10, 80, inland) + n2 * 4.5 * smoothstep(4, 26, inland);
  h += 22 * (1 - smoothstep(8, 80, Math.hypot(x - STONES.x, z - STONES.z))); // the stone hill
  return Math.max(h, 0.45 + inland * 0.06);
}

let plateau = NaN;
let villageLevel = NaN;

/** Ground height in metres at (x, z). Below WATER_Y means under the river or lake. */
export function terrainHeight(x: number, z: number): number {
  const wd = waterDistance(x, z);
  const inland = Math.max(wd, 0);
  let h = landHeight(x, z, inland);

  if (Number.isNaN(plateau)) {
    plateau = landHeight(STONES.x, STONES.z, Math.max(waterDistance(STONES.x, STONES.z), 0));
    villageLevel = Math.max(2.2, landHeight(VILLAGE.x, VILLAGE.z, Math.max(waterDistance(VILLAGE.x, VILLAGE.z), 0)));
  }
  // level ground for the stone circle, the village and the hamlet
  h = lerp(plateau, h, smoothstep(13, 34, Math.hypot(x - STONES.x, z - STONES.z)));
  const rv = Math.hypot((x - VILLAGE.x) * 0.8, z - VILLAGE.z);
  h = lerp(villageLevel + (x - VILLAGE.x) * 0.05, h, smoothstep(22, 48, rv));
  h = lerp(Math.max(1.6, h * 0.5), h, smoothstep(14, 32, Math.hypot(x - HAMLET.x, z - HAMLET.z)));

  // banks slope down into the water
  return lerp(-2.6, h, smoothstep(-2.5, 6.5, wd));
}

export function plateauHeight(): number {
  terrainHeight(STONES.x, STONES.z);
  return plateau;
}

// ---------------------------------------------------------------------------
// Where things stand.

export interface House {
  x: number;
  z: number;
  y: number;
  rot: number;
  w: number;
  d: number;
  h: number;
  seed: number;
}

/** The village on the lake's east shore, and a hamlet far up the valley. */
export function houses(): House[] {
  const spots: [number, number, number, number, number][] = [
    [VILLAGE.x, VILLAGE.z, -14, -16, 0.15], [VILLAGE.x, VILLAGE.z, -6, 2, -0.1], [VILLAGE.x, VILLAGE.z, -15, 17, 0.35],
    [VILLAGE.x, VILLAGE.z, 4, -26, 0.05], [VILLAGE.x, VILLAGE.z, 10, 12, -0.25], [VILLAGE.x, VILLAGE.z, 14, -6, 0.2],
    [VILLAGE.x, VILLAGE.z, -2, 30, 0.45],
    [HAMLET.x, HAMLET.z, 0, 0, 0.2], [HAMLET.x, HAMLET.z, 9, -12, -0.15], [HAMLET.x, HAMLET.z, 6, 13, 0.4],
  ];
  const rnd = mulberry32(404);
  return spots.map(([cx0, cz0, dx, dz, rot], i) => {
    const x = cx0 + dx;
    const z = cz0 + dz;
    const w = 5.2 + rnd() * 2.2;
    const d = 4.2 + rnd() * 1.4;
    const h = 2.9 + rnd() * 0.9;
    // sit each house on its lowest corner so no corner floats
    let y = Infinity;
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
      y = Math.min(y, terrainHeight(x + (cx * w) / 2, z + (cz * d) / 2));
    }
    // fronts face the water to the west, with a little variety
    return { x, z, y: y - 0.25, rot: -Math.PI / 2 + rot, w, d, h, seed: 1000 + i };
  });
}

export interface Stone {
  x: number;
  z: number;
  y: number;
  rot: number;
  tiltX: number;
  tiltZ: number;
  w: number;
  h: number;
  d: number;
}

export function stones(): Stone[] {
  const rnd = mulberry32(77);
  const out: Stone[] = [];
  const count = 11;
  for (let i = 0; i < count; i++) {
    if (i === 7) continue; // one gap faces the valley
    const a = (i / count) * Math.PI * 2 + 0.2;
    const x = STONES.x + Math.cos(a) * STONES.radius;
    const z = STONES.z + Math.sin(a) * STONES.radius;
    out.push({
      x,
      z,
      y: terrainHeight(x, z) - 0.6,
      rot: -a + (rnd() - 0.5) * 0.3,
      tiltX: (rnd() - 0.5) * 0.12,
      tiltZ: (rnd() - 0.5) * 0.12,
      w: 1.3 + rnd() * 0.7,
      h: 4.2 + rnd() * 2.4,
      d: 0.7 + rnd() * 0.35,
    });
  }
  return out;
}

/** The bridge spans the river where it crosses BRIDGE_Z. */
export function bridgeFrame(): { center: Vector3; along: Vector3; across: Vector3 } {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i <= 4000; i++) {
    const p = riverCurve.getPointAt(i / 4000);
    const d = Math.abs(p.z - BRIDGE_Z);
    if (d < bestD) {
      bestD = d;
      best = i / 4000;
    }
  }
  const center = riverCurve.getPointAt(best);
  const along = riverCurve.getTangentAt(best).setY(0).normalize(); // downstream, toward the moon
  const across = new Vector3(-along.z, 0, along.x); // the bridge's long axis
  return { center, along, across };
}
