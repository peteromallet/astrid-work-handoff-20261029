// Lantern Valley: an explorable world for Astrid's Three.js Live Editor.
//
// The entry has three parts, in this order:
//   1. the world: built once by buildWorld() (src/world/build.ts),
//   2. its living state at a world time: world.setTime(t) (src/world/living.ts),
//   3. shots that live in it: named moves on the source clock (src/shots.ts),
//      or any free view the host hands over.
// The host owns time. render() is a pure function of its input: nothing here
// runs on its own clock, so any frame can be drawn directly, in any order.
import { LinearSRGBColorSpace, MathUtils, PerspectiveCamera, Quaternion, Vector3, WebGLRenderer } from 'three';
import { SHOTS, DURATION, EXPLORE, moveAt, settleView, type Pose } from './shots';
import { buildWorld, type World } from './world/build';
import { EVENTS } from './world/living';

type Vec3 = [number, number, number];

interface View {
  position: Vec3;
  quaternion: [number, number, number, number];
  /** vertical field of view, degrees */
  fov: number;
}

interface RenderInput {
  sourceTime: number;
  width: number;
  height: number;
  /** a free camera (the explorer); otherwise the named move at sourceTime */
  view?: View;
  /** the world's own time (the explorer); otherwise the move's worldStart + its local time */
  worldTime?: number;
}

declare global {
  interface Window {
    astridScene: {
      explore: typeof EXPLORE;
      shots: typeof SHOTS;
      events: typeof EVENTS;
      initialize(): Promise<void>;
      render(input: RenderInput): Promise<void>;
      dispose(): void;
    };
  }
}

const WIDE = 16 / 9;
let renderer: WebGLRenderer | null = null;
let world: World | null = null;
let initializing: Promise<void> | null = null;
let disposed = false;
const camera = new PerspectiveCamera(40, WIDE, 0.5, 6000);
const pose: Pose = { position: new Vector3(), quaternion: new Quaternion(), fov: 40 };
const viewport = { width: 0, height: 0, fov: 0 };

async function initialize(): Promise<void> {
  renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = LinearSRGBColorSpace; // the shaders grade and encode themselves
  renderer.setClearColor(0x2a3d55, 1); // horizon tone, should any gap ever show
  renderer.domElement.setAttribute('aria-label', 'Lantern Valley');
  document.body.appendChild(renderer.domElement);
  world = buildWorld();
  // compile every shader up front so the first frame is not a stall
  draw({ sourceTime: 0, width: 1280, height: 720 });
}

function draw(input: RenderInput): void {
  if (!renderer || !world) throw Error('Lantern Valley is not initialized');
  const { width, height } = input;
  const sourceTime = MathUtils.clamp(input.sourceTime, 0, DURATION);
  const move = moveAt(sourceTime);
  const worldTime = input.worldTime ?? move.worldTime(sourceTime);
  if (!Number.isFinite(worldTime)) throw Error('Lantern Valley needs a finite worldTime');

  let fov: number;
  if (input.view) {
    readView(input.view, pose);
    fov = pose.fov;
  } else {
    move.pose(sourceTime, pose);
    // narrower than 16:9: keep the authored width of view, so portrait frames still see the scene
    const aspect = width / height;
    const hfov = 2 * Math.atan(Math.tan(MathUtils.degToRad(pose.fov / 2)) * WIDE);
    fov = aspect < WIDE ? Math.min(72, MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect))) : pose.fov;
  }

  if (viewport.width !== width || viewport.height !== height || viewport.fov !== fov) {
    viewport.width = width;
    viewport.height = height;
    viewport.fov = fov;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    world.setViewport(width, height, fov);
  }
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
  camera.updateMatrixWorld();

  world.setTime(worldTime);
  renderer.render(world.scene, camera);
  renderer.getContext().finish();
}

function readView(view: View, out: Pose): Pose {
  const { position: p, quaternion: q, fov } = view;
  const finite = (a: unknown, n: number) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
  if (!finite(p, 3) || !finite(q, 4) || !Number.isFinite(fov) || fov <= 1 || fov >= 179) {
    throw Error('Lantern Valley view needs position[3], quaternion[4] and fov in degrees');
  }
  // stay inside the valley and a little above the ground, so walking feels natural
  settleView(out.position.fromArray(p));
  out.quaternion.fromArray(q);
  if (out.quaternion.lengthSq() === 0) throw Error('Lantern Valley view quaternion is zero');
  out.quaternion.normalize();
  out.fov = fov;
  return out;
}

window.astridScene = {
  explore: EXPLORE,
  shots: SHOTS,
  events: EVENTS,
  // idempotent: the host may ask more than once
  initialize: () => (initializing ??= initialize()),
  async render(input: RenderInput) {
    const { sourceTime, width, height } = input;
    if (![sourceTime, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      throw Error('Lantern Valley render needs a finite sourceTime and a positive size');
    }
    draw({ ...input, width: Math.round(width), height: Math.round(height) });
  },
  dispose() {
    if (disposed) return;
    disposed = true;
    world?.dispose();
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
    world = null;
    renderer = null;
  },
};
