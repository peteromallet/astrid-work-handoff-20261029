import * as THREE from 'three';

/**
 * World template: one explorable world with two authored shots.
 *
 * Every Astrid world has the same four layers, in this order:
 *
 *   1. createWorld()     builds the place once: sky, horizon, ground, things.
 *   2. evaluateWorld(t)  sets the living state from WORLD time alone,
 *                        including the declared events.
 *   3. SHOTS, shotAt()   map SOURCE time (what the timeline plays) to one
 *                        shot, the world time it shows, and its camera pose.
 *   4. the free view     when the host passes `view`, draw exactly that view.
 *
 * Bundle this file into the package's single self-contained HTML entry. The
 * host owns both clocks and calls initialize/render/dispose; this source never
 * starts a render loop, an audio clock or an input handler.
 */

type Vec3 = [number, number, number];
type View = { position: Vec3; quaternion: [number, number, number, number]; fov: number };
type Frame = { sourceTime: number; width: number; height: number; view?: View; worldTime?: number };
type WorldEvent = { name: string; start: number; end?: number };
type Shot = { name: string; start: number; end: number; worldStart?: number };
type Explore = { start: { position: Vec3; target: Vec3 }; speed?: number; bounds?: { min: Vec3; max: Vec3 } };

type AstridScene = {
  explore: Explore;
  shots: readonly Shot[];
  events: readonly WorldEvent[];
  initialize(): Promise<void>;
  render(frame: Frame): Promise<void>;
  dispose(): void;
};

/** The manifest duration. World time and source time both run 0..DURATION. */
const DURATION = 10;
const POND_RADIUS = 5;

// ---- Events: what happens in the world, in WORLD seconds ------------------
// evaluateWorld reads these same objects, so retiming an event here moves both
// the declaration and the behaviour. Events happen whether or not a shot
// frames them: no shot below shows the lanterns, but exploring does.
const BOAT_CROSSES = { name: 'Boat crosses the pond', start: 1, end: 5 };
const LANTERNS_LIGHT = { name: 'Lanterns light', start: 7 };
const EVENTS: readonly WorldEvent[] = [BOAT_CROSSES, LANTERNS_LIGHT];

// ---- Explore: where the free view may go ---------------------------------
// The ground is flat and finished everywhere inside these bounds, and
// bounds.min[1] keeps the eye above it. The host clamps the view into them.
const EXPLORE: Explore = {
  start: { position: [0, 2.2, 13], target: [0, 0.5, 0] },
  speed: 3,
  bounds: { min: [-16, 0.5, -16], max: [16, 10, 16] },
};

type World = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sky: THREE.Mesh;
  skyTop: THREE.Color;
  skyHorizon: THREE.Color;
  fog: THREE.Fog;
  sun: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
  water: THREE.BufferAttribute;
  waterRadius: Float32Array;
  boat: THREE.Group;
  lamp: THREE.MeshStandardMaterial;
  lampLight: THREE.PointLight;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
};

