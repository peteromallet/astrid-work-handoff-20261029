import { it } from 'node:test';
import { declaredSkip } from '../../../../scripts/quality/declared-skip.mjs';
// Run with ASTRID_RUNTIME_CHECKOUT pointing nowhere, so the declared harness condition holds.
it('harness case', { skip: declaredSkip('direct-journey-harness') }, () => {});
it('runs', () => {});
