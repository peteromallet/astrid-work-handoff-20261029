// The world's living state: everything that moves or happens, as pure functions
// of WORLD time (seconds). Nothing here keeps state between frames, so any
// world time can be evaluated directly, forward or backward, and the world
// looks the same no matter which camera (or explorer) is watching.
import { MathUtils, Vector3 } from 'three';
import { mulberry32, smoothstep } from '../rng';
import {
  HAMLET,
  MOON_AZIMUTH,
  MOON_ELEVATION,
  STONES,
  VILLAGE,
  riverCurve,
  terrainHeight,
  waterDistance,
} from './layout';

// ---------------------------------------------------------------------------
// Events: the things that happen in the valley, in world time. Each one is
// driven by the functions below; this list is what the host shows.

export interface WorldEvent {
  name: string;
  start: number;
  end?: number;
}

export const MOONRISE = { start: 0, end: 18 };
export const SHOOTING_STAR = { start: 12.5, duration: 0.9 };
export const LIFT_OFF = { start: 24, end: 40 };
export const FISH_LEAP = { start: 43, duration: 1.05 };

export const EVENTS: WorldEvent[] = [
  { name: 'Moonrise', start: MOONRISE.start, end: MOONRISE.end },
  { name: 'Shooting star', start: SHOOTING_STAR.start },
  { name: 'Lanterns lift off', start: LIFT_OFF.start, end: LIFT_OFF.end },
  { name: 'Fish leap', start: FISH_LEAP.start },
];

/** The world runs from 0; earlier times show the valley as it was at 0. */
export function worldClock(t: number): number {
  return Math.max(0, t);
}

// ---------------------------------------------------------------------------
// Moonrise: the moon climbs out of the gap at the north end of the valley.

export interface MoonState {
  dir: Vector3;
  /** 0 below the horizon .. 1 fully up: scales the moonlight on the ground */
  light: number;
}

export function moonAt(t: number, out: MoonState = { dir: new Vector3(), light: 0 }): MoonState {
  const k = MathUtils.smootherstep(t, MOONRISE.start, MOONRISE.end);
  const elevation = MathUtils.lerp(-0.05, MOON_ELEVATION, k);
  const azimuth = MOON_AZIMUTH - 0.035 * (1 - k);
  out.dir.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
  out.light = smoothstep(-0.04, 0.14, elevation);
  return out;
}

/** Evening deepens as the moon climbs: 1 = last of the dusk, 0 = full night. */
export function duskAt(t: number): number {
  return 1 - 0.75 * smoothstep(0, 60, t);
}

/** How many stars are out (0.55 at dusk, 1 at full night). */
export function nightAt(t: number): number {
  return 0.55 + 0.45 * smoothstep(0, 50, t);
}

// ---------------------------------------------------------------------------
// Shooting star: one streak across the northern sky.

function skyDir(azimuth: number, elevation: number): Vector3 {
  return new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
}

const METEOR_FROM = skyDir(-0.42, 0.3);
const METEOR_TO = skyDir(-0.02, 0.19);

export interface MeteorState {
  glow: number;
  head: Vector3;
  tail: Vector3;
}

function slerpDir(a: Vector3, b: Vector3, u: number, out: Vector3): Vector3 {
  const angle = Math.acos(MathUtils.clamp(a.dot(b), -1, 1));
  const s = Math.sin(angle);
  return out
    .copy(a)
    .multiplyScalar(Math.sin((1 - u) * angle) / s)
    .addScaledVector(b, Math.sin(u * angle) / s);
}

export function meteorAt(t: number, out: MeteorState = { glow: 0, head: new Vector3(), tail: new Vector3() }): MeteorState {
  const u = (t - SHOOTING_STAR.start) / SHOOTING_STAR.duration;
  if (u <= 0 || u >= 1) {
    out.glow = 0;
    out.head.copy(METEOR_TO);
    out.tail.copy(METEOR_FROM);
    return out;
  }
  slerpDir(METEOR_FROM, METEOR_TO, u, out.head);
  slerpDir(METEOR_FROM, METEOR_TO, Math.max(0, u - 0.38), out.tail);
  out.glow = Math.pow(Math.sin(Math.PI * u), 0.6);
  return out;
}

// ---------------------------------------------------------------------------
// Sky lanterns. A few released long ago drift far up the valley; the rest lift
// off together during the LIFT_OFF event and rise toward the moon.