/** A deterministic 0..1 value per integer: no Math.random, so every seek
 * rebuilds the same world. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ---- 1. The world, built once ---------------------------------------------
function createWorld(): World {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  // Software GL (the MP4 render) pays for every pixel: keep the ratio at 1
  // and leave shadow maps off.
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 600);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const geometry = <T extends THREE.BufferGeometry>(value: T): T => (geometries.push(value), value);
  const material = <T extends THREE.Material>(value: T): T => (materials.push(value), value);
  const instances = (geo: THREE.BufferGeometry, mat: THREE.Material, matrices: THREE.Matrix4[]) => {
    const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    scene.add(mesh);
  };
  const place = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));

  // Sky in every direction: a dome that follows the eye (see render), drawn
  // first and never fogged. Its horizon colour is the fog colour, so distant
  // ground, hills and sky meet without a seam.
  const skyTop = new THREE.Color();
  const skyHorizon = new THREE.Color();
  const sky = new THREE.Mesh(
    geometry(new THREE.SphereGeometry(400, 32, 16)),
    material(new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: skyTop }, horizon: { value: skyHorizon } },
      vertexShader: 'varying float h; void main() { h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying float h; void main() { gl_FragColor = vec4(mix(horizon, top, smoothstep(0.0, 0.45, h)), 1.0);\n#include <colorspace_fragment>\n}',
    })),
  );
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);
  const fog = new THREE.Fog(skyHorizon, 30, 90);
  scene.fog = fog;

  // Ground everywhere: the disc reaches far past the fog, so no edge shows.
  const ground = new THREE.Mesh(
    geometry(new THREE.CircleGeometry(160, 64)),
    material(new THREE.MeshLambertMaterial({ color: '#3d5a3a' })),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // A horizon all the way round: hills outside the bounds, half lost in fog.
  const hills: THREE.Matrix4[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + hash(i) * 0.3;
    const r = 45 + hash(i + 50) * 25;
    hills.push(place(Math.sin(a) * r, 0, Math.cos(a) * r, 10 + hash(i + 90) * 6, 6 + hash(i + 130) * 8, 10 + hash(i + 170) * 6));
  }
  const hillGeometry = geometry(new THREE.ConeGeometry(1, 1, 7));
  hillGeometry.translate(0, 0.5, 0);
  instances(hillGeometry, material(new THREE.MeshLambertMaterial({ color: '#2f4636' })), hills);

  // Trees inside the bounds, round so every side is finished. The sector
  // where the explore start and the wide camera stand is left open.
  const trunks: THREE.Matrix4[] = [];
  const crowns: THREE.Matrix4[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + hash(i + 7) * 0.25;
    if (Math.cos(a) > 0.6) continue;
    const r = 9 + hash(i + 23) * 3.5;
    const s = 0.8 + hash(i + 41) * 0.5;
    trunks.push(place(Math.sin(a) * r, 0.6 * s, Math.cos(a) * r, s, s, s));
    crowns.push(place(Math.sin(a) * r, 2.1 * s, Math.cos(a) * r, s, s, s));
  }
  instances(geometry(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 6)), material(new THREE.MeshLambertMaterial({ color: '#5a4030' })), trunks);
  instances(geometry(new THREE.ConeGeometry(0.9, 2.2, 7)), material(new THREE.MeshLambertMaterial({ color: '#2e5b3c' })), crowns);

  // The pond: a ring mesh whose heights evaluateWorld rewrites in place.
  const waterGeometry = geometry(new THREE.RingGeometry(0.001, POND_RADIUS, 48, 6));
  const water = waterGeometry.getAttribute('position') as THREE.BufferAttribute;
  const waterRadius = new Float32Array(water.count);
  for (let i = 0; i < water.count; i++) waterRadius[i] = Math.hypot(water.getX(i), water.getY(i));
  const pond = new THREE.Mesh(
    waterGeometry,
    material(new THREE.MeshStandardMaterial({ color: '#2b5d73', roughness: 0.25, metalness: 0.1, flatShading: true })),
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.y = 0.05;
  scene.add(pond);
  const rim = new THREE.Mesh(
    geometry(new THREE.RingGeometry(POND_RADIUS, POND_RADIUS + 0.4, 48)),
    material(new THREE.MeshLambertMaterial({ color: '#7d7a70' })),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.06;
  scene.add(rim);

  // The boat. Its sail is one flat shape, so it is double-sided: from behind
  // a single-sided plane would vanish.
  const boat = new THREE.Group();
  const wood = material(new THREE.MeshLambertMaterial({ color: '#8a5a3c' }));
  const hull = new THREE.Mesh(geometry(new THREE.BoxGeometry(1.2, 0.3, 0.5)), wood);
  hull.position.y = 0.15;
  const mast = new THREE.Mesh(geometry(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6)), wood);
  mast.position.y = 0.95;
  const sailShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.55, 0), new THREE.Vector2(0, 1)]);
  const sail = new THREE.Mesh(
    geometry(new THREE.ShapeGeometry(sailShape)),
    material(new THREE.MeshLambertMaterial({ color: '#efe6d2', side: THREE.DoubleSide })),
  );
  sail.position.set(0.04, 0.4, 0);
  boat.add(hull, mast, sail);
  scene.add(boat);

  // Lanterns round the pond share one material, so lighting them is one write.
  const lamp = material(new THREE.MeshStandardMaterial({ color: '#3a3326', emissive: '#ffb347', emissiveIntensity: 0 }));
  const posts: THREE.Matrix4[] = [];
  const lamps: THREE.Matrix4[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const r = POND_RADIUS + 1.5;
    posts.push(place(Math.sin(a) * r, 0.6, Math.cos(a) * r));
    lamps.push(place(Math.sin(a) * r, 1.3, Math.cos(a) * r));
  }
  instances(geometry(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6)), wood, posts);
  instances(geometry(new THREE.SphereGeometry(0.18, 12, 8)), lamp, lamps);
  const lampLight = new THREE.PointLight('#ffb347', 0, 18);
  lampLight.position.set(0, 2, 0);
  scene.add(lampLight);

  const ambient = new THREE.HemisphereLight('#b8ddff', '#2a3020', 1);
  const sun = new THREE.DirectionalLight('#ffd9a3', 2);
  sun.position.set(-30, 20, -10);
  scene.add(ambient, sun);

  return {
    renderer, scene, camera, sky, skyTop, skyHorizon, fog, sun, ambient,
    water, waterRadius, boat, lamp, lampLight, geometries, materials,
  };
}

// ---- 2. The living state, from world time alone ----------------------------
const DUSK_TOP = new THREE.Color('#5a7fb0');
const NIGHT_TOP = new THREE.Color('#0d1430');
const DUSK_HORIZON = new THREE.Color('#e8a97a');
const NIGHT_HORIZON = new THREE.Color('#2a2f4a');

/** Where the boat is at a world time: moored west before the crossing,
 * moored east after it. Cameras may follow it too. */
