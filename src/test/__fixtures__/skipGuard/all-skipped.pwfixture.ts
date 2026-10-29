import { test } from '@playwright/test';
import { skipWhen } from '../../../../tests/e2e/support/declaredSkip';
// The only test skips with a declared tag: the run still fails, because no test passed.
test('lane case', async () => {
  skipWhen('direct-journey-harness');
});
