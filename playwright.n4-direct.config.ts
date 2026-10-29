import { defineConfig } from '@playwright/test';
import directConfig from './playwright.direct.config.ts';

// N4_TRACE=off for the multi-gigabyte case: Playwright's tracer cannot hold its multi-gigabyte request and response bodies.
// This descriptor-bound, imported-realm acceptance stays out of the regular direct CI suite.
export default defineConfig({
  ...directConfig,
  testMatch: ['timeline-transfer.spec.ts'],
  globalSetup: './tests/e2e/local/n4-global-setup.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  expect: { timeout: 30_000 }, // the shared 5 s is too tight for a memory-starved machine; real stalls still fail well inside the test timeout
  use: { ...directConfig.use, trace: process.env.N4_TRACE === 'off' ? 'off' : directConfig.use?.trace, actionTimeout: 120_000, navigationTimeout: 120_000 },
  forbidOnly: true,
});
