import { describe, expect, it } from 'vitest';
import { resolveHostedRuntimeOrigin } from '../../../scripts/hosted-build-origin.mjs';

describe('hosted build Runtime origin', () => {
  it('keeps production builds on the default door port', () => {
    expect(resolveHostedRuntimeOrigin({})).toBe('http://127.0.0.1:17340');
  });

  it('uses the direct journey door port override', () => {
    expect(resolveHostedRuntimeOrigin({ ASTRID_APP_DIRECT_DOOR_PORT: '17341' })).toBe('http://127.0.0.1:17341');
  });

  it('rejects invalid door port overrides', () => {
    expect(() => resolveHostedRuntimeOrigin({ ASTRID_APP_DIRECT_DOOR_PORT: '0' })).toThrow(/valid TCP port/);
  });
});
