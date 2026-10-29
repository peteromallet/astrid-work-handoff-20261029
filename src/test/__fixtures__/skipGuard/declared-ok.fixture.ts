import { it } from 'vitest';
import { skipWhen } from '../../declaredSkip';
// Run with ASTRID_RUNTIME_CHECKOUT pointing nowhere, so the declared harness condition holds.
it('harness case', (ctx) => {
  skipWhen('direct-journey-harness', ctx);
});
it('runs', () => {});
