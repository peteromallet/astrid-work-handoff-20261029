#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { arch, platform, release } from 'node:os';
import path from 'node:path';

const CACHE_SCHEMA = 1;
const LOCK_WAIT_MS = 2 * 60 * 60 * 1_000;
const LOCK_POLL_MS = 250;

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || (result.status !== 0 && !allowFailure)) {
    throw result.error ?? new Error(result.stderr || `git ${args.join(' ')} exited ${result.status}`);
  }
  return (result.stdout ?? '').trim();
}

function cleanRepositoryState() {
  return git(['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none']) === '';
}

function inputIdentity(command) {
  if (!cleanRepositoryState()) return { cacheable: false, reason: 'modified or untracked worktree' };
  const gitDir = git(['rev-parse', '--git-path', 'codex-prepush-cache-v1']);
  const nodeVersion = process.env.ASTRID_PREPUSH_NODE_VERSION ?? process.version.slice(1);
  const npmVersion = process.env.ASTRID_PREPUSH_NPM_VERSION;
  const npmBin = process.env.ASTRID_PREPUSH_NPM_BIN;
  if (!npmVersion) throw new Error('npm version was not provided by scripts/check-before-push');
  if (!npmBin) throw new Error('npm executable was not provided by scripts/check-before-push');
  if (nodeVersion !== process.version.slice(1)) {
    throw new Error(`Node runtime mismatch: expected ${nodeVersion}, got ${process.version.slice(1)}`);
  }
  const packageLock = readFileSync('package-lock.json');
  let installedLock;
  try {
    installedLock = readFileSync('node_modules/.package-lock.json');
  } catch (error) {
    if (error?.code === 'ENOENT') return { cacheable: false, reason: 'npm installed dependency lock is missing' };
    throw error;
  }
  const pin = readFileSync('.nvmrc', 'utf8').trim();
  if (pin !== nodeVersion) throw new Error(`pinned Node version mismatch: .nvmrc=${pin}, runtime=${nodeVersion}`);
  const cacheEnvironment = Object.entries(process.env)
    .filter(([name]) => name !== 'ASTRID_PREPUSH_FORCE')
    .sort(([a], [b]) => a.localeCompare(b));
  const envDigest = hash(JSON.stringify(cacheEnvironment));
  const envFiles = readdirSync('.', { withFileTypes: true })
    .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && /^\.env(?:\.|$)/.test(entry.name))
    .map((entry) => [entry.name, hash(readFileSync(entry.name))]);
  envFiles.sort(([left], [right]) => left.localeCompare(right));
  const record = {
    schema: CACHE_SCHEMA,
    commit: git(['rev-parse', 'HEAD']),
    tree: git(['rev-parse', 'HEAD^{tree}']),
    packageLock: hash(packageLock),
    installedLock: hash(installedLock),
    envFiles,
    nodeVersion,
    npmVersion,
    nodeRuntime: realpathSync(process.execPath),
    npmExecutable: realpathSync(npmBin),
    platform: platform(),
    arch: arch(),
    osRelease: release(),
    envDigest,
    command,
  };
  return {
    cacheable: true,
    key: hash(JSON.stringify(record)),
    cacheDir: path.resolve(gitDir),
  };
}

function receiptPath(cacheDir, key, phase) {
  return path.join(cacheDir, `${key}.${phase}.json`);
}

function readReceipt(cacheDir, key, phase) {
  try {
    const receipt = JSON.parse(readFileSync(receiptPath(cacheDir, key, phase), 'utf8'));
    return receipt.schema === CACHE_SCHEMA
      && receipt.key === key
      && receipt.phase === phase
      && receipt.exitCode === 0;
  } catch {
    return false;
  }
}

function lockOwnerAlive(lockDir) {
  try {
    const owner = JSON.parse(readFileSync(path.join(lockDir, 'owner.json'), 'utf8'));
    process.kill(owner.pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'EPERM') return true;
    try {
      // A newly created lock may not have its owner file yet; give it time to
      // finish writing before treating it as abandoned.
      return Date.now() - statSync(lockDir).mtimeMs < 30_000;
    } catch {
      return false;
    }
  }
}

