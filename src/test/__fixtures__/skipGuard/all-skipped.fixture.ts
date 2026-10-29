import { it } from 'vitest';
import { skipWhen } from '../../declaredSkip';
// The only test skips with a declared tag: the run still fails, because no test passed.
it('harness case', (ctx) => {
  skipWhen('direct-journey-harness', ctx);
});
