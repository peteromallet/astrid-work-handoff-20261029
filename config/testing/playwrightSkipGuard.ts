import type { FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { classifySkips, formatSkipReport } from './skipRegistry.mjs';

/**
 * Prints every skipped test by name and fails the run on:
 *  - any skip, fixme or expected-failure marker whose reason is not declared in skipRegistry.mjs
 *    (declared skips come from tests/e2e/support/declaredSkip.ts);
 *  - a run in which no test passed (all skipped is never green);
 *  - any test that was NOT RUN because an earlier test failed: in a serial describe Playwright reports the
 *    rest as "skipped" with no reason, and with maxFailures or an interrupt it never reports them at all.
 *    Both are named here and count as a failure of the run, never as a quiet skip.
 */
export default class PlaywrightSkipGuard implements Reporter {
  private readonly entries: Array<{ name: string; reason: string }> = [];
  private readonly notRun: string[] = [];
  private readonly ended = new Set<string>();
  private all: TestCase[] = [];
  private passed = 0;

  printsToStdio(): boolean {
    return false;
  }

  onBegin(_config: unknown, suite: Suite): void {
    this.all = suite.allTests();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.ended.add(test.id);
    if (result.status === 'passed') this.passed += 1;
    const name = test.titlePath().filter(Boolean).join(' > ');
    const marker = test.annotations.find((annotation) => annotation.type === 'skip' || annotation.type === 'fixme');
    if (marker) this.entries.push({ name, reason: marker.description ?? '' });
    else if (result.status === 'skipped') this.notRun.push(`${name} (skipped with no reason: an earlier serial test failed)`);
  }

  async onEnd(): Promise<{ status: FullResult['status'] } | undefined> {
    for (const test of this.all) {
      if (this.ended.has(test.id)) continue;
      if (test.expectedStatus === 'skipped' || test.annotations.some((a) => a.type === 'skip' || a.type === 'fixme')) {
        this.entries.push({ name: test.titlePath().filter(Boolean).join(' > '), reason: test.annotations.find((a) => a.type === 'skip' || a.type === 'fixme')?.description ?? '' });
      } else {
        this.notRun.push(`${test.titlePath().filter(Boolean).join(' > ')} (never ran: the run stopped early)`);
      }
    }
    const report = classifySkips(this.entries);
    const text = formatSkipReport(report);
    if (text) console.log(`\n${text}`);
    if (this.notRun.length) {
      console.error(`\n${this.notRun.length} test(s) NOT RUN:`);
      for (const line of this.notRun) console.error(`  NOT RUN ${line}`);
    }
    const nonePassed = this.passed === 0 && this.all.length > 0;
    if (nonePassed) console.error('\nNo test passed in this run: a run where everything was skipped or failed is not a green run.');
    if (report.undeclared.length || this.notRun.length || nonePassed) {
      console.error('\nDeclare each skip in config/testing/skipRegistry.mjs and use tests/e2e/support/declaredSkip.ts; fix the earlier failure for NOT RUN tests.');
      return { status: 'failed' };
    }
    return undefined;
  }
}
