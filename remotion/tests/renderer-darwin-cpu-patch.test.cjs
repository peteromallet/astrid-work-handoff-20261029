const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');
const {test} = require('node:test');
const {createHash} = require('node:crypto');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'patches/renderer-4.0.509-darwin-cpu.json')));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const applicator = import(pathToFileURL(path.join(root, 'scripts/apply-renderer-darwin-cpu-patch.mjs')).href);
const upstream = (entry) => {
  const bytes = fs.readFileSync(path.join(root, 'node_modules/@remotion/renderer', entry.path));
  if (hash(bytes) === entry.before_sha256) return bytes.toString();
  assert.equal(hash(bytes), entry.after_sha256);
  const original = bytes.toString().replace(entry.after, entry.before);
  assert.equal(hash(original), entry.before_sha256);
  return original;
};
const fixture = (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'astrid-cpu-patch-'));
  t.after(() => fs.rmSync(temporary, {recursive: true, force: true}));
  const renderer = path.join(temporary, 'node_modules/@remotion/renderer');
  fs.mkdirSync(renderer, {recursive: true});
  fs.writeFileSync(path.join(renderer, 'package.json'), JSON.stringify({name: manifest.package, version: manifest.version}));
  for (const entry of manifest.files) {
    const target = path.join(renderer, entry.path);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, upstream(entry));
  }
  return {temporary, renderer};
};

// Evaluate the actual pinned CJS function or the actual ESM source section,
// with isolated OS/child-process bindings. No renderer or shell is launched.
const loadCpu = (entry, source, platform, nativeOs, execSync) => {
  const exports = {};
  const context = vm.createContext({exports, process: {platform}, execSync3: execSync, os6: nativeOs,
    require: (name) => {
      if (name === 'node:child_process') return {execSync};
      if (name === 'node:os') return nativeOs;
      throw new Error(`Unexpected dependency: ${name}`);
    }});
  if (entry.path.endsWith('.mjs')) {
    source = source.split('// src/get-cpu-count.ts\n')[1].split('// src/memory/get-available-memory.ts')[0];
    source = source.replace(/^import .*;\n/gm, '') + '\nexports.getCpuCount = getCpuCount;';
  }
  new vm.Script(source).runInContext(context);
  return exports.getCpuCount;
};

for (const entry of manifest.files) {
  const original = upstream(entry);
  const patched = original.replace(entry.before, entry.after);
  test(`${entry.path}: Darwin returns native availability without child processes`, () => {
    let nativeCalls = 0;
    const cpu = loadCpu(entry, patched, 'darwin', {
      availableParallelism: () => {nativeCalls++; return 7;}, cpus: () => {throw new Error('fallback not expected');},
    }, () => {throw new Error('Darwin must not launch a subprocess');});
    assert.equal(cpu(), 7);
    assert.equal(cpu(), 7);
    assert.equal(nativeCalls, 2);
  });
  test(`${entry.path}: Darwin keeps native cpus fallback without child processes`, () => {
    const cpu = loadCpu(entry, patched, 'darwin', {cpus: () => Array(5)}, () => {throw new Error('unexpected subprocess');});
    assert.equal(cpu(), 5);
  });
  test(`${entry.path}: Linux minimum and cached nproc behavior match upstream`, () => {
    for (const source of [original, patched]) {
      let calls = 0;
      const cpu = loadCpu(entry, source, 'linux', {availableParallelism: () => 8}, (command, options) => {
        assert.equal(command, 'nproc'); assert.equal(options.stdio, 'pipe'); calls++;
        return Buffer.from('2\n');
      });
      assert.equal(cpu(), 2); assert.equal(cpu(), 2); assert.equal(calls, 1);
    }
  });
  test(`${entry.path}: Linux unavailable nproc fallback remains unchanged`, () => {
    for (const source of [original, patched]) {
      let calls = 0;
      const cpu = loadCpu(entry, source, 'linux', {availableParallelism: () => 8}, () => {calls++; throw new Error('not found');});
      assert.equal(cpu(), 8); assert.equal(cpu(), 8); assert.equal(calls, 2);
    }
  });
}

test('installation applies both exact files and accepts replay and mixed replay', async (t) => {
  const {applyRendererDarwinCpuPatch} = await applicator;
  const {temporary, renderer} = fixture(t);
  assert.equal(applyRendererDarwinCpuPatch(temporary).patchedFiles, 2);
  for (const entry of manifest.files) assert.equal(hash(fs.readFileSync(path.join(renderer, entry.path))), entry.after_sha256);
  assert.equal(applyRendererDarwinCpuPatch(temporary).patchedFiles, 0);
  fs.writeFileSync(path.join(renderer, manifest.files[0].path), upstream(manifest.files[0]));
  assert.equal(applyRendererDarwinCpuPatch(temporary).patchedFiles, 1);
});

test('wrong upstream version refuses before any mutation', async (t) => {
  const {applyRendererDarwinCpuPatch} = await applicator;
  const {temporary, renderer} = fixture(t);
  fs.writeFileSync(path.join(renderer, 'package.json'), JSON.stringify({name: manifest.package, version: '4.0.510'}));
  assert.throws(() => applyRendererDarwinCpuPatch(temporary), /requires.*4\.0\.509/);
  for (const entry of manifest.files) assert.equal(hash(fs.readFileSync(path.join(renderer, entry.path))), entry.before_sha256);
});

test('wrong second-module content refuses without partially patching the first', async (t) => {
  const {applyRendererDarwinCpuPatch} = await applicator;
  const {temporary, renderer} = fixture(t);
  fs.appendFileSync(path.join(renderer, manifest.files[1].path), '\n// unexpected upstream change\n');
  assert.throws(() => applyRendererDarwinCpuPatch(temporary), /Unexpected upstream content/);
  assert.equal(hash(fs.readFileSync(path.join(renderer, manifest.files[0].path))), manifest.files[0].before_sha256);
});

test('normal npm ci lifecycle wires the deterministic applicator without dependency changes', () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  assert.equal(metadata.scripts.postinstall, 'node scripts/apply-renderer-darwin-cpu-patch.mjs');
  assert.equal(metadata.dependencies['@remotion/renderer'], manifest.version);
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  assert.equal(lock.packages[''].dependencies['@remotion/renderer'], manifest.version);
});
