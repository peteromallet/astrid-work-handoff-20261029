// Node-side checks of the camera moves against the world: ground clearance,
// smoothness, graceful starts and ends, trees and lanterns kept clear, and which
// camera sees each event. Run: npm run check
import { Quaternion, Vector3 } from 'three';
import { SHOTS, DURATION, EXPLORE, moveAt, type Pose } from '../src/shots';
import { WATER_Y, bridgeFrame, terrainHeight } from '../src/world/layout';
import { EVENTS, lanternAt, lanternSeeds, type LanternState } from '../src/world/living';
import { placeTrees } from '../src/world/placement';

const deg = (r: number) => ((r * 180) / Math.PI).toFixed(1);
const trees = placeTrees();
const seeds = lanternSeeds();
const lantern: LanternState = { x: 0, y: 0, z: 0, alpha: 0, flicker: 0, sway: 0 };
const bridge = bridgeFrame().center;
const fps = 30;
let failures = 0;

for (const cam of SHOTS) {
  const pose: Pose = { position: new Vector3(), quaternion: new Quaternion(), fov: 40 };
  const frames: { p: Vector3; fwd: Vector3; t: number; w: number }[] = [];
  const last = Math.round((cam.end - cam.start) * fps) - (cam.end === DURATION ? 0 : 1);
  for (let i = 0; i <= last; i++) {
    const t = cam.start + i / fps;
    const move = moveAt(t);
    if (move.name !== cam.name) throw Error(`t=${t} belongs to ${move.name}, expected ${cam.name}`);
    move.pose(t, pose);
    frames.push({ p: pose.position.clone(), fwd: new Vector3(0, 0, -1).applyQuaternion(pose.quaternion), t, w: move.worldTime(t) });
  }
  let minClear = Infinity;
  let maxSpeed = 0;
  let maxTurn = 0;
  let nearestTree = Infinity;
  let nearestLantern = Infinity;
  let underBridge = '';
  for (let i = 0; i < frames.length; i++) {
    const { p, w } = frames[i];
    let ground = WATER_Y;
    for (const [ox, oz] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) ground = Math.max(ground, terrainHeight(p.x + ox, p.z + oz));
    minClear = Math.min(minClear, p.y - ground);
    if (i > 0) {
      maxSpeed = Math.max(maxSpeed, p.distanceTo(frames[i - 1].p) * fps);
      maxTurn = Math.max(maxTurn, frames[i].fwd.angleTo(frames[i - 1].fwd) * fps);
    }
    for (const tr of trees) {
      if (p.y < tr.y + tr.h + 3) nearestTree = Math.min(nearestTree, Math.hypot(tr.x - p.x, tr.z - p.z) - tr.h * 0.3);
    }
    for (const s of seeds) {
      lanternAt(s, w, lantern);
      if (lantern.alpha > 0) nearestLantern = Math.min(nearestLantern, Math.hypot(lantern.x - p.x, lantern.y - p.y, lantern.z - p.z));
    }
    if (Math.hypot(p.x - bridge.x, p.z - bridge.z) < 1.5) underBridge = `passes the arch at ${p.y.toFixed(2)} m (arch crown 3.5 m, water 0)`;
  }
  const n = frames.length;
  const startSpeed = frames[1].p.distanceTo(frames[0].p) * fps;
  const endSpeed = frames[n - 1].p.distanceTo(frames[n - 2].p) * fps;
  console.log(`\n${cam.name}: source ${cam.start}-${cam.end}s, world ${cam.worldStart}-${cam.worldStart + cam.end - cam.start}s`);
  console.log(`  min clearance ${minClear.toFixed(2)} m; max speed ${maxSpeed.toFixed(1)} m/s; max turn ${deg(maxTurn)} deg/s`);
  console.log(`  speed at first frame ${startSpeed.toFixed(3)} m/s, at last frame ${endSpeed.toFixed(3)} m/s`);
  console.log(`  nearest tree canopy ${nearestTree.toFixed(1)} m; nearest lantern ${nearestLantern.toFixed(1)} m`);
  if (underBridge) console.log(`  ${underBridge}`);
  if (minClear < 1.2 || nearestTree < 3 || nearestLantern < 4 || startSpeed > 0.25 || endSpeed > 0.25) {
    failures++;
    console.log('  !! check failed');
  }
}

console.log('\nevents (world time) and the shots that see them:');
for (const ev of EVENTS) {
  const end = ev.end ?? ev.start + 1;
  const seenBy = SHOTS.filter((c) => c.worldStart < end && c.worldStart + (c.end - c.start) > ev.start).map((c) => c.name);
  console.log(`  ${ev.name} ${ev.start}${ev.end !== undefined ? `-${ev.end}` : ''}s: ${seenBy.join(', ') || 'no camera'}`);
}
const s = EXPLORE.start.position;
console.log(`\nexplore start ${s.join(', ')}, ${(s[1] - Math.max(terrainHeight(s[0], s[2]), 0)).toFixed(1)} m above ground; bounds ${JSON.stringify(EXPLORE.bounds)}`);
if (failures) throw Error(`${failures} camera check(s) failed`);
