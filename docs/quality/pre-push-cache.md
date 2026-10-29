# Local pre-push checks

The Git pre-push hook runs the build-context guard, `npm run test:app`, and
`npm run test:node` with the exact Node version pinned in `.nvmrc` and the npm
bundled beside that Node install. The normal `npm test` command still runs the
app and Node suites in that order. The hook canonicalizes `TMPDIR` before either
suite so temporary paths have one stable spelling on macOS.

Passing results are cached per phase under Git's local metadata directory. A
receipt is reusable only for the same clean commit/tree, Node and npm binaries
and versions, platform, source lockfile, installed npm lockfile, root `.env*`
files, exact phase command, and process environment. The cache stores only the identity
digest, phase name, and successful exit status; it does not store test output,
environment values, or credentials. Modified or untracked files, or a missing
installed npm lockfile, disable both cache reads and writes. Failed checks never
create receipts. Each phase uses a separate receipt. If the Node-test phase
fails after app tests passed, the retry reuses the app-test receipt and reruns
the Node tests. A forced run removes that phase's old receipt first, then writes
a replacement only if the forced run passes.

Set `ASTRID_PREPUSH_FORCE=1` to rerun every check and bypass cached receipts.
The cache only skips checks invoked through `scripts/check-before-push`; running
`npm test` directly always executes the suite.

Release provenance inspections reuse immutable Git objects only within one
inspection. Mutable worktree/index state and every history edge are still
checked, with subprocess containment unchanged. The representative acceptance
case dropped from 19 to 12 bounded Git calls (47.03 to 27.45 seconds on the same
machine). Broker-death tests select the broker owned by their own process so
parallel test runs cannot kill each other's brokers.
