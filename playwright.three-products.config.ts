import { defineConfig } from '@playwright/test';
import direct from './playwright.direct.config.ts';

// Three-product journey (F2): the hosted App build and a real Runtime with its browser door, with the real Astrid CLI as a
// second client of the same Runtime. One worker, because the door's port is shared with the direct journey: never run both at once.
// Needs an Astrid checkout (ASTRID_CHECKOUT, default ../astrid-agent) and its Python (ASTRID_PYTHON, default <checkout>/.venv/bin/python).
// Run with: npm run test:e2e:three-products
const quick = Boolean(process.env.ASTRID_QUICK_DESCRIPTOR);

export default defineConfig({
  ...direct,
  testMatch: 'three-products.spec.ts',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results/three-products',
  // Hang guard only (R-10): durations are reported, never judged. A case waits on Astrid calls as well as the page.
  // QUICK has no elapsed-time verdict or run deadline. Ordinary journeys retain their existing hang ceiling.
  timeout: quick ? 0 : 300_000,
  workers: 1,
  ...(quick ? { grep: /quick: Astrid edit then App edit/ } : { grepInvert: /quick: Astrid edit then App edit/ }),
});
