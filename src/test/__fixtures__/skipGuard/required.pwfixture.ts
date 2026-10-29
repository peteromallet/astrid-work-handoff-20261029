import { test } from '@playwright/test';
import { skipWhen } from '../../../../tests/e2e/support/declaredSkip';
test('lane case', async () => {
  skipWhen('direct-journey-harness');
});
test('runs', async () => {});
