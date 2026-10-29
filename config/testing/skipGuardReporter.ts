import type { Reporter, TestModule } from 'vitest/node';
import { classifySkips, formatSkipReport } from './skipRegistry.mjs';

/**
 * Fails the run on any skipped, todo or .skip'd test whose skip is not declared in skipRegistry.mjs,
 * and prints every skip by test name. A run where no test passed fails too: all-skipped is never green. Declared skips arrive through `skipWhen`, which calls ctx.skip(note).
 */
export default class SkipGuardReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const entries: Array<{ name: string; reason: string }> = [];
    let passed = 0;
    for (const module of testModules) {
      for (const _ of module.children.allTests('passed')) passed += 1;
      for (const test of module.children.allTests('skipped')) {
        const result = test.result();
        entries.push({
          name: `${module.moduleId.replace(`${process.cwd()}/`, '')} > ${test.fullName}`,
          reason: result.state === 'skipped' ? (result.note ?? '') : '',
        });
      }
    }
    if (passed === 0) {
      console.error('\nNo test passed in this run: a run where everything was skipped, todo or failed is not a green run.');
      process.exitCode = 1;
    }
    if (!entries.length) return;
    const report = classifySkips(entries);
    console.log(`\n${formatSkipReport(report)}`);
    if (report.undeclared.length) {
      console.error(`\n${report.undeclared.length} undeclared skip(s): declare each in config/testing/skipRegistry.mjs and use skipWhen, or remove it.`);
      process.exitCode = 1;
    }
  }
}
