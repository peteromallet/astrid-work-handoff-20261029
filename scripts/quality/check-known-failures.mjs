#!/usr/bin/env node
// No test may be marked as an expected failure.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_REPO_ROOT = path.resolve(import.meta.dirname, '../..');
export const MAX_SRC_ENTRIES = 0;
const MARKER_RE = /\b(?:it|test)\.fails?\b/;

function listFiles(dir, namePattern) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, namePattern);
    return namePattern.test(entry.name) ? [full] : [];
  });
}

function scanFile(file, repoRoot) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const rel = path.relative(repoRoot, file).split(path.sep).join('/');
  return lines.flatMap((line, index) => {
    if (!MARKER_RE.test(line)) return [];
    const where = `${rel}:${index + 1}`;
    return [{ where, status: 'FORBIDDEN', detail: 'expected-failure marker' }];
  });
}

/**
 * Runs the gate over one repo tree. Returns the entries, the problems (each one fails the gate),
 * and the per-spec counts, so callers can print or assert on them.
 */
export function checkKnownFailures({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const entries = [];
  const problems = [];

  const srcEntries = listFiles(path.join(repoRoot, 'src'), /\.test\.tsx?$/)
    .flatMap((file) => scanFile(file, repoRoot));
  entries.push(...srcEntries);

  for (const file of listFiles(path.join(repoRoot, 'tests'), /\.spec\.ts$/)) {
    const found = scanFile(file, repoRoot);
    entries.push(...found);
  }

  for (const entry of entries) problems.push(`${entry.where}: expected-failure markers are forbidden`);
  return { entries, problems, srcCount: srcEntries.length };
}

function main() {
  const result = checkKnownFailures();
  for (const entry of result.entries) {
    console.log(`${entry.where} | ${entry.detail}`);
  }
  console.log(`expected-failure markers: ${result.entries.length} (maximum ${MAX_SRC_ENTRIES})`);
  for (const problem of result.problems) console.error(`FAIL ${problem}`);
  process.exit(result.problems.length > 0 ? 1 : 0);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
