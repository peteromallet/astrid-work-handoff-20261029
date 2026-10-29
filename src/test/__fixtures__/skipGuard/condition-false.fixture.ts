import { expect, it } from 'vitest';
import { skipWhen } from '../../declaredSkip';
// The declared condition (Windows) is false here, so the helper must let the test run and pass.
it('posix case', (ctx) => {
  skipWhen('posix-owner-only-modes', ctx);
  expect(process.platform).not.toBe('win32');
});
