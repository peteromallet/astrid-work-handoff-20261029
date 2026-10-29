// Free views, event shots and camera stills, rendered exactly as the World
// Explorer requests them: Astrid's SceneFrameHost drives the entry inside a
// sandbox="allow-scripts" srcdoc iframe (host CSP + bridge), with
// request({ sourceTime, width, height, view?, worldTime? }).
//   node harness/views.mjs [--size 1920x1080] [--groups shots,events,free]
import { build, loadPlaywright, NODE_PATHS, REPO, requireDeps } from '../deps.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { PerspectiveCamera } = requireDeps('three');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const RUNTIME =
  process.env.ASTRID_RUNTIME_TS ??
  join(REPO, 'astrid/packs/rendering/ui/threejs-live-editor/runtime.ts');
const [w, h] = (args.size ?? '1920x1080').split('x').map(Number);
const groups = (args.groups ?? 'shots,events,free').split(',');
const shots = JSON.parse(readFileSync(join(root, 'harness/shots.json'), 'utf8'));
const prepared = readFileSync(join(root, 'prepared/lantern-valley.scene.json'), 'utf8');
const hostJs = (
  await build({ entryPoints: [join(root, 'harness/host-page.ts')], bundle: true, format: 'iife', write: false, alias: { 'astrid-runtime': RUNTIME },
    nodePaths: NODE_PATHS, logLevel: 'warning' })
).outputFiles[0].text;

const toView = (v) => {
  const cam = new PerspectiveCamera(v.fov, w / h);
  cam.position.fromArray(v.position);
  cam.lookAt(...v.target);
  return { position: v.position, quaternion: cam.quaternion.toArray(), fov: v.fov };
};

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
const parentHtml = `<!doctype html><html><head><style>html,body{margin:0;background:#000}</style></head><body><script>${hostJs.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
await page.route('https://harness.astrid.invalid/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: parentHtml }));
await page.goto('https://harness.astrid.invalid/');
const loaded = await page.evaluate(({ text, w, h }) => window.harness.load(text, w, h), { text: prepared, w, h });
const report = { size: `${w}x${h}`, hostAccepted: loaded.declared, shots: [] };
for (const group of groups) {
  mkdirSync(join(root, 'stills', group), { recursive: true });
  for (const shot of shots[group]) {
    // the explorer sends sourceTime = worldTime alongside its view
    const sourceTime = shot.worldTime ?? shot.sourceTime;
    const view = shot.view ? toView(shot.view) : undefined;
    const ms = await page.evaluate(({ t, v, wt }) => window.harness.frame(t, v, wt), { t: sourceTime, v: view, wt: shot.worldTime });
    const file = join(root, 'stills', group, `${shot.name}.png`);
    await page.locator('iframe').screenshot({ path: file });
    report.shots.push({ group, ...shot, roundTripMs: Math.round(ms) });
    console.log(`${group}/${shot.name}`);
  }
}
await browser.close();
const errors = logs.filter((l) => /^error|pageerror|Shader Error|INVALID_/.test(l));
report.errors = [...new Set(errors)].slice(0, 10);
writeFileSync(join(root, 'stills', 'views-report.json'), JSON.stringify(report, null, 2) + '\n');
if (errors.length) {
  console.error(`!! ${errors.length} errors:\n${report.errors.join('\n')}`);
  process.exit(1);
}