async function acquireLock(cacheDir, key, phase) {
  const lockDir = path.join(cacheDir, `${key}.${phase}.lock`);
  const token = randomUUID();
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      mkdirSync(lockDir, { mode: 0o700 });
      writeFileSync(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: process.pid, token }), { mode: 0o600 });
      return {
        release() {
          try {
            const owner = JSON.parse(readFileSync(path.join(lockDir, 'owner.json'), 'utf8'));
            if (owner.token === token) rmSync(lockDir, { recursive: true, force: true });
          } catch { /* the lock was already recovered */ }
        },
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
    if (!lockOwnerAlive(lockDir)) {
      const abandoned = `${lockDir}.abandoned-${randomUUID()}`;
      try {
        renameSync(lockDir, abandoned);
        rmSync(abandoned, { recursive: true, force: true });
        continue;
      } catch (error) {
        if (error?.code !== 'ENOENT' && error?.code !== 'EEXIST') throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
  }
  throw new Error(`timed out waiting for pre-push cache lock: ${phase}`);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.error) {
    console.error(`Pre-push command failed to start: ${result.error.message}`);
    return 1;
  }
  if (result.signal) {
    console.error(`Pre-push command stopped by ${result.signal}`);
    return 1;
  }
  return result.status ?? 1;
}

function writeReceipt(cacheDir, key, phase) {
  const destination = receiptPath(cacheDir, key, phase);
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify({ schema: CACHE_SCHEMA, key, phase, exitCode: 0 }) + '\n', { mode: 0o600 });
  renameSync(temporary, destination);
}

function removeReceipt(cacheDir, key, phase) {
  rmSync(receiptPath(cacheDir, key, phase), { force: true });
}

async function main() {
  const separator = process.argv.indexOf('--');
  const phaseIndex = process.argv.indexOf('--phase');
  const phase = phaseIndex >= 0 ? process.argv[phaseIndex + 1] : '';
  const command = separator >= 0 ? process.argv.slice(separator + 1) : [];
  if (!['build-context', 'app-tests', 'node-tests'].includes(phase) || command.length === 0) {
    console.error('Usage: check-before-push-cache.mjs --phase <build-context|app-tests|node-tests> -- <command> [args...]');
    return 2;
  }

  const force = process.env.ASTRID_PREPUSH_FORCE === '1';
  let identity;
  try {
    identity = inputIdentity(command);
  } catch (error) {
    console.error(`Pre-push cache unavailable; running checks fresh: ${error.message}`);
    return run(command[0], command.slice(1));
  }
  if (!identity.cacheable) {
    if (force) {
      console.log(`Pre-push ${phase}: forced fresh run; cache unavailable because ${identity.reason}.`);
      return run(command[0], command.slice(1));
    }
    console.log(`Pre-push ${phase}: cache disabled because ${identity.reason}; running fresh.`);
    return run(command[0], command.slice(1));
  }

  let lock;
  try {
    mkdirSync(identity.cacheDir, { recursive: true, mode: 0o700 });
    chmodSync(identity.cacheDir, 0o700);
    lock = await acquireLock(identity.cacheDir, identity.key, phase);
  } catch (error) {
    console.error(`Pre-push cache unavailable; running checks fresh: ${error.message}`);
    return run(command[0], command.slice(1));
  }

  try {
    // Recheck after waiting: the checkout may have changed while another
    // pre-push invocation held the phase lock.
    let current;
    try { current = inputIdentity(command); } catch { current = null; }
    if (!current?.cacheable || current.key !== identity.key) {
      console.log(`Pre-push ${phase}: source changed while waiting; running fresh without caching.`);
      return run(command[0], command.slice(1));
    }
    if (force) {
      removeReceipt(identity.cacheDir, identity.key, phase);
      console.log(`Pre-push ${phase}: forced fresh run (ASTRID_PREPUSH_FORCE=1).`);
      const status = run(command[0], command.slice(1));
      if (status !== 0) return status;
      try {
        const after = inputIdentity(command);
        if (after.cacheable && after.key === identity.key) {
          writeReceipt(identity.cacheDir, identity.key, phase);
          console.log(`Pre-push ${phase}: passing receipt saved locally.`);
        }
      } catch (error) {
        console.error(`Pre-push ${phase}: passed, but receipt was not saved: ${error.message}`);
      }
      return 0;
    }
    if (readReceipt(identity.cacheDir, identity.key, phase)) {
      console.log(`Pre-push ${phase}: reusing a passing receipt for ${identity.key.slice(0, 12)}.`);
      return 0;
    }
    console.log(`Pre-push ${phase}: running fresh for ${identity.key.slice(0, 12)}.`);
    const status = run(command[0], command.slice(1));
    if (status !== 0) return status;
    try {
      const after = inputIdentity(command);
      if (after.cacheable && after.key === identity.key) {
        writeReceipt(identity.cacheDir, identity.key, phase);
        console.log(`Pre-push ${phase}: passing receipt saved locally.`);
      } else {
        console.log(`Pre-push ${phase}: source changed during the check; result was not cached.`);
      }
    } catch (error) {
      console.error(`Pre-push ${phase}: passed, but receipt was not saved: ${error.message}`);
    }
    return 0;
  } finally {
    lock.release();
  }
}

process.exitCode = await main();
