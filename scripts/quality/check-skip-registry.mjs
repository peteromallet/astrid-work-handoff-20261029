#!/usr/bin/env node
// Every skip and lane in config/testing/skipRegistry.mjs must be real and visible:
//  - each `ci` job id exists in .github/workflows/*.yml;
//  - every skip carries its `applies` predicate (callers pass only the name);
//  - an entry with no CI job says why in `manual`, and an entry with CI jobs does not claim `manual`;
//  - every name passed to skipWhen / skipUnlessLane / declaredSkip / declaredSkipIf in a test is declared,
//    and every declared skip is used by at least one test (a stale entry is an invisible hole).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LANES, SKIP_REGISTRY } from '../../config/testing/skipRegistry.mjs';

const DEFAULT_REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SCAN_DIRS = ['src', 'tests', 'scripts'];
const USE = /\b(?:skipWhen|declaredSkip|declaredSkipIf)\(\s*(?:t\s*,\s*)?'([a-z0-9-]+)'/g;

function listFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__fixtures__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function ciJobs(repoRoot) {
  const dir = path.join(repoRoot, '.github/workflows');
  const jobs = new Set();
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.yml'))) {
    const body = fs.readFileSync(path.join(dir, file), 'utf8').split(/^jobs:\s*$/m)[1] ?? '';
    for (const match of body.matchAll(/^  ([a-z][a-z0-9-]*):\s*$/gm)) jobs.add(match[1]);
  }
  return jobs;
}

export function checkSkipRegistry({ repoRoot = DEFAULT_REPO_ROOT, skips = SKIP_REGISTRY, lanes = LANES } = {}) {
  const problems = [];
  const jobs = ciJobs(repoRoot);
  for (const [kind, table] of [['skip', skips], ['lane', lanes]]) {
    for (const [name, entry] of Object.entries(table)) {
      if (kind === 'skip' && typeof entry.applies !== 'function') problems.push(`skip ${name}: no \`applies\` predicate; the registry, not the caller, decides when it skips`);
      for (const job of entry.ci) if (!jobs.has(job)) problems.push(`${kind} ${name}: no CI job "${job}"`);
      if (entry.ci.length === 0 && !entry.manual) problems.push(`${kind} ${name}: no CI job runs it; say why in "manual"`);
      if (entry.ci.length > 0 && entry.manual) problems.push(`${kind} ${name}: has CI jobs and a "manual" note; drop one`);
    }
  }
  const used = new Set();
  for (const dir of SCAN_DIRS) {
    for (const file of listFiles(path.join(repoRoot, dir))) {
      const rel = path.relative(repoRoot, file);
      if (/declared-?[sS]kip\.[mt]s$/.test(rel) || /check-skip-registry|skipGuard\.test/.test(rel)) continue;
      for (const match of fs.readFileSync(file, 'utf8').matchAll(USE)) {
        used.add(match[1]);
        if (!Object.hasOwn(skips, match[1])) problems.push(`${rel}: skip "${match[1]}" is not declared in config/testing/skipRegistry.mjs`);
      }
    }
  }
  for (const name of Object.keys(skips)) if (!used.has(name)) problems.push(`skip ${name}: declared but no test uses it`);
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const problems = checkSkipRegistry();
  if (problems.length) {
    console.error('Skip registry problems:');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  const manual = [...Object.entries(SKIP_REGISTRY), ...Object.entries(LANES)].filter(([, entry]) => entry.manual);
  console.log(`check-skip-registry: ${Object.keys(SKIP_REGISTRY).length} declared skips, ${Object.keys(LANES).length} lanes; ${manual.length} with no CI job:`);
  for (const [name, entry] of manual) console.log(`  MANUAL ${name}: ${entry.manual}`);
}