function boatPosition(worldTime: number, out: THREE.Vector3): THREE.Vector3 {
  const u = THREE.MathUtils.smoothstep(worldTime, BOAT_CROSSES.start, BOAT_CROSSES.end);
  return out.set(-3.2 + 6.4 * u, 0.05 + Math.sin(worldTime * 3) * 0.02, Math.sin(u * Math.PI) * 0.8);
}

/** Every animated property is set from worldTime here, never accumulated
 * from the previous frame, so a direct or backward seek gives the same frame. */
function evaluateWorld(world: World, worldTime: number): void {
  const t = THREE.MathUtils.clamp(worldTime, 0, DURATION);
  const night = t / DURATION;
  world.skyTop.copy(DUSK_TOP).lerp(NIGHT_TOP, night);
  world.skyHorizon.copy(DUSK_HORIZON).lerp(NIGHT_HORIZON, night);
  world.fog.color.copy(world.skyHorizon);
  world.sun.intensity = 2 * (1 - night) + 0.2;
  world.ambient.intensity = 1 - 0.6 * night;

  for (let i = 0; i < world.water.count; i++) {
    world.water.setZ(i, Math.sin(world.waterRadius[i] * 3 - t * 2.2) * 0.03);
  }
  world.water.needsUpdate = true;

  boatPosition(t, world.boat.position);
  world.boat.rotation.set(Math.sin(t * 2.1) * 0.04, -0.3 * Math.cos(THREE.MathUtils.smoothstep(t, BOAT_CROSSES.start, BOAT_CROSSES.end) * Math.PI), 0);

  const lit = THREE.MathUtils.smoothstep(t, LANTERNS_LIGHT.start, LANTERNS_LIGHT.start + 0.8);
  world.lamp.emissiveIntensity = 2.5 * lit;
  world.lampLight.intensity = 6 * lit;
}

