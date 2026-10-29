// Low-poly mesh builders. Everything is flat-shaded: non-indexed triangles with
// face normals and one colour per face, so facets read cleanly at any size.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  IcosahedronGeometry,
  Matrix4,
  Shape,
  Vector3,
  BoxGeometry,
  Quaternion,
  Euler,
} from 'three';
import { fbm, mulberry32, smoothstep } from '../rng';
import {
  GROUND,
  HEART,
  STONES,
  WATER_Y,
  bridgeFrame,
  houses,
  skylineOpenness,
  stones,
  terrainHeight,
  waterDistance,
} from './layout';

const tmpColor = new Color();
export function srgb(hex: number): Color {
  return new Color().setHex(hex);
}

/** Make a geometry flat-shaded with per-face colours derived from a callback. */
export function faceted(geo: BufferGeometry, colorOf: (centre: Vector3, normal: Vector3, faceIndex: number) => Color): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const nor = g.getAttribute('normal');
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const centre = new Vector3();
  const normal = new Vector3();
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    centre.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    normal.fromBufferAttribute(nor, i);
    const col = colorOf(centre, normal, i / 3);
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = col.r;
      colors[(i + k) * 3 + 1] = col.g;
      colors[(i + k) * 3 + 2] = col.b;
    }
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

export function merge(geos: BufferGeometry[]): BufferGeometry {
  let total = 0;
  for (const g of geos) total += g.getAttribute('position').count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const c = g.getAttribute('color');
    pos.set(p.array as Float32Array, o * 3);
    nor.set(n.array as Float32Array, o * 3);
    col.set(c.array as Float32Array, o * 3);
    o += p.count;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('normal', new BufferAttribute(nor, 3));
  out.setAttribute('color', new BufferAttribute(col, 3));
  return out;
}

