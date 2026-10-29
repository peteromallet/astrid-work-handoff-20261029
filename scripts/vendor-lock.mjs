#!/usr/bin/env node
// Consumer side of the producer-manifest / vendor.lock.json design.
//   node scripts/vendor-lock.mjs check <lock> [--producer <checkout>]
//   node scripts/vendor-lock.mjs update <lock> --producer <checkout>
// Lock paths are relative to this repo's root. The pinned commit is the sole selector.
// To select a release, set source_commit to its full SHA, check out that commit,
// then run update to regenerate the version and file hashes.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const readJson = (bytes) => JSON.parse(bytes.toString('utf8'));
const fail = (message) => { console.error(message); process.exit(1); };
const git = (producer, args) => execFileSync('git', ['-C', producer, ...args], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] });
const safeRelative = (value) => typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && !value.split('/').includes('..');
const writeJson = (value) => `${JSON.stringify(value, (key, item) => (item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item), 2)}\n`;

const [command, lockArg, ...rest] = process.argv.slice(2);
const producerAt = rest.indexOf('--producer');
const producerArg = producerAt >= 0 ? rest[producerAt + 1] : null;
const hasProducer = typeof producerArg === 'string' && producerArg.length > 0 && !producerArg.startsWith('--');
const producer = hasProducer ? path.resolve(producerArg) : null;
if (!['check', 'update'].includes(command) || !lockArg || (producerAt >= 0 && !hasProducer) || (command === 'update' && !producer)) {
  fail('usage: vendor-lock.mjs check <lock> [--producer <checkout>] | update <lock> --producer <checkout>');
}

const lockPath = path.resolve(lockArg);
const lock = readJson(readFileSync(lockPath));
if (typeof lock.producer !== 'string' || typeof lock.manifest !== 'string' || !safeRelative(lock.manifest) ||
    typeof lock.source_commit !== 'string' || !/^[0-9a-f]{40}$/.test(lock.source_commit) ||
    typeof lock.producer_version !== 'string' || !lock.files || typeof lock.files !== 'object' || Array.isArray(lock.files) ||
    Object.keys(lock.files).length === 0) {
  fail(`${path.relative(ROOT, lockPath)}: invalid lock metadata`);
}
for (const [consumerPath, entry] of Object.entries(lock.files)) {
  if (!safeRelative(consumerPath) || !entry || typeof entry !== 'object' || !safeRelative(entry.from) ||
      typeof entry.sha256 !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(entry.sha256)) {
    fail(`${path.relative(ROOT, lockPath)}: invalid file entry ${consumerPath}`);
  }
}
const reVendor = `re-vendor with: node scripts/vendor-lock.mjs update ${path.relative(ROOT, lockPath)} --producer <${lock.producer} checkout>`;

let pinnedFiles = null;
if (producer) {
  let head;
  try { head = git(producer, ['rev-parse', 'HEAD']).toString('utf8').trim(); }
  catch { fail(`${producer}: not a readable git checkout`); }
  if (!/^[0-9a-f]{40}$/.test(head) || head !== lock.source_commit) {
    fail(`${lock.producer}: checkout HEAD ${head} does not match pinned source_commit ${lock.source_commit}`);
  }

  let manifest;
  try { manifest = readJson(git(producer, ['show', `${lock.source_commit}:${lock.manifest}`])); }
  catch { fail(`${lock.manifest}: missing from pinned producer commit ${lock.source_commit}`); }
  if (manifest.producer !== lock.producer) fail(`${lock.manifest}: producer ${manifest.producer} does not match lock producer ${lock.producer}`);
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) fail(`${lock.manifest}: invalid producer version`);
  if (command === 'check' && manifest.version !== lock.producer_version) fail(`${lock.manifest}: version ${manifest.version} does not match lock producer_version ${lock.producer_version}`);
  if (!manifest.artifacts || typeof manifest.artifacts !== 'object' || Array.isArray(manifest.artifacts)) fail(`${lock.manifest}: invalid artifacts map`);
  let workingManifest;
  try { workingManifest = readFileSync(path.join(producer, lock.manifest)); }
  catch { fail(`${lock.manifest}: missing from producer working tree`); }
  if (!workingManifest.equals(git(producer, ['show', `${lock.source_commit}:${lock.manifest}`]))) fail(`${lock.manifest}: producer working bytes differ from pinned commit`);

  pinnedFiles = new Map();
  const problems = [];
  for (const [consumerPath, entry] of Object.entries(lock.files)) {
    let bytes;
    try { bytes = readFileSync(path.join(producer, entry.from)); }
    catch { problems.push(`${entry.from}: missing from producer checkout`); continue; }
    const digest = sha256(bytes);
    if (!Object.hasOwn(manifest.artifacts, entry.from)) problems.push(`${entry.from}: unlisted in producer manifest`);
    else if (manifest.artifacts[entry.from] !== digest) problems.push(`${entry.from}: producer manifest hash does not match pinned bytes`);
    if (digest !== entry.sha256 && command === 'check') problems.push(`${entry.from}: pinned bytes do not match lock sha256`);
    pinnedFiles.set(consumerPath, { bytes, digest });
  }
  if (problems.length) fail(`${problems.join('\n')}\n${reVendor}`);
}

const problems = [];
for (const [consumerPath, entry] of Object.entries(lock.files)) {
  let actual;
  try { actual = sha256(readFileSync(path.join(ROOT, consumerPath))); }
  catch { problems.push(`${consumerPath}: missing`); continue; }
  if (actual !== entry.sha256) problems.push(`${consumerPath}: edited locally`);
  if (producer && actual !== pinnedFiles.get(consumerPath)?.digest) problems.push(`${consumerPath}: consumer bytes differ from pinned producer bytes`);
}
if (problems.length && command === 'check') fail(`${problems.join('\n')}\n${reVendor}`);

if (command === 'update') {
  // All producer checks complete before touching the consumer tree. Copy only bytes
  // verified against the committed manifest, then regenerate lock metadata.
  for (const [consumerPath, { bytes }] of pinnedFiles) {
    const target = path.join(ROOT, consumerPath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  const committedManifest = readJson(git(producer, ['show', `${lock.source_commit}:${lock.manifest}`]));
  lock.producer_version = committedManifest.version;
  for (const [consumerPath, { digest }] of pinnedFiles) lock.files[consumerPath].sha256 = digest;
  writeFileSync(lockPath, writeJson(lock));
  console.log(`updated ${path.relative(ROOT, lockPath)} from ${lock.producer} ${lock.source_commit.slice(0, 12)}`);
} else {
  console.log(`ok ${path.relative(ROOT, lockPath)}${producer ? ' (matches pinned producer commit)' : ''}`);
}