export interface LanternSeed {
  launch: number;
  x: number;
  z: number;
  y0: number;
  rise: number;
  windX: number;
  windZ: number;
  phase: number;
  scale: number;
  hue: number;
}

export interface LanternState {
  x: number;
  y: number;
  z: number;
  alpha: number;
  flicker: number;
  sway: number;
}

export const LANTERN_COUNT = 100;
const EARLY_LANTERNS = 12;
const LANTERN_LIFE = 170;

const SITES = [
  { x: VILLAGE.x - 4, z: VILLAGE.z, r: 26, weight: 0.5 },
  { x: -48, z: -52, r: 18, weight: 0.2 },
  { x: STONES.x - 14, z: STONES.z + 8, r: 9, weight: 0.15 }, // the west side of the circle
  { x: HAMLET.x, z: HAMLET.z, r: 24, weight: 0.15 },
];

export function lanternSeeds(): LanternSeed[] {
  const rnd = mulberry32(8080);
  const out: LanternSeed[] = [];
  for (let i = 0; i < LANTERN_COUNT; i++) {
    const early = i < EARLY_LANTERNS;
    const span = LIFT_OFF.end - LIFT_OFF.start;
    const launch = early
      ? -150 + (i / EARLY_LANTERNS) * 120
      : LIFT_OFF.start + ((i - EARLY_LANTERNS) / (LANTERN_COUNT - EARLY_LANTERNS)) * span + (rnd() - 0.5) * 0.6;
    let pick = rnd();
    let site = SITES[SITES.length - 1];
    if (!early) {
      for (const s of SITES) {
        if (pick < s.weight) {
          site = s;
          break;
        }
        pick -= s.weight;
      }
    }
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * site.r;
    const x = site.x + Math.cos(a) * r;
    const z = site.z + Math.sin(a) * r;
    // the breeze carries them up the valley toward the moon, each its own way
    const heading = -0.2 + (rnd() - 0.5) * 1.1;
    const speed = 0.6 + rnd() * 0.9;
    out.push({
      launch,
      x,
      z,
      y0: Math.max(terrainHeight(x, z), 0) + 1.5 + rnd() * 1.5,
      rise: 1.0 + rnd() * 0.8,
      windX: Math.sin(heading) * speed,
      windZ: -Math.cos(heading) * speed,
      phase: rnd() * 100,
      scale: 0.85 + rnd() * 0.35,
      hue: rnd(),
    });
  }
  return out;
}

export function lanternAt(s: LanternSeed, t: number, out: LanternState): LanternState {
  const age = t - s.launch;
  if (age <= 0 || age >= LANTERN_LIFE) {
    out.alpha = 0;
    out.x = s.x;
    out.y = s.y0;
    out.z = s.z;
    out.flicker = 0;
    out.sway = 0;
    return out;
  }
  // a gentle lift-off: speed builds over the first seconds
  const lift = age < 6 ? (age * age) / 12 : age - 3;
  const along = Math.max(0, lift - 2);
  out.x = s.x + s.windX * along + Math.sin(age * 0.37 + s.phase) * 1.2 + Math.sin(age * 0.11 + s.phase * 2) * 2.5;
  out.z = s.z + s.windZ * along + Math.cos(age * 0.29 + s.phase) * 1.0;
  out.y = s.y0 + lift * s.rise;
  // lit before it leaves the hands that hold it, gone before it reaches the clouds
  out.alpha = smoothstep(0, 2.5, age) * (1 - smoothstep(LANTERN_LIFE - 25, LANTERN_LIFE, age));
  out.flicker = 0.88 + 0.08 * Math.sin(age * 7.3 + s.phase) + 0.04 * Math.sin(age * 13.1 + s.phase * 3);
  out.sway = Math.sin(age * 0.8 + s.phase) * 0.12;
  return out;
}

// ---------------------------------------------------------------------------
// Fireflies along the river banks, around the stones and the village.

export interface FireflySeed {
  x: number;
  y: number;
  z: number;
  f1: number;
  f2: number;
  p1: number;
  p2: number;
  blinkF: number;
  blinkP: number;
}

