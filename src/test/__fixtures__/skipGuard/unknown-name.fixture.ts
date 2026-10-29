import { it } from 'vitest';
import { skipWhen } from '../../declaredSkip';
it('typo', (ctx) => {
  skipWhen('no-such-skip', ctx);
});
it('runs', () => {});
