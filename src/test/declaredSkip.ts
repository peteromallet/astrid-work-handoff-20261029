import { declaredTag, skipReason } from '../../config/testing/skipRegistry.mjs';

/**
 * The only way a vitest test skips. Call it first in the test body with the test context:
 *   it('...', (ctx) => { skipWhen('posix-owner-only-modes', ctx); ... })
 * `name` must be declared in config/testing/skipRegistry.mjs, whose entry carries the predicate that decides the
 * skip: the caller passes no condition of its own. The run reports the skip by test name and
 * config/testing/skipGuardReporter.ts fails the run on any skip that is not declared.
 */
export function skipWhen(name: string, ctx: { skip: (note?: string) => never }): void {
  const why = skipReason(name);
  if (why !== null) ctx.skip(`${declaredTag(name)} (${why})`);
}
