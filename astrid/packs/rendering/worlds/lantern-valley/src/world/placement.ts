// Seeded scatter of the things that never move: trees and rocks.
import { fbm, mulberry32, smoothstep } from '../rng';
import { HAMLET, STONES, VILLAGE, bridgeFrame, terrainHeight, waterDistance } from './layout';

export interface Tree {
  x: number;
  y: number;
  z: number;
  h: number;
  rot: number;
  kind: 0 | 1; // 0 = conifer, 1 = round
  tone: number;
}

/** Woods gather in clumps up the valley sides; the meadows, shores and lanes stay open. */
export function placeTrees(): Tree[] {
  const rnd = mulberry32(2024);
  const bridge = bridgeFrame().center;
  const out: Tree[] = [];
  for (let i = 0; i < 30000 && out.length < 1300; i++) {
    const x = -640 + rnd() * 1280;
    const z = -920 + rnd() * 1560;
    const r1 = rnd();
    const r2 = rnd();
    const r3 = rnd();
    const r4 = rnd();
    const r5 = rnd();
    const wd = waterDistance(x, z);
    if (wd < 4.5) continue;
    const clump = fbm(x / 70, z / 70, 3, 909);
    const density = smoothstep(0.4, 0.6, clump) * (0.3 + 0.7 * smoothstep(6, 60, wd));
    if (r1 > density) continue;
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 34) continue;
    if (Math.hypot(x - HAMLET.x, z - HAMLET.z) < 24) continue;
    if (Math.hypot(x - STONES.x, z - STONES.z) < 62) continue; // the stone hill is open grass
    if (Math.hypot(x - bridge.x, z - bridge.z) < 22) continue;
    const y = terrainHeight(x, z);
    if (y > 240) continue; // bare crags up high
    const kind: 0 | 1 = r2 < 0.62 ? 0 : 1;
    const h = kind === 0 ? 7 + r3 * 8 : 5 + r3 * 4;
    out.push({ x, y: y - 0.3, z, h, rot: r4 * Math.PI * 2, kind, tone: r5 });
  }
  return out;
}

export interface Rock {
  x: number;
  y: number;
  z: number;
  s: number;
  rot: number;
}

/** Rocks gather along the water and on the stone hill. */
export function placeRocks(): Rock[] {
  const rnd = mulberry32(31337);
  const out: Rock[] = [];
  for (let i = 0; i < 6000 && out.length < 220; i++) {
    const x = -360 + rnd() * 720;
    const z = -620 + rnd() * 1060;
    const s = 0.5 + rnd() * rnd() * 2.6;
    const rot = rnd() * Math.PI * 2;
    const keep = rnd();
    const wd = waterDistance(x, z);
    const rs = Math.hypot(x - STONES.x, z - STONES.z);
    if (!(wd > 1 && wd < 14) && !(rs > 14 && rs < 48) && keep > 0.08) continue;
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 30) continue;
    out.push({ x, y: terrainHeight(x, z) - s * 0.35, z, s, rot });
  }
  return out;
}
