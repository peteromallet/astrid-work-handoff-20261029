import {createHash, randomUUID} from 'node:crypto';
import {readFileSync, renameSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(projectRoot, 'patches/renderer-4.0.509-darwin-cpu.json'), 'utf8'));
const hash = (value) => createHash('sha256').update(value).digest('hex');

export function applyRendererDarwinCpuPatch(root = projectRoot) {
  const renderer = path.join(root, 'node_modules/@remotion/renderer');
  const metadata = JSON.parse(readFileSync(path.join(renderer, 'package.json'), 'utf8'));
  if (metadata.name !== manifest.package || metadata.version !== manifest.version) {
    throw new Error(`Darwin CPU patch requires ${manifest.package}@${manifest.version}`);
  }
  // Validate both module formats before changing either one. Replays accept
  // only the exact reviewed postimage; unrelated local edits remain errors.
  const pending = manifest.files.map((entry) => {
    const filename = path.join(renderer, entry.path);
    const bytes = readFileSync(filename);
    const observed = hash(bytes);
    if (observed === entry.after_sha256) return null;
    if (observed !== entry.before_sha256) {
      throw new Error(`Unexpected upstream content for Darwin CPU patch: ${entry.path}`);
    }
    const source = bytes.toString('utf8');
    if (source.split(entry.before).length !== 2) {
      throw new Error(`Darwin CPU patch context is not unique: ${entry.path}`);
    }
    const result = source.replace(entry.before, entry.after);
    if (hash(result) !== entry.after_sha256) {
      throw new Error(`Darwin CPU patch postimage mismatch: ${entry.path}`);
    }
    return {filename, result, mode: statSync(filename).mode};
  }).filter(Boolean);
  for (const {filename, result, mode} of pending) {
    const temporary = `${filename}.astrid-cpu-${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, result, {flag: 'wx', mode});
      renameSync(temporary, filename);
    } finally {
      try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  return {package: manifest.package, version: manifest.version, patchedFiles: pending.length};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(applyRendererDarwinCpuPatch()));
}
