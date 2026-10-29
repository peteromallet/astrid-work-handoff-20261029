// The only way a node:test test skips. `{ skip: declaredSkip('macos-lockf-broker') }` or, inside a test,
// `if (declaredSkipIf(t, 'symlink-creation-permitted')) return;`. `name` must be declared in
// config/testing/skipRegistry.mjs, whose entry carries the predicate that decides the skip (callers pass no condition
// of their own); scripts/quality/node-skip-guard-reporter.mjs fails the run on any other skip.
import { declaredTag, skipReason } from '../../config/testing/skipRegistry.mjs';

/** The `skip` option value: the tagged reason when the declared condition holds, else false. */
export function declaredSkip(name) {
  const why = skipReason(name);
  return why === null ? false : `${declaredTag(name)} (${why})`;
}

/** Skips the running test `t` with the tagged reason when the declared condition holds; returns whether it skipped. */
export function declaredSkipIf(t, name) {
  const skip = declaredSkip(name);
  if (!skip) return false;
  t.skip(skip);
  return true;
}
