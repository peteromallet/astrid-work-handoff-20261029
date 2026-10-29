import { describe, expect, it } from 'vitest';
import {
  getDebugGlobal,
  getDebugGlobalOwner,
  registerDebugGlobal,
} from '@/shared/runtime/debugRegistry';

describe('debugRegistry', () => {
  it('registers a debug global and exposes owner metadata', () => {
    const value = { id: 'freshness' };
    const dispose = registerDebugGlobal(
      '__DATA_FRESHNESS_MANAGER__',
      value as unknown as Window['__DATA_FRESHNESS_MANAGER__'],
      'test-owner',
    );

    expect(getDebugGlobal('__DATA_FRESHNESS_MANAGER__')).toBe(value);
    expect(getDebugGlobalOwner('__DATA_FRESHNESS_MANAGER__')).toBe('test-owner');

    dispose();
  });

  it('restores previous value on dispose', () => {
    const previous = { name: 'previous' };
    const next = { name: 'next' };

    const initialDispose = registerDebugGlobal(
      '__DATA_FRESHNESS_MANAGER__',
      previous as unknown as Window['__DATA_FRESHNESS_MANAGER__'],
      'first-owner',
    );
    const dispose = registerDebugGlobal(
      '__DATA_FRESHNESS_MANAGER__',
      next as unknown as Window['__DATA_FRESHNESS_MANAGER__'],
      'second-owner',
    );

    expect(getDebugGlobal('__DATA_FRESHNESS_MANAGER__')).toBe(next);

    dispose();

    expect(getDebugGlobal('__DATA_FRESHNESS_MANAGER__')).toBe(previous);
    expect(getDebugGlobalOwner('__DATA_FRESHNESS_MANAGER__')).toBe('first-owner');

    initialDispose();
  });
});
