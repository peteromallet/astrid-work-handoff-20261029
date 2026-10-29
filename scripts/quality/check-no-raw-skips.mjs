#!/usr/bin/env node
// No invisible skips: tests never skip, focus or park themselves with raw APIs. They use the declared
// helpers (src/test/declaredSkip.ts, tests/e2e/support/declaredSkip.ts, scripts/quality/declared-skip.mjs),
// whose names must be in config/testing/skipRegistry.mjs. This gate flags any raw `.skip`, `.only`,
// `.fixme`, `.todo`, `skipIf`, `runIf`, `xit`/`xdescribe`/`xtest`, `{ skip:`/`{ todo:` option, or
// `t.skip(` in a test file.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SCAN_DIRS = ['src', 'tests', 'scripts', 'config', 'supabase', 'examples'];
const TEST_FILE = /(\.test\.|\.spec\.)[cm]?[jt]sx?$/;
const SKIP_PATTERN = /\.(?:skip|only|fixme|todo)\b|\b(?:skipIf|runIf)\b|\b(?:xit|xdescribe|xtest)\(|\{\s*(?:skip|todo)\s*:|\bt\.skip\(/;
// Files that are tests of this gate itself, or build the declared helpers, may name the patterns.
const ALLOWED = new Set(['scripts/quality/check-no-raw-skips.test.mjs']);

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '__fixtures__') return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : TEST_FILE.test(entry.name) ? [full] : [];
  });
}

/** Declared helpers are plain files too: `declaredSkip(` and `skipWhen(` are fine; raw APIs are not. */
export function checkNoRawSkips({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const problems = [];
  for (const dir of SCAN_DIRS) {
    for (const file of listFiles(path.join(repoRoot, dir))) {
      const rel = path.relative(repoRoot, file).split(path.sep).join('/');
      if (ALLOWED.has(rel)) continue;
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        const code = line
          .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''")
          .replace(/\/\/.*$/, '')
          .replace(/\bskip:\s*declaredSkip\(/g, '');
        if (SKIP_PATTERN.test(code)) problems.push(`${rel}:${index + 1}: ${line.trim()}`);
      });
    }
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const problems = checkNoRawSkips();
  if (problems.length) {
    console.error('Raw skip/only/fixme/todo in tests (use the declared helpers; see config/testing/skipRegistry.mjs):');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log('check-no-raw-skips: no raw skip, only, fixme or todo in tests.');
}
