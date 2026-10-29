// Node-side checks of the camera moves (see check-shots.ts), bundled with the repo's three.
//   node harness/check.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, NODE_PATHS } from '../deps.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({
  entryPoints: [join(root, 'harness/check-shots.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  nodePaths: NODE_PATHS,
  write: false,
  logLevel: 'warning',
});
mkdirSync(join(root, '.cache'), { recursive: true });
const out = join(root, '.cache/check-shots.mjs');
writeFileSync(out, result.outputFiles[0].text);
execFileSync(process.execPath, [out], { stdio: 'inherit' });
