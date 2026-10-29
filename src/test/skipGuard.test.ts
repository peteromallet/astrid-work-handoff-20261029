import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifySkips, declaredTag, skipReason, SKIP_REGISTRY } from '../../config/testing/skipRegistry.mjs';
import { isSymlinkPermissionError, symlinkCreationRefused } from '../../config/testing/skipConditions.mjs';
import { checkNoRawSkips } from '../../scripts/quality/check-no-raw-skips.mjs';
import { checkSkipRegistry } from '../../scripts/quality/check-skip-registry.mjs';

const ROOT = path.resolve(__dirname, '../..');
const FIXTURES = path.join(ROOT, 'src/test/__fixtures__/skipGuard');

/** Runs a command; returns its exit code and output instead of throwing. */
function run(command: string, args: string[], env: Record<string, string> = {}) {
  try {
    const stdout = execFileSync(command, args, { cwd: ROOT, env: { ...process.env, ...env, CI: '' }, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out: stdout };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { code: failure.status, out: `${failure.stdout}${failure.stderr}` };
  }
}
// The fixtures that need a skip point the Runtime checkout nowhere, so the declared harness condition holds on any machine.
const NO_RUNTIME = { ASTRID_RUNTIME_CHECKOUT: path.join(tmpdir(), 'no-such-runtime-checkout') };
const vitest = (file: string, env: Record<string, string> = {}) => run(path.join(ROOT, 'node_modules/.bin/vitest'), ['run', '--config', path.join(FIXTURES, 'vitest.config.ts'), file], env);
const playwright = (file: string, env: Record<string, string> = {}) => run(path.join(ROOT, 'node_modules/.bin/playwright'), ['test', '--config', path.join(FIXTURES, 'playwright.config.ts'), file], env);

describe('the skip registry', () => {
  it('splits declared from undeclared skips', () => {
    const { declared, undeclared } = classifySkips([
      { name: 'a', reason: declaredTag('posix-owner-only-modes') },
      { name: 'b', reason: '' },
      { name: 'c', reason: '[declared:made-up] hello' },
      { name: 'd', reason: 'some free text' },
    ]);
    expect(declared.map((entry) => entry.name)).toEqual(['a']);
    expect(undeclared.map((entry) => entry.name)).toEqual(['b', 'c', 'd']);
  });

  it('refuses an unknown name', () => {
    expect(() => declaredTag('made-up')).toThrow(/not declared/);
    expect(() => skipReason('made-up')).toThrow(/not declared/);
  });

  it('gives every entry its own predicate, which the helpers evaluate', () => {
    for (const [name, entry] of Object.entries(SKIP_REGISTRY)) expect(typeof entry.applies, name).toBe('function');
    const original = SKIP_REGISTRY['posix-owner-only-modes'].applies;
    try {
      SKIP_REGISTRY['posix-owner-only-modes'].applies = () => 'forced for this test';
      expect(skipReason('posix-owner-only-modes')).toBe('forced for this test');
      SKIP_REGISTRY['posix-owner-only-modes'].applies = () => false;
      expect(skipReason('posix-owner-only-modes')).toBeNull();
    } finally {
      SKIP_REGISTRY['posix-owner-only-modes'].applies = original;
    }
  });

  it('only a symlink permission error is a skip; the probe never swallows another error', () => {
    expect(isSymlinkPermissionError(Object.assign(new Error('x'), { code: 'EPERM', syscall: 'symlink' }))).toBe(true);
    expect(isSymlinkPermissionError(Object.assign(new Error('x'), { code: 'EACCES', syscall: 'symlink' }))).toBe(true);
    expect(isSymlinkPermissionError(Object.assign(new Error('x'), { code: 'ENOENT', syscall: 'symlink' }))).toBe(false);
    expect(isSymlinkPermissionError(Object.assign(new Error('x'), { code: 'EPERM', syscall: 'open' }))).toBe(false);
    expect(isSymlinkPermissionError(new Error('boom'))).toBe(false);
    // Where symlinks are allowed (CI, macOS, Linux) the declared condition is false, so the test runs.
    expect(typeof symlinkCreationRefused()).toBe('boolean');
  });

  it('is consistent with the workflows and the tests that use it', () => {
    expect(checkSkipRegistry()).toEqual([]);
  });

  it('reports a missing CI job, a missing manual note and a stale entry', () => {
    const problems = checkSkipRegistry({
      skips: { ...SKIP_REGISTRY, ghost: { skipWhen: 'x', reason: 'x', applies: () => false, ci: ['no-such-job'] }, orphan: { skipWhen: 'x', reason: 'x', applies: () => false, ci: [] }, bare: { skipWhen: 'x', reason: 'x', ci: ['vitest'] } as never },
      lanes: {},
    });
    expect(problems).toEqual(expect.arrayContaining([
      'skip ghost: no CI job "no-such-job"',
      'skip orphan: no CI job runs it; say why in "manual"',
      'skip ghost: declared but no test uses it',
      expect.stringContaining('skip bare: no `applies` predicate'),
    ]));
  });
});

describe('check-no-raw-skips', () => {
  it('passes on this repo', () => {
    expect(checkNoRawSkips()).toEqual([]);
  });

  it('flags every raw skip form', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'raw-skips-'));
    try {
      mkdirSync(path.join(root, 'src'));
      const lines = [
        "it.skip('a', () => {});", "describe.skip('b', () => {});", "test.fixme('c', () => {});", "it.only('d', () => {});",
        "it.skipIf(cond)('e', () => {});", "it.todo('f');", "xit('g', () => {});", "it('h', { skip: true }, () => {});", "t.skip('i');",
        "it('mentions .skip only in a string', () => {});", "it('ok', { skip: declaredSkip('x', c) }, () => {});",
      ];
      writeFileSync(path.join(root, 'src/a.test.ts'), lines.join('\n'));
      const flagged = checkNoRawSkips({ repoRoot: root }).map((problem) => Number(problem.split(':')[1]));
      expect(flagged).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('vitest guard', () => {
  it('fails the run on an undeclared it.skip and lists it by name', () => {
    const result = vitest('bare-skip.fixture.ts');
    expect(result.code).not.toBe(0);
    expect(result.out).toMatch(/UNDECLARED SKIP .*bare-skip\.fixture\.ts > parked test/);
  });

  it('fails the run on it.todo', () => {
    const result = vitest('todo.fixture.ts');
    expect(result.code).not.toBe(0);
    expect(result.out).toMatch(/UNDECLARED SKIP .*todo\.fixture\.ts > someday/);
  });

  it('fails the run on a skip with an unregistered name', () => {
    const result = vitest('unknown-name.fixture.ts');
    expect(result.code).not.toBe(0);
    expect(result.out).toMatch(/not declared in config\/testing\/skipRegistry\.mjs/);
  });

  it('passes a declared skip and reports it by name', () => {
    const result = vitest('declared-ok.fixture.ts', NO_RUNTIME);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/SKIP .*declared-ok\.fixture\.ts > harness case: \[declared:direct-journey-harness\]/);
  });

  it('runs a test whose declared condition is false', () => {
    const result = vitest('condition-false.fixture.ts');
    expect(result.code).toBe(0);
    expect(result.out).not.toMatch(/SKIP /);
  });

  it('fails a run in which no test passed, even when every skip is declared', () => {
    const result = vitest('all-skipped.fixture.ts', NO_RUNTIME);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('No test passed in this run');
  });

  it('fails the run on .only', () => {
    expect(vitest('only.fixture.ts').code).not.toBe(0);
  });
});

describe('Playwright guard', () => {
  it('fails the run on an undeclared test.skip', () => {
    const result = playwright('bare-skip.pwfixture.ts');
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('UNDECLARED SKIP');
    expect(result.out).toContain('flaky today');
  });

  it('fails the run on test.fixme', () => {
    const result = playwright('fixme.pwfixture.ts');
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('UNDECLARED SKIP');
  });

  it('passes a declared skip and reports it by name', () => {
    const result = playwright('declared-ok.pwfixture.ts', NO_RUNTIME);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/SKIP .*lane case: \[declared:direct-journey-harness\]/);
  });

  it('fails a run in which no test passed, even when every skip is declared', () => {
    const result = playwright('all-skipped.pwfixture.ts', NO_RUNTIME);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('No test passed in this run');
  });

  it('names tests not run because an earlier serial test failed', () => {
    const result = playwright('serial.pwfixture.ts');
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('2 test(s) NOT RUN');
    expect(result.out).toMatch(/NOT RUN .*second is not run \(skipped with no reason/);
    expect(result.out).toMatch(/NOT RUN .*third is not run/);
  });

  it('names tests that never started because the run stopped at maxFailures', () => {
    const result = playwright('maxfail.pwfixture.ts', { GUARD_MAX_FAILURES: '1' });
    expect(result.code).not.toBe(0);
    expect(result.out).toMatch(/NOT RUN .*never started \(never ran: the run stopped early\)/);
  });

  it('fails instead of skipping in a job that provides the lane', () => {
    const result = playwright('required.pwfixture.ts', { ...NO_RUNTIME, ASTRID_REQUIRE_LANES: 'direct-journey' });
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('required in this lane but unavailable');
  });
});

describe('node:test guard', () => {
  const nodeTest = (file: string, env: Record<string, string> = {}) => run(process.execPath, ['--test', '--test-reporter=./scripts/quality/node-skip-guard-reporter.mjs', path.join(FIXTURES, file)], env);

  it('fails the run on an undeclared skip', () => {
    const result = nodeTest('undeclared.node.mjs');
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('UNDECLARED SKIP');
  });

  it('passes a declared skip and reports it by name', () => {
    const result = nodeTest('declared.node.mjs', NO_RUNTIME);
    expect(result.code).toBe(0);
    expect(result.out).toContain('[declared:direct-journey-harness]');
  });

  it('fails a run in which no test passed, even when every skip is declared', () => {
    const result = nodeTest('all-skipped.node.mjs', NO_RUNTIME);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('No test passed in this run');
  });
});
