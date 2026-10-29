import { test } from '@playwright/test';
import { declaredTag, laneIsRequired, skipReason } from '../../../config/testing/skipRegistry.mjs';

/**
 * The only way a Playwright test skips. Call it inside a test or hook:
 *   skipWhen('direct-journey-ffmpeg');
 * `name` must be declared in config/testing/skipRegistry.mjs, whose entry carries the predicate that decides the
 * skip; the caller passes no condition of its own. In a CI job that provides the lane (ASTRID_REQUIRE_LANES
 * contains the registry entry's requireInLane) the unmet condition FAILS the test instead of skipping it.
 * config/testing/playwrightSkipGuard.ts reports every skip by name and fails the run on any undeclared skip.
 */
export function skipWhen(name: string): void {
  const why = skipReason(name);
  if (why === null) return;
  const message = `${declaredTag(name)} (${why})`;
  if (laneIsRequired(name)) throw new Error(`required in this lane but unavailable: ${message}`);
  test.skip(true, message);
}