/** Split a flat-shaded geometry into square chunks so the camera can cull what it can't see. */
export function splitByGrid(geo: BufferGeometry, cell: number): BufferGeometry[] {
  const pos = geo.getAttribute('position').array as Float32Array;
  const nor = geo.getAttribute('normal').array as Float32Array;
  const col = geo.getAttribute('color').array as Float32Array;
  const buckets = new Map<string, number[]>();
  for (let t = 0; t < pos.length / 9; t++) {
    const cx = (pos[t * 9] + pos[t * 9 + 3] + pos[t * 9 + 6]) / 3;
    const cz = (pos[t * 9 + 2] + pos[t * 9 + 5] + pos[t * 9 + 8]) / 3;
    const key = `${Math.floor(cx / cell)},${Math.floor(cz / cell)}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(t);
  }
  const out: BufferGeometry[] = [];
  for (const key of [...buckets.keys()].sort()) {
    const tris = buckets.get(key)!;
    const p = new Float32Array(tris.length * 9);
    const n = new Float32Array(tris.length * 9);
    const c = new Float32Array(tris.length * 9);
    tris.forEach((t, i) => {
      p.set(pos.subarray(t * 9, t * 9 + 9), i * 9);
      n.set(nor.subarray(t * 9, t * 9 + 9), i * 9);
      c.set(col.subarray(t * 9, t * 9 + 9), i * 9);
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(p, 3));
    g.setAttribute('normal', new BufferAttribute(n, 3));
    g.setAttribute('color', new BufferAttribute(c, 3));
    g.computeBoundingSphere();
    out.push(g);
  }
  return out;
}

function solid(geo: BufferGeometry, hex: number): BufferGeometry {
  const c = srgb(hex);
  return faceted(geo, () => c);
}

function jitter(geo: BufferGeometry, amount: number, seed: number): BufferGeometry {
  // merge coincident vertices by position key so the jitter keeps faces closed
  const pos = geo.getAttribute('position');
  const rnd = mulberry32(seed);
  const moved = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = moved.get(key);
    if (!d) {
      d = [(rnd() - 0.5) * amount, (rnd() - 0.5) * amount, (rnd() - 0.5) * amount];
      moved.set(key, d);
    }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  return geo;
}

// ---------------------------------------------------------------------------

/** Grid lines: even through the heart of the valley, growing wider toward the walls. */
function gradedAxis(inner0: number, inner1: number, cells: number, outer0: number, outer1: number, growth: number): number[] {
  const step = (inner1 - inner0) / cells;
  const right: number[] = [];
  for (let i = 0; i <= cells; i++) right.push(inner0 + i * step);
  for (let c = step, x = inner1; x < outer1; ) {
    c *= growth;
    x = outer1 - (x + c) < c * 0.4 ? outer1 : x + c;
    right.push(x);
  }
  const left: number[] = [];
  for (let c = step, x = inner0; x > outer0; ) {
    c *= growth;
    x = x - c - outer0 < c * 0.4 ? outer0 : x - c;
    left.push(x);
  }
  return [...left.reverse(), ...right];
}

export function terrainGeometry(): BufferGeometry {
  const xs = gradedAxis(HEART.x0, HEART.x1, 176, GROUND.x0, GROUND.x1, 1.22);
  const zs = gradedAxis(HEART.z0, HEART.z1, 200, GROUND.z0, GROUND.z1, 1.22);
  const nx = xs.length;
  const nz = zs.length;
  const positions = new Float32Array(nx * nz * 3);
  const rnd = mulberry32(99);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let x = xs[i];
      let z = zs[j];
      // nudge interior vertices so the facets don't read as a grid
      if (i > 0 && i < nx - 1 && j > 0 && j < nz - 1) {
        x += (rnd() - 0.5) * 0.4 * (xs[i + 1] - xs[i - 1]) * 0.5;
        z += (rnd() - 0.5) * 0.4 * (zs[j + 1] - zs[j - 1]) * 0.5;
      }
      positions.set([x, terrainHeight(x, z), z], (j * nx + i) * 3);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const plane = new BufferGeometry();
  plane.setAttribute('position', new BufferAttribute(positions, 3));
  plane.setIndex(index);
  const lights = houses().map((h) => new Vector3(h.x, h.y, h.z));

  const meadow = srgb(0x2c4a35);
  const meadowLight = srgb(0x3b5e3f);
  const moss = srgb(0x22402f);
  const slope = srgb(0x39474d);
  const ridge = srgb(0x1f3434);
  const mud = srgb(0x2a2b23);
  const bed = srgb(0x1c2a2a);
  const plateau = srgb(0x45574a);
  const warm = srgb(0x6b5233);
  return faceted(plane, (c, n) => {
    const wd = waterDistance(c.x, c.z);
    const steep = 1 - n.y;
    const patch = fbm(c.x / 40, c.z / 40, 3, 404);
    const fine = fbm(c.x / 9, c.z / 9, 2, 405);
    tmpColor.copy(meadow).lerp(meadowLight, smoothstep(0.45, 0.75, patch));
    tmpColor.lerp(moss, smoothstep(0.55, 0.3, fine) * 0.6);
    tmpColor.lerp(ridge, smoothstep(25, 120, c.y));
    tmpColor.lerp(slope, smoothstep(0.18, 0.42, steep));

    const rs = Math.hypot(c.x - STONES.x, c.z - STONES.z);
    tmpColor.lerp(plateau, (1 - smoothstep(10, 26, rs)) * 0.6);
    // village ground worn to earth around the houses
    let nearHouse = 0;
    if (Math.abs(c.x) < 200) for (const l of lights) nearHouse = Math.max(nearHouse, 1 - smoothstep(4, 11, Math.hypot(c.x - l.x, c.z - l.z)));
    tmpColor.lerp(warm, nearHouse * 0.55);
    tmpColor.lerp(mud, 1 - smoothstep(0.5, 3.5, wd));
    if (c.y < WATER_Y + 0.05) tmpColor.copy(bed);
    // tiny per-face variation
    tmpColor.multiplyScalar(0.94 + 0.12 * fine);
    return tmpColor.clone();
  });
}

/** The water surface: flat cells only where there is river or lake beneath, in culling chunks. */
export function waterGeometries(): BufferGeometry[] {
  const cell = 16;
  const chunk = 128;
  const buckets = new Map<string, number[]>();
  for (let z = GROUND.z0; z < GROUND.z1; z += cell) {
    for (let x = -720; x < 720; x += cell) {
      if (waterDistance(x + cell / 2, z + cell / 2) > cell) continue;
      const key = `${Math.floor(x / chunk)},${Math.floor(z / chunk)}`;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      const x1 = x + cell;
      const z1 = z + cell;
      list.push(x, WATER_Y, z, x, WATER_Y, z1, x1, WATER_Y, z, x1, WATER_Y, z, x, WATER_Y, z1, x1, WATER_Y, z1);
    }
  }
  return [...buckets.keys()].sort().map((key) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(buckets.get(key)!), 3));
    g.computeBoundingSphere();
    return g;
  });
}

/** Two rings of far ranges beyond the valley walls, low in the north where the moon sits. */
export function mountainGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const rings = [
    { r: 2900, lo: 260, hi: 470, seed: 3, col: 0x1c2c38 },
    { r: 3500, lo: 340, hi: 640, seed: 4, col: 0x22344a },
  ];
  for (const ring of rings) {
    const n = 220;
    const pos: number[] = [];
    const cx = 0;
    const cz = -150;
    const peak = (i: number) => {
      const a = (i / n) * Math.PI * 2;
      // broad massifs plus sharp ridgelines, so the skyline never repeats
      const broad = fbm(Math.cos(a) * 4 + ring.seed, Math.sin(a) * 4, 3, ring.seed);
      const ridge = 1 - Math.abs(2 * fbm(Math.cos(a) * 11 + ring.seed, Math.sin(a) * 11, 3, ring.seed + 9) - 1);
      const h = ring.lo + (ring.hi - ring.lo) * (0.65 * broad + 0.35 * ridge * ridge);
      return { a, h: h * Math.max(skylineOpenness(a), 0.3) };
    };
    for (let i = 0; i < n; i++) {
      const p0 = peak(i);
      const p1 = peak(i + 1);
      const mid = { a: (p0.a + p1.a) / 2, h: (p0.h + p1.h) * 0.5 * (0.82 + 0.36 * fbm(i * 1.3, ring.seed, 2, 8)) };
      const pts = [p0, mid, p1];
      for (let k = 0; k < 2; k++) {
        const A = pts[k];
        const B = pts[k + 1];
        const ax = cx + Math.sin(A.a) * ring.r;
        const az = cz - Math.cos(A.a) * ring.r;
        const bx = cx + Math.sin(B.a) * ring.r;
        const bz = cz - Math.cos(B.a) * ring.r;
        const ar = ring.r * 1.12;
        const fx0 = cx + Math.sin(A.a) * ar;
        const fz0 = cz - Math.cos(A.a) * ar;
        const fx1 = cx + Math.sin(B.a) * ar;
        const fz1 = cz - Math.cos(B.a) * ar;
        const base = -60;
        // front faces, wound to face the valley centre
        pos.push(ax, base, az, bx, base, bz, bx, B.h, bz);
        pos.push(ax, base, az, bx, B.h, bz, ax, A.h, az);
        // back slope to give the silhouette some depth
        pos.push(ax, A.h, az, bx, B.h, bz, fx1, base, fz1);
        pos.push(ax, A.h, az, fx1, base, fz1, fx0, base, fz0);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    const col = srgb(ring.col);
    parts.push(faceted(g, () => col));
  }
  return merge(parts);
}

// ---------------------------------------------------------------------------
// Trees, rocks, stones.

export function coniferGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(0.09, 0.13, 0.25, 5);
  trunk.translate(0, 0.12, 0);
  parts.push(solid(trunk, 0x3b2e26));
  const tiers = [
    { r: 0.36, h: 0.48, y: 0.2 },
    { r: 0.28, h: 0.4, y: 0.45 },
    { r: 0.18, h: 0.32, y: 0.68 },
  ];
  tiers.forEach((t, i) => {
    const cone = new ConeGeometry(t.r, t.h, 6, 1);
    cone.translate(0, t.y + t.h / 2, 0);
    parts.push(solid(jitter(cone, 0.035, 20 + i), [0x1f3d33, 0x24463a, 0x2a4f40][i]));
  });
  return merge(parts);
}

export function roundTreeGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(0.05, 0.09, 0.5, 5);
  trunk.translate(0, 0.25, 0);
  parts.push(solid(trunk, 0x3b2e26));
  const crown = new IcosahedronGeometry(0.36, 1);
  crown.scale(1, 0.95, 1);
  crown.translate(0, 0.66, 0);
  parts.push(solid(jitter(crown, 0.07, 33), 0x2f4f36));
  const crown2 = new IcosahedronGeometry(0.24, 0);
  crown2.translate(0.2, 0.55, 0.12);
  parts.push(solid(jitter(crown2, 0.05, 34), 0x37593c));
  return merge(parts);
}

export function rockGeometry(): BufferGeometry {
  const g = new IcosahedronGeometry(1, 0);
  jitter(g, 0.45, 71);
  g.scale(1, 0.62, 0.9);
  return solid(g, 0x4a5458);
}

export function stoneCircleGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const list = stones();
  list.forEach((s, i) => {
    const box = new BoxGeometry(s.w, s.h, s.d, 1, 2, 1);
    jitter(box, 0.22, 500 + i);
    box.translate(0, s.h / 2, 0);
    // taper the top a little
    const p = box.getAttribute('position');
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k);
      const f = 1 - 0.22 * smoothstep(0, s.h, y);
      p.setX(k, p.getX(k) * f);
      p.setZ(k, p.getZ(k) * f);
    }
    const m = new Matrix4().compose(
      new Vector3(s.x, s.y, s.z),
      new Quaternion().setFromEuler(new Euler(s.tiltX, s.rot, s.tiltZ)),
      new Vector3(1, 1, 1),
    );
    box.applyMatrix4(m);
    parts.push(solid(box, i % 3 === 0 ? 0x6b7470 : 0x5d6766));
  });
  // a low flat altar stone at the centre
  const altar = new BoxGeometry(2.2, 0.6, 1.3);
  jitter(altar, 0.12, 590);
  altar.rotateY(0.4);
  altar.translate(STONES.x, terrainHeight(STONES.x, STONES.z) + 0.15, STONES.z);
  parts.push(solid(altar, 0x5b6462));
  return merge(parts);
}

// ---------------------------------------------------------------------------
// Houses: plaster walls, slate roofs, chimneys; windows are a separate mesh.

function prismRoof(w: number, d: number, h: number, overhang: number): BufferGeometry {
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  // ridge runs along x
  const v = [
    [-hw, 0, -hd], [hw, 0, -hd], [hw, h, 0], [-hw, h, 0], // back slope
    [-hw, 0, hd], [hw, 0, hd], [hw, h, 0], [-hw, h, 0], // front slope
  ];
  const tri = (a: number[], b: number[], c: number[]) => [...a, ...b, ...c];
  const pos = [
    ...tri(v[0], v[2], v[1]), ...tri(v[0], v[3], v[2]),
    ...tri(v[4], v[5], v[6]), ...tri(v[4], v[6], v[7]),
    // gable ends
    ...tri([-hw, 0, -hd], [-hw, 0, hd], [-hw, h, 0]),
    ...tri([hw, 0, hd], [hw, 0, -hd], [hw, h, 0]),
    // underside
    ...tri([-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd]), ...tri([-hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]),
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  return g;
}

export interface VillageMeshes {
  body: BufferGeometry;
  windows: BufferGeometry;
  windowLights: Vector3[];
  chimneys: Vector3[];
}

export function villageGeometry(): VillageMeshes {
  const body: BufferGeometry[] = [];
  const windows: BufferGeometry[] = [];
  const windowLights: Vector3[] = [];
  const chimneys: Vector3[] = [];
  for (const h of houses()) {
    const rnd = mulberry32(h.seed);
    const m = new Matrix4().compose(new Vector3(h.x, h.y, h.z), new Quaternion().setFromEuler(new Euler(0, h.rot, 0)), new Vector3(1, 1, 1));
    const wallH = h.h + 0.4;
    const walls = new BoxGeometry(h.w, wallH, h.d);
    walls.translate(0, wallH / 2, 0);
    body.push(solid(walls.applyMatrix4(m), rnd() < 0.5 ? 0xb8b0a0 : 0xa9a69a));
    // a stone footing so sloped ground never shows a gap
    const footing = new BoxGeometry(h.w + 0.3, 0.9, h.d + 0.3);
    footing.translate(0, 0.2, 0);
    body.push(solid(footing.applyMatrix4(m), 0x55585a));
    const roofH = 1.6 + rnd() * 0.6;
    const roof = prismRoof(h.w, h.d, roofH, 0.35);
    roof.translate(0, wallH, 0);
    body.push(solid(roof.applyMatrix4(m), rnd() < 0.6 ? 0x3c3f4c : 0x4e4136));
    const cx = (rnd() - 0.5) * h.w * 0.6;
    const chimney = new BoxGeometry(0.6, 1.6, 0.6);
    chimney.translate(cx, wallH + roofH * 0.55 + 0.4, -h.d * 0.18);
    body.push(solid(chimney.applyMatrix4(m), 0x6a625c));
    chimneys.push(new Vector3(cx, wallH + roofH * 0.55 + 1.3, -h.d * 0.18).applyMatrix4(m));
    // door on the front (+z local)
    const door = new BoxGeometry(0.9, 1.7, 0.12);
    const doorX = (rnd() - 0.5) * (h.w - 2.4);
    door.translate(doorX, 0.85 + 0.25, h.d / 2 + 0.04);
    body.push(solid(door.applyMatrix4(m), 0x3a2a20));
    // windows: front pair, one on a side
    const spots: [number, number, number, number][] = [];
    for (const wx of [-h.w * 0.3, h.w * 0.3]) {
      if (Math.abs(wx - doorX) > 1.2) spots.push([wx, 1.75, h.d / 2 + 0.05, 0]);
    }
    spots.push([h.w / 2 + 0.05, 1.75, (rnd() - 0.5) * h.d * 0.4, Math.PI / 2]);
    if (rnd() < 0.5) spots.push([-h.w / 2 - 0.05, 1.75, (rnd() - 0.5) * h.d * 0.4, -Math.PI / 2]);
    for (const [wx, wy, wz, ry] of spots) {
      const win = new BoxGeometry(0.85, 0.95, 0.14);
      win.rotateY(ry);
      win.translate(wx, wy + 0.25, wz);
      const warmth = 0.75 + rnd() * 0.5;
      const col = srgb(0xffb35c).multiplyScalar(warmth);
      windows.push(faceted(win.applyMatrix4(m), () => col));
      const out = new Vector3(Math.sin(ry), 0, Math.cos(ry)).multiplyScalar(0.6);
      windowLights.push(new Vector3(wx, wy + 0.25, wz).add(out).applyMatrix4(m));
    }
  }
  return { body: merge(body), windows: merge(windows), windowLights, chimneys };
}

// ---------------------------------------------------------------------------
// The old bridge: a stone arch built from its side profile, with parapets.

export function bridgeGeometry(): { geo: BufferGeometry; lantern: Vector3 } {
  const { center, across, along } = bridgeFrame();
  const span = 30;
  const half = span / 2;
  const width = 3.6;
  const archR = 6.6;
  const deck = (s: number) => 1.4 + 4.6 * Math.cos((s / half) * Math.PI * 0.5);
  // side profile in (s, y): outer edge with the arch cut from below
  const shape = new Shape();
  const steps = 24;
  shape.moveTo(-half, -3);
  for (let i = 0; i <= steps; i++) {
    const s = -half + (i / steps) * span;
    shape.lineTo(s, deck(s));
  }
  shape.lineTo(half, -3);
  shape.lineTo(archR, -3);
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI;
    shape.lineTo(Math.cos(a) * archR, -0.6 + Math.sin(a) * (archR * 0.62));
  }
  shape.lineTo(-archR, -3);
  shape.lineTo(-half, -3);
  const parts: BufferGeometry[] = [];
  const body = new ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
  body.translate(0, 0, -width / 2);
  const stone = srgb(0x4a4844);
  const stoneRnd = mulberry32(62);
  parts.push(faceted(jitter(body, 0.05, 61), () => stone.clone().multiplyScalar(0.82 + stoneRnd() * 0.3)));
  for (const side of [-1, 1]) {
    const p = new Shape();
    p.moveTo(-half + 1.5, deck(-half + 1.5) - 0.1);
    for (let i = 0; i <= steps; i++) {
      const s = -half + 1.5 + (i / steps) * (span - 3);
      p.lineTo(s, deck(s) + 0.85);
    }
    p.lineTo(half - 1.5, deck(half - 1.5) - 0.1);
    for (let i = steps; i >= 0; i--) {
      const s = -half + 1.5 + (i / steps) * (span - 3);
      p.lineTo(s, deck(s) - 0.1);
    }
    const wall = new ExtrudeGeometry(p, { depth: 0.42, bevelEnabled: false, curveSegments: 1 });
    wall.translate(0, 0, side > 0 ? width / 2 - 0.3 : -width / 2 - 0.12);
    parts.push(faceted(wall, () => srgb(0x56534e).multiplyScalar(0.85 + stoneRnd() * 0.25)));
  }
  // lantern post at the crown of the bridge
  const post = new BoxGeometry(0.22, 1.9, 0.22);
  post.translate(0, deck(0) + 0.95 + 0.5, width / 2 - 0.1);
  parts.push(solid(post, 0x2d2622));
  const arm = new BoxGeometry(0.7, 0.1, 0.1);
  arm.translate(0.3, deck(0) + 2.35, width / 2 - 0.1);
  parts.push(solid(arm, 0x2d2622));
  const geo = merge(parts);
  // stone darkens toward the water: a gentle wet-to-dry gradient up each face
  const gp = geo.getAttribute('position');
  const gc = geo.getAttribute('color');
  for (let i = 0; i < gp.count; i++) {
    const k = 0.55 + 0.45 * smoothstep(-0.5, 6.5, gp.getY(i));
    gc.setXYZ(i, gc.getX(i) * k, gc.getY(i) * k, gc.getZ(i) * k);
  }
  // local (s, y, w) -> world: s along `across`, w along `along`
  // right-handed frame (a mirrored one would flip every face's winding)
  const up = new Vector3(0, 1, 0);
  const forward = new Vector3().crossVectors(across, up);
  const basis = new Matrix4().makeBasis(across, up, forward);
  basis.setPosition(center.x, WATER_Y, center.z);
  geo.applyMatrix4(basis);
  const lantern = new Vector3(0.62, deck(0) + 2.0, width / 2 - 0.1).applyMatrix4(basis);
  return { geo, lantern };
}

export function lanternGeometry(): BufferGeometry {
  // a paper sky-lantern: a tapered four-sided shade
  const g = new CylinderGeometry(0.42, 0.3, 1, 4, 1, false);
  g.rotateY(Math.PI / 4);
  const col = new Color(1, 1, 1);
  return faceted(g, () => col);
}

/** A leaping fish, about 0.8 m: a faceted body, dark back, silver belly, and a tail. */
export function fishGeometry(): BufferGeometry {
  const body = new IcosahedronGeometry(0.5, 0);
  body.scale(0.2, 0.3, 0.75);
  const back = srgb(0x3e5866);
  const belly = srgb(0xc3d2dc);
  const tailShape = new Shape();
  tailShape.moveTo(0, 0);
  tailShape.lineTo(-0.2, 0.16);
  tailShape.lineTo(-0.16, 0);
  tailShape.lineTo(-0.2, -0.16);
  tailShape.lineTo(0, 0);
  const tail = new ExtrudeGeometry(tailShape, { depth: 0.03, bevelEnabled: false });
  tail.rotateY(Math.PI / 2).translate(-0.015, 0, -0.33);
  return merge([faceted(body, (_c, n) => (n.y > 0.1 ? back : belly)), faceted(tail, () => back)]);
}

export function hangingLanternGeometry(): BufferGeometry {
  const g = new BoxGeometry(0.34, 0.44, 0.34);
  const col = new Color(1, 1, 1);
  return faceted(g, () => col);
}

