import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: '*.pwfixture.ts',
  forbidOnly: true,
  workers: 1,
  maxFailures: process.env.GUARD_MAX_FAILURES ? 1 : 0,
  reporter: [['line'], ['../../../../config/testing/playwrightSkipGuard.ts']],
});
