import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./remotion-4.0.509-audio-resume.mjs', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REMOTION_SOURCE_ROOT = process.env.REMOTION_SOURCE_ROOT ?? join(REPO_ROOT, 'node_modules', 'remotion');
const VERSION = '4.0.509';
const TARGETS = [
  {
    relativePath: 'dist/cjs/audio/shared-audio-tags.js',
    originalSha256: '471b33916a91f5b9529c477bdf0ec586cb700d5a7179ab910a82dd932e172f6c',
    patchedSha256: '949ccec3419398183e8e22f63820a4a57cb8379befb184fbac9a3acde040c5b8',
  },
  {
    relativePath: 'dist/esm/index.mjs',
    originalSha256: '9fdfe58f3f34e6a72564a811ac5d374d1c97a0f535e2a0e3aac198670d9b7ff8',
    patchedSha256: '5a1584f7660fa8fffa7eb8fe016b82a4d719e67d4b7904d4fa4f299eb1355f28',
  },
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function run(action, root) {
  return spawnSync(process.execPath, [SCRIPT, action, '--root', root], {
    encoding: 'utf8',
  });
}

function assertSuccess(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'remotion-audio-resume-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packageRoot = join(root, 'node_modules', 'remotion');
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'remotion', version: VERSION }),
  );

  // Copy only the two target files. Revert in this isolated fixture so tests
  // always begin with exact pristine bytes, even after the installed package
  // has been patched by its single owner.
  for (const target of TARGETS) {
    const source = join(REMOTION_SOURCE_ROOT, target.relativePath);
    const destination = join(packageRoot, target.relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  assertSuccess(run('--revert', root));
  for (const target of TARGETS) {
    assert.equal(
      sha256(await readFile(join(packageRoot, target.relativePath))),
      target.originalSha256,
      `${target.relativePath} fixture must start with exact pristine bytes`,
    );
  }
  return { root, packageRoot };
}

test('two-file fixture: check is readonly; apply is exact/idempotent; revert restores pristine bytes', async (t) => {
  const { root, packageRoot } = await fixture(t);
  const paths = TARGETS.map((target) => join(packageRoot, target.relativePath));
  const pristineBytes = await Promise.all(paths.map((path) => readFile(path)));

  assertSuccess(run('--check', root));
  assert.deepEqual(await Promise.all(paths.map((path) => readFile(path))), pristineBytes);

  assertSuccess(run('--apply', root));
  for (let index = 0; index < paths.length; index += 1) {
    assert.equal(sha256(await readFile(paths[index])), TARGETS[index].patchedSha256);
  }

  const beforeIdempotentApply = await Promise.all(paths.map((path) => stat(path)));
  assertSuccess(run('--apply', root));
  const afterIdempotentApply = await Promise.all(paths.map((path) => stat(path)));
  assert.deepEqual(
    afterIdempotentApply.map(({ ino }) => ino),
    beforeIdempotentApply.map(({ ino }) => ino),
    'idempotent apply must not rewrite already-patched files',
  );

  assertSuccess(run('--check', root));
  assertSuccess(run('--revert', root));
  assert.deepEqual(await Promise.all(paths.map((path) => readFile(path))), pristineBytes);
});

test('unknown content refuses before either target is written', async (t) => {
  const { root, packageRoot } = await fixture(t);
  const firstPath = join(packageRoot, TARGETS[0].relativePath);
  const secondPath = join(packageRoot, TARGETS[1].relativePath);
  const firstBefore = await readFile(firstPath);
  const secondBefore = Buffer.concat([
    await readFile(secondPath),
    Buffer.from('\n// unknown fixture content\n'),
  ]);
  await writeFile(secondPath, secondBefore);

  const result = run('--apply', root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown content/i);
  assert.deepEqual(await readFile(firstPath), firstBefore);
  assert.deepEqual(await readFile(secondPath), secondBefore);
});

test('unknown version refuses before either target is written', async (t) => {
  const { root, packageRoot } = await fixture(t);
  const packageJsonPath = join(packageRoot, 'package.json');
  const paths = TARGETS.map((target) => join(packageRoot, target.relativePath));
  const before = await Promise.all(paths.map((path) => readFile(path)));
  await writeFile(packageJsonPath, JSON.stringify({ name: 'remotion', version: '4.0.504' }));

  const result = run('--apply', root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /expected remotion@4\.0\.509/i);
  assert.deepEqual(await Promise.all(paths.map((path) => readFile(path))), before);
});
