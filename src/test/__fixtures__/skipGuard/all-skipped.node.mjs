import { it } from 'node:test';
import { declaredSkip } from '../../../../scripts/quality/declared-skip.mjs';
// The only test skips with a declared tag: the run still fails, because no test passed.
it('harness case', { skip: declaredSkip('direct-journey-harness') }, () => {});