// ---- 3. Shots: the authored shots, in source seconds -------------------------
// Named, non-overlapping, and together covering 0..DURATION, so every source
// time has exactly one shot. worldStart is the world time a shot shows at
// its start (default: its own start, i.e. aligned). "Low on the crossing"
// replays the crossing that "Wide on the crossing" showed, from the water.
type Pose = { position: THREE.Vector3; target: THREE.Vector3; fov: number };
type ShotDef = Shot & { pose(progress: number, worldTime: number, out: Pose): void };

const SHOTS: readonly ShotDef[] = [
  {
    name: 'Wide on the crossing', start: 0, end: 5, // aligned: world 0..5
    pose(u, _t, out) {
      out.position.set(-9 + 3 * u, 4.2 - 0.6 * u, 10);
      out.target.set(0, 0.4, 0);
      out.fov = 42;
    },
  },
  {
    name: 'Low on the crossing', start: 5, end: 10, worldStart: 1, // world 1..6
    pose(_u, t, out) {
      out.position.set(1.5, 0.8, POND_RADIUS + 1.2);
      boatPosition(t, out.target).y += 0.5; // follows the boat
      out.fov = 35;
    },
  },
];

/** The shot for a source time and the world time it shows. Ranges are
 * half-open; the final instant belongs to the last shot. */
function shotAt(sourceTime: number): { shot: ShotDef; worldTime: number; progress: number } {
  const s = THREE.MathUtils.clamp(sourceTime, 0, DURATION);
  const shot = SHOTS.find(c => s >= c.start && s < c.end) ?? SHOTS[SHOTS.length - 1];
  const local = s - shot.start;
  return { shot, worldTime: (shot.worldStart ?? shot.start) + local, progress: local / (shot.end - shot.start) };
}

// ---- 4. The host-facing scene ---------------------------------------------
let world: World | undefined;
let disposed = false;
const pose: Pose = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 45 };

const astridScene: AstridScene = {
  explore: EXPLORE,
  shots: SHOTS.map(({ name, start, end, worldStart }) => ({ name, start, end, worldStart })),
  events: EVENTS,

  async initialize() {
    if (world && !disposed) return;
    disposed = false;
    world = createWorld();
    // No remote assets here. Still wait for fonts before reporting a usable surface.
    await document.fonts.ready;
  },

  async render({ sourceTime, width, height, view, worldTime }: Frame) {
    if (disposed || !world) throw new Error('World is disposed');
    if (![sourceTime, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      throw new Error('Invalid world frame request');
    }
    const { renderer, scene, camera } = world;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    if (view) {
      // Explore: the world at the explorer's world time, from exactly its view.
      evaluateWorld(world, worldTime ?? sourceTime);
      camera.position.fromArray(view.position);
      camera.quaternion.fromArray(view.quaternion);
      camera.fov = view.fov;
    } else {
      // Timeline and video: source time picks the shot and the world time it shows.
      const at = shotAt(sourceTime);
      evaluateWorld(world, at.worldTime);
      at.shot.pose(at.progress, at.worldTime, pose);
      camera.position.copy(pose.position);
      camera.lookAt(pose.target);
      camera.fov = pose.fov;
    }
    camera.updateProjectionMatrix();
    world.sky.position.copy(camera.position); // the sky is always out of reach
    renderer.render(scene, camera);
    renderer.getContext().finish();
  },

  dispose() {
    if (disposed) return;
    disposed = true;
    const current = world;
    world = undefined;
    if (!current) return;
    for (const geometry of current.geometries) geometry.dispose();
    for (const material of current.materials) material.dispose();
    current.renderer.dispose();
    current.renderer.forceContextLoss();
    current.renderer.domElement.remove();
  },
};

window.astridScene = astridScene;

declare global {
  interface Window {
    astridScene: AstridScene;
  }
}
