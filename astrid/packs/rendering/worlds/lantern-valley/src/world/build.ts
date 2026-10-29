// The world constructor: builds Lantern Valley once, and returns the scene plus
// setTime(worldTime), which poses everything that lives in it. The world knows
// nothing about cameras; any camera (or an explorer) can look at it.
import {
  AddEquation,
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  DoubleSide,
  Euler,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { mulberry32 } from '../rng';
import {
  bridgeGeometry,
  fishGeometry,
  coniferGeometry,
  faceted,
  hangingLanternGeometry,
  lanternGeometry,
  merge,
  mountainGeometry,
  rockGeometry,
  roundTreeGeometry,
  splitByGrid,
  srgb,
  stoneCircleGeometry,
  terrainGeometry,
  villageGeometry,
  waterGeometries,
} from './geometry';
import {
  BOAT_HOME,
  LANTERN_COUNT,
  boatAt,
  duskAt,
  fireflyAt,
  fireflySeeds,
  fishAt,
  fishSplashes,
  flameAt,
  lanternAt,
  lanternSeeds,
  meteorAt,
  moonAt,
  nightAt,
  worldClock,
  type LanternState,
} from './living';
import { placeRocks, placeTrees, type Tree } from './placement';
import {
  COMMON,
  EMISSIVE_FRAG,
  EMISSIVE_VERT,
  FRAG_COMMON,
  GLOW_FRAG,
  GLOW_VERT,
  LIGHT_COUNT,
  SKY_FRAG,
  SKY_VERT,
  STAR_FRAG,
  STAR_VERT,
  WATER_FRAG,
  WATER_VERT,
  WORLD_FRAG,
  WORLD_VERT,
} from './shaders';

type Uniforms = Record<string, { value: unknown }>;

export interface World {
  readonly scene: Scene;
  /** Pose everything alive (moon, lanterns, water, fireflies, events) at a world time. */
  setTime(worldTime: number): void;
  /** Resolution-dependent sizes: pixel stars, the moon's edge, the smallest glow. */
  setViewport(width: number, height: number, verticalFovDegrees: number): void;
  dispose(): void;
}

export function buildWorld(): World {
  const scene = new Scene();
  const disposables: { dispose(): void }[] = [];
  const c = (hex: number) => srgb(hex);

  // -- shared atmosphere: every material reads these, so they agree on light --
  const lightPos: Vector3[] = [];
  const lightCol: Vector3[] = [];
  for (let i = 0; i < LIGHT_COUNT; i++) {
    lightPos.push(new Vector3(0, -1000, 0));
    lightCol.push(new Vector3());
  }
  const shared: Uniforms = {
    uTime: { value: 0 },
    uMoonDir: { value: new Vector3(0, 0.17, -1).normalize() },
    uMoonColor: { value: c(0xdfe6f2) },
    uZenith: { value: c(0x040a1a) },
    uHorizon: { value: c(0x284560) },
    uHalo: { value: c(0x6f8db5) },
    uDuskColor: { value: c(0x5e4c5c) },
    uDuskDir: { value: new Vector3(-1, 0, 0.25) },
    uDusk: { value: 1 },
    uFogDensity: { value: 0.0009 },
    uFogBoost: { value: 0.0045 },
    uFogFalloff: { value: 9 },
    uFarFog: { value: 1 },
    uExposure: { value: 1.45 },
    uResolution: { value: new Vector2(1920, 1080) },
    uLightPos: { value: lightPos },
    uLightCol: { value: lightCol },
  };

  const material = (vertex: string, fragment: string, extra: Uniforms = {}, opts: Partial<ShaderMaterial> = {}) => {
    const m = new ShaderMaterial({
      uniforms: { ...shared, ...extra },
      vertexShader: COMMON + vertex,
      fragmentShader: COMMON + FRAG_COMMON + fragment,
      ...opts,
    });
    disposables.push(m);
    return m;
  };
  const moonLight = { value: 0.62 };
  const worldMaterial = (opts: Partial<ShaderMaterial> = {}) =>
    material(
      WORLD_VERT,
      WORLD_FRAG,
      {
        uMoonLight: moonLight,
        uHemiSky: { value: c(0x41618a).multiplyScalar(0.48) },
        uHemiGround: { value: c(0x1a221e).multiplyScalar(0.6) },
        uRim: { value: 0.18 },
      },
      { vertexColors: true, ...opts },
    );
  const add = <T extends Object3D>(obj: T, name: string, renderOrder = 0): T => {
    obj.name = name;
    obj.renderOrder = renderOrder;
    scene.add(obj);
    const geo = (obj as unknown as { geometry?: BufferGeometry }).geometry;
    if (geo) disposables.push(geo);
    return obj;
  };

  const solid = worldMaterial(); // closed meshes with true winding
  const twoSided = worldMaterial({ side: DoubleSide }); // hand-built meshes

  // -- the land: ground, water, far ranges (chunked so the camera culls them) --
  for (const chunk of splitByGrid(terrainGeometry(), 110)) add(new Mesh(chunk, solid), 'terrain', 1);
  const waterMat = material(WATER_VERT, WATER_FRAG, {
    uDeep: { value: c(0x0a1622) },
    uSplash: { value: [new Vector4(0, 0, -100, 0), new Vector4(0, 0, -100, 0)] },
  });
  for (const chunk of waterGeometries()) add(new Mesh(chunk, waterMat), 'water', 2);
  // the far ranges stand beyond the thick far air, so only plain distance fog veils them
  const ranges = material(WORLD_VERT, WORLD_FRAG, { ...(twoSided.uniforms as Uniforms), uFarFog: { value: 0 } }, { vertexColors: true, side: DoubleSide });
  for (const chunk of splitByGrid(mountainGeometry(), 900)) add(new Mesh(chunk, ranges), 'mountains', 3);

  // -- trees and rocks: instanced, batched per 120 m cell for culling --
  const m4 = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const tint = new Color();
  const plant = (geo: BufferGeometry, trees: Tree[], widthScale: number) => {
    disposables.push(geo);
    const cells = new Map<string, Tree[]>();
    for (const t of trees) {
      const key = `${Math.floor(t.x / 120)},${Math.floor(t.z / 120)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key)!.push(t);
    }
    for (const key of [...cells.keys()].sort()) {
      const list = cells.get(key)!;
      const mesh = new InstancedMesh(geo, solid, list.length);
      list.forEach((t, i) => {
        q.setFromEuler(e.set(0, t.rot, 0));
        m4.compose(new Vector3(t.x, t.y, t.z), q, new Vector3(t.h * widthScale, t.h, t.h * widthScale));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, tint.setRGB(0.85 + t.tone * 0.3, 0.88 + t.tone * 0.24, 0.9 + (1 - t.tone) * 0.2));
      });
      mesh.computeBoundingSphere();
      mesh.name = 'trees';
      scene.add(mesh);
    }
  };
  const trees = placeTrees();
  plant(coniferGeometry(), trees.filter((t) => t.kind === 0), 0.85);
  plant(roundTreeGeometry(), trees.filter((t) => t.kind === 1), 1.05);
  const rocks = placeRocks();
  const rockMesh = new InstancedMesh(rockGeometry(), solid, rocks.length);
  rocks.forEach((r, i) => {
    q.setFromEuler(e.set(0, r.rot, 0));
    rockMesh.setMatrixAt(i, m4.compose(new Vector3(r.x, r.y, r.z), q, new Vector3(r.s, r.s, r.s)));
  });
  rockMesh.computeBoundingSphere();
  add(rockMesh, 'rocks');

  // -- landmarks: the stone circle, the village and hamlet, the old bridge --
  add(new Mesh(stoneCircleGeometry(), solid), 'stones');
  const village = villageGeometry();
  add(new Mesh(village.body, twoSided), 'village');
  const windowMat = material(EMISSIVE_VERT, EMISSIVE_FRAG, { uGlow: { value: new Color(2.4, 2.4, 2.4) }, uGradient: { value: 0 } }, { vertexColors: true });
  add(new Mesh(village.windows, windowMat), 'windows');
  const bridge = bridgeGeometry();
  add(new Mesh(bridge.geo, twoSided), 'bridge');
  const lampMat = material(EMISSIVE_VERT, EMISSIVE_FRAG, { uGlow: { value: c(0xffb35c).multiplyScalar(2.6) }, uGradient: { value: 0 } }, { vertexColors: true });
  add(new Mesh(hangingLanternGeometry(), lampMat), 'bridge lamp').position.copy(bridge.lantern);

  // -- a rowboat with a lamp, moored off the village --
  const hull = new BoxGeometry(1.5, 0.5, 3.8, 1, 1, 2).toNonIndexed();
  const hp = hull.getAttribute('position');
  for (let i = 0; i < hp.count; i++) {
    const z = hp.getZ(i);
    const y = hp.getY(i);
    const taper = Math.abs(z) > 1.5 ? 0.25 : 1;
    hp.setX(i, hp.getX(i) * (y < 0 ? taper * 0.7 : taper));
    if (y > 0 && Math.abs(z) > 1.5) hp.setY(i, y + 0.12);
  }
  const mast = new BoxGeometry(0.07, 1.3, 0.07).translate(0, 0.85, -1.2);
  const boat = add(new Mesh(merge([faceted(hull, () => c(0x4a3527)), faceted(mast, () => c(0x2d2622))]), twoSided), 'boat');
  const boatLamp = add(new Mesh(hangingLanternGeometry(), lampMat), 'boat lamp');

  // -- the leaping fish (hidden until its event) --
  const fish = add(new Mesh(fishGeometry(), twoSided), 'fish');

  // -- sky lanterns: paper bodies (instanced) plus glows below --
  const seeds = lanternSeeds();
  const lanternMat = material(EMISSIVE_VERT, EMISSIVE_FRAG, { uGlow: { value: c(0xff9a48).multiplyScalar(2.8) }, uGradient: { value: 1 } }, { side: DoubleSide });
  const lanternBodies = add(new InstancedMesh(lanternGeometry(), lanternMat, LANTERN_COUNT), 'lanterns');
  lanternBodies.frustumCulled = false;
  lanternBodies.setColorAt(0, new Color(1, 1, 1));

  // -- warm lights that touch the ground (village windows, bridge lamp, boat lamp) --
  const lightBase: { pos: Vector3; col: Vector3 }[] = [];
  const groups = new Map<number, Vector3[]>();
  for (const p of village.windowLights) {
    const key = Math.round(p.x / 12) * 1000 + Math.round(p.z / 12);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  for (const g of [...groups.values()].sort((a, b) => b.length - a.length).slice(0, 4)) {
    const centre = g.reduce((acc, p) => acc.add(p), new Vector3()).multiplyScalar(1 / g.length);
    centre.y += 0.6;
    lightBase.push({ pos: centre, col: new Vector3(1.0, 0.55, 0.22).multiplyScalar(1.6 + g.length * 0.25) });
  }
  while (lightBase.length < 4) lightBase.push({ pos: new Vector3(0, -1000, 0), col: new Vector3() });
  lightBase.push({ pos: bridge.lantern.clone(), col: new Vector3(1.0, 0.6, 0.25).multiplyScalar(2.2) });
  lightBase.push({ pos: BOAT_HOME.clone(), col: new Vector3(1.0, 0.58, 0.24).multiplyScalar(1.8) });

  // -- sky: gradient, moon, clouds, a shooting star; then pixel stars --
  const skyMat = material(
    SKY_VERT,
    SKY_FRAG,
    {
      uMoonRadius: { value: 0.057 },
      uPixelAngle: { value: 0.0006 },
      uMoonDisc: { value: c(0xf6efdc).multiplyScalar(2.3) },
      uCloudDark: { value: c(0x0d1624) },
      uCloudLit: { value: c(0x223047) },
      uMeteorHead: { value: new Vector3(0, 1, 0) },
      uMeteorTail: { value: new Vector3(0, 1, 0) },
      uMeteorGlow: { value: 0 },
    },
    { side: BackSide, depthWrite: false },
  );
  // upper dome only: below the horizon the ground and the far ranges cover it
  const sky = add(new Mesh(new SphereGeometry(2800, 48, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), skyMat), 'sky', 10);
  sky.frustumCulled = false;
  const starMat = material(STAR_VERT, STAR_FRAG, { uPixelScale: { value: 1 }, uNight: { value: 0.55 } }, { transparent: true, depthWrite: false, blending: AdditiveBlending });
  add(new Points(starGeometry(), starMat), 'stars', 20).frustumCulled = false;

  // -- glows: lamps and lanterns (with reflections on the water), fireflies --
  const lights = new GlowSet(village.windowLights.length + 2 + LANTERN_COUNT);
  const rnd = mulberry32(42);
  let n = 0;
  for (const p of village.windowLights) {
    const k = 0.9 + rnd() * 0.4;
    lights.set(n++, p, 1.3, 1.0 * k, 0.5 * k, 0.17 * k);
  }
  const bridgeGlow = n;
  lights.set(n++, bridge.lantern, 1.7, 1.25, 0.62, 0.2);
  const boatGlow = n;
  lights.set(n++, BOAT_HOME, 1.6, 1.2, 0.6, 0.2);
  const lanternGlow = n;
  for (const s of seeds) {
    const warm = 0.9 + s.hue * 0.25;
    lights.set(n++, BOAT_HOME, 1.55 * s.scale, 1.15 * warm, (0.46 + s.hue * 0.12) * warm, 0.11 * warm);
  }
  // premultiplied: a lantern's core covers the sky behind it, so it stays warm
  const cover = { transparent: true, depthWrite: false, blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendEquation: AddEquation };
  add(lights.mesh(material(GLOW_VERT, GLOW_FRAG, glowUniforms({ uMinPx: 1.0, uMirror: 1, uCore: 9, uGlowHalo: 0.3, uCover: 0.4 }), cover)), 'reflections', 21);
  add(lights.mesh(material(GLOW_VERT, GLOW_FRAG, glowUniforms({ uMinPx: 1.5, uLift: 0.5, uCore: 30, uGlowHalo: 0.22, uCover: 0.85 }), cover)), 'glows', 22);
  const fireflies = fireflySeeds();
  const flies = new GlowSet(fireflies.length);
  fireflies.forEach((_, k) => flies.set(k, BOAT_HOME, 0.22, 0.55, 0.85, 0.24));
  const additive = { transparent: true, depthWrite: false, blending: AdditiveBlending };
  add(flies.mesh(material(GLOW_VERT, GLOW_FRAG, glowUniforms({ uMinPx: 0.9, uLift: 0.1, uCore: 12, uGlowHalo: 0.35, uFadeDist: 110 }), additive)), 'fireflies', 23);

  // ---------------------------------------------------------------------------
  // setTime: the world's living state at a world time.
  const moon = moonAt(0);
  const meteor = meteorAt(-1);
  const fishState = fishAt(-1);
  const splashes = fishSplashes();
  const lantern: LanternState = { x: 0, y: 0, z: 0, alpha: 0, flicker: 0, sway: 0 };
  const p = new Vector3();
  const lampAt = new Vector3();

  function setTime(worldTime: number): void {
    const t = worldClock(worldTime);
    shared.uTime.value = t;

    // the sky: moonrise, deepening night, the shooting star
    moonAt(t, moon);
    (shared.uMoonDir.value as Vector3).copy(moon.dir);
    moonLight.value = 0.62 * moon.light;
    shared.uDusk.value = duskAt(t);
    starMat.uniforms.uNight.value = nightAt(t);
    meteorAt(t, meteor);
    skyMat.uniforms.uMeteorGlow.value = meteor.glow;
    (skyMat.uniforms.uMeteorHead.value as Vector3).copy(meteor.head);
    (skyMat.uniforms.uMeteorTail.value as Vector3).copy(meteor.tail);

    // the boat rocks; its lamp goes with it
    const b = boatAt(t);
    boat.position.set(BOAT_HOME.x, b.bob, BOAT_HOME.z);
    boat.rotation.set(b.pitch, b.yaw, b.roll);
    boat.updateMatrixWorld();
    lampAt.set(0, 1.25, -1.2).applyMatrix4(boat.matrixWorld);
    boatLamp.position.copy(lampAt);

    // the fish and its rings
    fishAt(t, fishState);
    fish.visible = fishState.visible;
    fish.position.copy(fishState.position);
    // head along the leap (+z is the head), nose up on the way out, down on the way in
    fish.rotation.set(0, 0, 0);
    fish.rotateY(Math.PI - fishState.yaw);
    fish.rotateX(-fishState.pitch);
    const splash = waterMat.uniforms.uSplash.value as Vector4[];
    splashes.forEach((s, i) => splash[i].set(s[0], s[1], s[2], s[3]));

    // warm lights on the ground and water
    const flame = flameAt(t);
    for (let i = 0; i < LIGHT_COUNT; i++) {
      lightPos[i].copy(lightBase[i].pos);
      lightCol[i].copy(lightBase[i].col);
    }
    lightCol[4].multiplyScalar(flame);
    lightPos[5].copy(lampAt);

    // glows: windows breathe, lamps flicker, lanterns fly
    for (let k = 0; k < bridgeGlow; k++) lights.scale(k, 0.95 + 0.05 * Math.sin(t * 1.3 + k * 2.1));
    lights.scale(bridgeGlow, flame);
    lights.move(boatGlow, lampAt);
    lights.scale(boatGlow, flameAt(t, 1));
    seeds.forEach((s, k) => {
      lanternAt(s, t, lantern);
      const a = lantern.alpha * lantern.flicker;
      lights.move(lanternGlow + k, p.set(lantern.x, lantern.y + 0.05, lantern.z));
      lights.scale(lanternGlow + k, a);
      const size = lantern.alpha > 0 ? s.scale : 0;
      q.setFromEuler(e.set(lantern.sway, s.phase, lantern.sway * 0.6));
      lanternBodies.setMatrixAt(k, m4.compose(p.set(lantern.x, lantern.y + 0.45, lantern.z), q, new Vector3(size, size * 1.3, size)));
      lanternBodies.setColorAt(k, tint.setRGB(a, a, a));
    });
    lanternBodies.instanceMatrix.needsUpdate = true;
    if (lanternBodies.instanceColor) lanternBodies.instanceColor.needsUpdate = true;
    fireflies.forEach((s, k) => {
      const glow = fireflyAt(s, t, p);
      flies.move(k, p);
      flies.scale(k, glow);
    });
    lights.commit();
    flies.commit();
    scene.updateMatrixWorld();
  }

  function setViewport(width: number, height: number, vfov: number): void {
    (shared.uResolution.value as Vector2).set(width, height);
    const pxScale = 0.55 + (0.45 * height) / 1080;
    for (const m of disposables) {
      const u = (m as ShaderMaterial).uniforms;
      if (!u) continue;
      if (u.uPixelAngle) u.uPixelAngle.value = ((vfov * Math.PI) / 180) / height;
      if (u.uPixelScale) u.uPixelScale.value = Math.max(height / 1080, 0.34);
      if (u.uMinPx) {
        (m as ShaderMaterial).userData.minPx ??= u.uMinPx.value;
        u.uMinPx.value = (m as ShaderMaterial).userData.minPx * pxScale;
      }
    }
  }

  setTime(0);
  return {
    scene,
    setTime,
    setViewport,
    dispose: () => {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}

/** Stars: fixed directions, pixel-sized; a few bright ones draw as tiny sparkles. */
function starGeometry(): BufferGeometry {
  const rnd = mulberry32(1701);
  const n = 2400;
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const bright = new Float32Array(n);
  const phase = new Float32Array(n);
  const spark = new Float32Array(n);
  const appear = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const y = 0.02 + Math.pow(rnd(), 0.8) * 0.98;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    const big = rnd() < 0.035;
    size[i] = big ? 5 + Math.floor(rnd() * 3) : rnd() < 0.18 ? 2 : 1;
    bright[i] = big ? 1.0 : 0.25 + rnd() * rnd() * 0.8;
    phase[i] = rnd();
    spark[i] = big ? 1 : 0;
    appear[i] = rnd() * 0.75;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new BufferAttribute(size, 1));
  geo.setAttribute('aBright', new BufferAttribute(bright, 1));
  geo.setAttribute('aPhase', new BufferAttribute(phase, 1));
  geo.setAttribute('aSpark', new BufferAttribute(spark, 1));
  geo.setAttribute('aAppear', new BufferAttribute(appear, 1));
  return geo;
}

/** A batch of camera-facing glows sharing one instanced quad. */
class GlowSet {
  private readonly pos: InstancedBufferAttribute;
  private readonly size: InstancedBufferAttribute;
  private readonly col: InstancedBufferAttribute;
  private readonly base: Float32Array;
  constructor(private readonly count: number) {
    this.pos = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.size = new InstancedBufferAttribute(new Float32Array(count), 1);
    this.col = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.base = new Float32Array(count * 3);
  }
  set(i: number, p: Vector3, size: number, r: number, g: number, b: number): void {
    this.pos.setXYZ(i, p.x, p.y, p.z);
    this.size.setX(i, size);
    this.base.set([r, g, b], i * 3);
    this.col.setXYZ(i, r, g, b);
  }
  move(i: number, p: Vector3): void {
    this.pos.setXYZ(i, p.x, p.y, p.z);
  }
  scale(i: number, k: number): void {
    this.col.setXYZ(i, this.base[i * 3] * k, this.base[i * 3 + 1] * k, this.base[i * 3 + 2] * k);
  }
  commit(): void {
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
  }
  mesh(material: ShaderMaterial): Mesh {
    const g = new InstancedBufferGeometry();
    g.setAttribute('corner', new BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    g.setAttribute('position', new BufferAttribute(new Float32Array(12), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('iPos', this.pos);
    g.setAttribute('iSize', this.size);
    g.setAttribute('iColor', this.col);
    g.instanceCount = this.count;
    const m = new Mesh(g, material);
    m.frustumCulled = false;
    return m;
  }
}

function glowUniforms(v: { uMinPx: number; uMirror?: number; uLift?: number; uCore: number; uGlowHalo: number; uFadeDist?: number; uCover?: number }): Uniforms {
  return {
    uMinPx: { value: v.uMinPx },
    uMirror: { value: v.uMirror ?? 0 },
    uLift: { value: v.uLift ?? 0 },
    uCore: { value: v.uCore },
    uGlowHalo: { value: v.uGlowHalo },
    uFadeDist: { value: v.uFadeDist ?? 1e6 },
    uCover: { value: v.uCover ?? 0 },
  };
}
