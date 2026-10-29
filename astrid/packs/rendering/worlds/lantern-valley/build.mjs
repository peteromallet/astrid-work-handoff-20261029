// Bundles three + a world's source into one self-contained HTML entry and wraps it as a
// prepared live-scene package (.scene.json).
//
//   node build.mjs                                  Lantern Valley: writes prepared/, world.json and the
//                                                   World Explorer's generated module worlds/sample
//   node build.mjs --src <world.ts> --out <file>.scene.json [--name "My World"] [--duration 10] [--fps 30] [--minify]
//                                                   any world: bundles the source and writes just that package
//
// --duration must equal the DURATION constant in the world source. When the source declares
// `const DURATION = <number>` it is read from there (and --duration, if given, must agree).
// three and esbuild come from deps.mjs.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build, NODE_PATHS, THREE_VERSION } from './deps.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const MAX_ENTRY_BYTES = 8_388_608;

const { values: opts } = parseArgs({
  options: {
    src: { type: 'string' },
    out: { type: 'string' },
    name: { type: 'string' },
    duration: { type: 'string' },
    fps: { type: 'string', default: '30' },
    minify: { type: 'boolean', default: false },
  },
});
if (Boolean(opts.src) !== Boolean(opts.out)) throw Error('--src and --out go together: node build.mjs --src <world.ts> --out <file>.scene.json');
const custom = Boolean(opts.src);

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function packageWorld({ entryPoint, title, entryName, duration, authoredFps, minify, credit }) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110'],
    minify,
    legalComments: 'none',
    nodePaths: NODE_PATHS,
    write: false,
    logLevel: 'warning',
  });
  let js = result.outputFiles[0].text;
  // keep the inline script from closing early or entering HTML comment parsing
  js = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#05080f}canvas{display:block;width:100vw;height:100vh}</style>
</head>
<body>
<script>${credit ? `/* ${credit} */\n` : ''}${js}</script>
</body>
</html>
`;

  // The host injects its CSP after the first <head ...> and its bridge before the
  // first </body>; neither may appear earlier inside the script.
  const firstHead = html.search(/<head([^>]*)>/i);
  const firstBodyClose = html.search(/<\/body>/i);
  if (firstHead !== html.indexOf('<head>')) throw Error('unexpected <head match');
  if (firstBodyClose !== html.lastIndexOf('</body>')) throw Error('script contains </body>');

  const bytes = Buffer.from(html, 'utf8');
  if (bytes.length > MAX_ENTRY_BYTES) throw Error(`entry too large: ${bytes.length}`);
  const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  const pkg = {
    manifest: { formatVersion: 1, entry: entryName, duration, authoredFps },
    entry: { digest, filename: entryName, media_type: 'text/html', size: bytes.length },
    assets: [],
    html,
  };
  const packageJson = JSON.stringify(pkg);
  return { html, bytes, digest, packageJson };
}

if (custom) {
  const entryPoint = resolve(opts.src);
  const out = resolve(opts.out);
  const declared = /\bDURATION\s*(?::\s*number\s*)?=\s*(\d+(?:\.\d+)?)\b/.exec(readFileSync(entryPoint, 'utf8'));
  const given = opts.duration === undefined ? undefined : Number(opts.duration);
  if (given !== undefined && !(given > 0)) throw Error(`--duration must be a positive number of seconds, got ${opts.duration}`);
  if (declared && given !== undefined && Number(declared[1]) !== given) {
    throw Error(`--duration ${given} but ${basename(entryPoint)} declares DURATION = ${declared[1]}; they must be equal`);
  }
  const duration = given ?? (declared ? Number(declared[1]) : undefined);
  if (duration === undefined) throw Error(`no DURATION found in ${basename(entryPoint)}; pass --duration <seconds> equal to it`);
  const stem = basename(entryPoint, extname(entryPoint));
  const { bytes, digest, packageJson } = await packageWorld({
    entryPoint,
    title: opts.name ?? stem,
    entryName: `${stem}.html`,
    duration,
    authoredFps: Number(opts.fps),
    minify: opts.minify,
    credit: `three.js r${THREE_VERSION.split('.')[1]} (${THREE_VERSION}), MIT License, Copyright 2010-2026 three.js authors.`,
  });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, packageJson);
  console.log(JSON.stringify({ out, duration, entryBytes: bytes.length, packageChars: packageJson.length, digest }, null, 2));
  process.exit(0);
}

const prepared = join(root, 'prepared');
const cache = join(root, '.cache');
// The explorer's module lives in the extension's ui/ folder; this folder stays out of ui/
// so the App's vendoring (every .ts under ui/) does not pull the scene source in.
const explorerModule = resolve(root, '../../ui/threejs-live-editor/explorer/worlds/sample.ts');
mkdirSync(prepared, { recursive: true });
mkdirSync(cache, { recursive: true });

const ENTRY_NAME = 'lantern-valley.html';
const DURATION = 75;
const AUTHORED_FPS = 30;

const { html, bytes, digest, packageJson } = await packageWorld({
  entryPoint: join(root, 'src/main.ts'),
  title: 'Lantern Valley',
  entryName: ENTRY_NAME,
  duration: DURATION,
  authoredFps: AUTHORED_FPS,
  minify: true,
  credit: `Lantern Valley, an Astrid sample world. three.js r${THREE_VERSION.split('.')[1]} (${THREE_VERSION}), MIT License, Copyright 2010-2026 three.js authors.`,
});

// The world description comes from the scene source itself, so world.json and
// what the entry reports at runtime always agree.
const describe = await build({
  stdin: {
    contents: "export { EXPLORE, SHOTS, DURATION } from './shots'; export { EVENTS } from './world/living';",
    resolveDir: join(root, 'src'),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  nodePaths: NODE_PATHS,
  write: false,
  logLevel: 'warning',
});
const mod = await import('data:text/javascript;base64,' + Buffer.from(describe.outputFiles[0].text).toString('base64'));
if (mod.DURATION !== DURATION) throw Error(`shots span ${mod.DURATION}s but the manifest says ${DURATION}s`);
const description = { explore: mod.EXPLORE, shots: mod.SHOTS, events: mod.EVENTS };

writeFileSync(join(prepared, 'lantern-valley.scene.json'), packageJson);
writeFileSync(join(cache, ENTRY_NAME), html);
writeFileSync(join(prepared, 'world.json'), JSON.stringify(description, null, 2) + '\n');
// The drop-in module the explorer imports: the same name, package and world description
// that the panel reads (name, packageJson, events, shots; explore is reported by the scene).
mkdirSync(dirname(explorerModule), { recursive: true });
writeFileSync(
  explorerModule,
  `// Generated by worlds/lantern-valley/build (three ${THREE_VERSION}). Do not edit by hand.\n` +
    `export const SAMPLE_WORLD = {\n` +
    `  name: ${JSON.stringify('Lantern Valley')},\n` +
    `  packageJson: ${JSON.stringify(packageJson)},\n` +
    `  explore: ${JSON.stringify(description.explore)},\n` +
    `  shots: ${JSON.stringify(description.shots)},\n` +
    `  events: ${JSON.stringify(description.events)},\n} as const;\n`,
);
const packageBytes = Buffer.byteLength(packageJson);
console.log(
  JSON.stringify({ three: THREE_VERSION, entryBytes: bytes.length, packageBytes, moduleFile: explorerModule, digest, ...description }, null, 2),
);
