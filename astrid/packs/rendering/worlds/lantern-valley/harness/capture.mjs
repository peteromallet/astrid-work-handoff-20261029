// Verification harness: loads prepared/lantern-valley.scene.json through Astrid's own
// runtime in headless Chromium (Playwright's bundled build, SwiftShader GL), renders
// stills and times each frame.
//   node harness/capture.mjs [--times 0,6,12] [--sizes 1920x1080,640x360] [--out stills]
import { build, loadPlaywright, NODE_PATHS, REPO } from '../deps.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const RUNTIME =
  process.env.ASTRID_RUNTIME_TS ??
  join(REPO, 'astrid/packs/rendering/ui/threejs-live-editor/runtime.ts');
const times = (args.times ?? '0,6,12,18,24,30,36,42,48,54,60,66,72,75').split(',').map(Number);
const sizes = (args.sizes ?? '1920x1080,640x360').split(',').map((s) => s.split('x').map(Number));
const outDir = join(root, args.out ?? 'stills');
const prefix = args.prefix ?? '';
mkdirSync(outDir, { recursive: true });

const hostJs = (
  await build({
    entryPoints: [join(root, 'harness/host-page.ts')],
    bundle: true,
    format: 'iife',
    write: false,
    alias: { 'astrid-runtime': RUNTIME },
    nodePaths: NODE_PATHS,
    logLevel: 'warning',
  })
).outputFiles[0].text;
const prepared = readFileSync(join(root, 'prepared/lantern-valley.scene.json'), 'utf8');

const { chromium } = loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const report = { browser: browser.version(), runtime: RUNTIME, sizes: [] };
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
try {
  for (const [w, h] of sizes) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const logs = [];
    page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
    // an https origin gives the parent page a secure context (crypto.subtle), like the app
    const parentHtml = `<!doctype html><html><head><style>html,body{margin:0;background:#000}</style></head><body><script>${hostJs.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
    await page.route('https://harness.astrid.invalid/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: parentHtml }));
    await page.goto('https://harness.astrid.invalid/');
    const loaded = await page.evaluate(({ text, w, h }) => window.harness.load(text, w, h), { text: prepared, w, h });
    const gl = await page.evaluate(() => {
      const c = document.createElement('canvas').getContext('webgl2');
      const ext = c && c.getExtension('WEBGL_debug_renderer_info');
      return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    const frames = [];
    for (const t of times) {
      const ms = await page.evaluate((st) => window.harness.frame(st), t);
      const file = join(outDir, `${prefix}t${String(t).padStart(2, '0')}_${w}x${h}.png`);
      await page.locator('iframe').screenshot({ path: file });
      frames.push({ t, ms: Math.round(ms * 10) / 10, file });
      console.log(`${w}x${h} t=${t} ${ms.toFixed(1)} ms -> ${file}`);
    }
    // determinism: re-render an earlier time after later ones and compare pixels
    const tA = times[Math.min(2, times.length - 1)];
    await page.evaluate((st) => window.harness.frame(st), tA);
    const again = await page.locator('iframe').screenshot();
    const firstShot = readFileSync(frames.find((f) => f.t === tA).file);
    const deterministic = Buffer.compare(again, firstShot) === 0;
    // Direct timing: the same host document (CSP + bridge) as a top-level page, so
    // render() can be followed by a 1-pixel readPixels that waits for the GPU
    // (SwiftShader) to finish; the postMessage round trip above does not.
    const documentHtml = await page.evaluate(() => window.harness.documentHtml);
    const direct = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    direct.on('pageerror', (e) => logs.push(`pageerror(direct): ${e.message}`));
    await direct.route('https://scene.astrid.invalid/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: documentHtml }));
    await direct.goto('https://scene.astrid.invalid/');
    const gpuMs = await direct.evaluate(async ({ w, h, times }) => {
      await window.astridScene.initialize();
      const gl = document.querySelector('canvas').getContext('webgl2');
      const px = new Uint8Array(4);
      const out = [];
      for (const t of [times[0], ...times]) {
        const t0 = performance.now();
        await window.astridScene.render({ sourceTime: t, width: w, height: h });
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        out.push(performance.now() - t0);
      }
      return out;
    }, { w, h, times });
    await direct.close();
    const warmup = gpuMs.shift();
    const errors = logs.filter((l) => /^error|pageerror|Shader Error|INVALID_/.test(l));
    if (errors.length) console.error(`!! ${errors.length} GL/page errors at ${w}x${h}:\n` + [...new Set(errors.map((e) => e.slice(0, 600)))].slice(0, 3).join('\n---\n'));
    report.sizes.push({
      size: `${w}x${h}`,
      renderer: gl,
      initPlusFirstFrameMs: Math.round(loaded.initMs),
      declaredToHost: loaded.declared,
      frames,
      medianRoundTripMs: Math.round(median(frames.map((f) => f.ms)) * 10) / 10,
      firstFrameGpuMs: Math.round(warmup),
      medianFrameGpuMs: Math.round(median(gpuMs) * 10) / 10,
      maxFrameGpuMs: Math.round(Math.max(...gpuMs) * 10) / 10,
      reseekIdentical: deterministic,
      errorCount: errors.length,
      logs: [...new Set(logs)].slice(0, 40),
    });
    await page.close();
  }
} finally {
  await browser.close();
}
writeFileSync(join(outDir, `${prefix}report.json`), JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify(
    report.sizes.map(({ frames, logs, declaredToHost, ...rest }) => ({
      ...rest,
      hostAccepted: { shots: declaredToHost.shots.length, events: declaredToHost.events.length, explore: Boolean(declaredToHost.explore) },
    })),
    null,
    2,
  ),
);
