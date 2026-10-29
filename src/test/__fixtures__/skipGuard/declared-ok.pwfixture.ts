import { test } from '@playwright/test';
import { skipWhen } from '../../../../tests/e2e/support/declaredSkip';
// Run with ASTRID_RUNTIME_CHECKOUT pointing nowhere, so the declared harness condition holds.
test('lane case', async () => {
  skipWhen('direct-journey-harness');
});
test('runs', async () => {});