export function fireflySeeds(): FireflySeed[] {
  const rnd = mulberry32(555);
  const out: FireflySeed[] = [];
  for (let i = 0; i < 8000 && out.length < 240; i++) {
    let x: number;
    let z: number;
    const pick = rnd();
    if (pick < 0.55) {
      // the river banks through the heart of the valley
      const p = riverCurve.getPointAt(0.26 + rnd() * 0.16);
      const a = rnd() * Math.PI * 2;
      const r = 8 + rnd() * 26;
      x = p.x + Math.cos(a) * r;
      z = p.z + Math.sin(a) * r;
    } else if (pick < 0.8) {
      const a = rnd() * Math.PI * 2;
      const r = 6 + rnd() * 30;
      x = STONES.x + Math.cos(a) * r;
      z = STONES.z + Math.sin(a) * r;
    } else {
      const a = rnd() * Math.PI * 2;
      const r = 10 + rnd() * 40;
      x = VILLAGE.x - 10 + Math.cos(a) * r;
      z = VILLAGE.z + Math.sin(a) * r;
    }
    if (waterDistance(x, z) < -3) continue;
    out.push({
      x,
      z,
      y: Math.max(terrainHeight(x, z), 0) + 0.6 + rnd() * 2.2,
      f1: 0.15 + rnd() * 0.3,
      f2: 0.3 + rnd() * 0.5,
      p1: rnd() * 10,
      p2: rnd() * 10,
      blinkF: 0.6 + rnd() * 1.1,
      blinkP: rnd() * 10,
    });
  }
  return out;
}

/** Position at time t; returns brightness 0..1 (fireflies blink). */
export function fireflyAt(s: FireflySeed, t: number, out: Vector3): number {
  out.set(
    s.x + Math.sin(t * s.f1 + s.p1) * 1.6 + Math.sin(t * s.f2 * 1.7 + s.p2) * 0.5,
    s.y + Math.sin(t * s.f2 + s.p2) * 0.45,
    s.z + Math.cos(t * s.f1 * 0.9 + s.p2) * 1.6 + Math.cos(t * s.f2 * 1.3 + s.p1) * 0.5,
  );
  return smoothstep(0.35, 0.95, Math.sin(t * s.blinkF + s.blinkP) * 0.5 + 0.5);
}

// ---------------------------------------------------------------------------
// Fish leap: a fish arcs out of the lake by the moored boat, with rings
// spreading where it leaves the water and where it falls back in.

const FISH = { x: 31, z: -55, heading: 1.25, travel: 1.9, height: 1.2 };

export interface FishState {
  visible: boolean;
  position: Vector3;
  yaw: number;
  pitch: number;
}

export function fishAt(t: number, out: FishState = { visible: false, position: new Vector3(), yaw: 0, pitch: 0 }): FishState {
  const u = (t - FISH_LEAP.start) / FISH_LEAP.duration;
  out.visible = u > 0 && u < 1;
  const dx = Math.sin(FISH.heading);
  const dz = -Math.cos(FISH.heading);
  const k = MathUtils.clamp(u, 0, 1);
  out.position.set(FISH.x + dx * FISH.travel * k, 4 * FISH.height * k * (1 - k) - 0.25, FISH.z + dz * FISH.travel * k);
  out.yaw = FISH.heading;
  out.pitch = Math.atan2(4 * FISH.height * (1 - 2 * k), FISH.travel);
  return out;
}

/** The two splashes as (x, z, start time, strength), for the water's rings. */
export function fishSplashes(): [number, number, number, number][] {
  const dx = Math.sin(FISH.heading);
  const dz = -Math.cos(FISH.heading);
  return [
    [FISH.x, FISH.z, FISH_LEAP.start, 0.8],
    [FISH.x + dx * FISH.travel, FISH.z + dz * FISH.travel, FISH_LEAP.start + FISH_LEAP.duration, 1.0],
  ];
}

// ---------------------------------------------------------------------------
// Small steady motions.

export const BOAT_HOME = new Vector3(36, 0, -64);

export function boatAt(t: number): { bob: number; roll: number; pitch: number; yaw: number } {
  return {
    bob: Math.sin(t * 0.9) * 0.06 + Math.sin(t * 0.37 + 1) * 0.04 - 0.12,
    pitch: Math.sin(t * 0.7) * 0.025,
    yaw: 0.9 + Math.sin(t * 0.13) * 0.04,
    roll: Math.sin(t * 0.9 + 0.5) * 0.035,
  };
}

/** Lamp flames breathe a little. */
export function flameAt(t: number, seed = 0): number {
  return 0.92 + 0.05 * Math.sin(t * 5.1 + seed) + 0.03 * Math.sin(t * 11.7 + 2 + seed * 1.7);
}
