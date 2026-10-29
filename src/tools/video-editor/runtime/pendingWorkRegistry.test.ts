import { describe, expect, it, vi } from 'vitest';
import { createPendingWorkRegistry } from './pendingWorkRegistry.ts';

describe('pending work registry', () => {
  it('combines extension reports and clears disposed work', () => {
    const registry = createPendingWorkRegistry();
    const listener = vi.fn();
    const stop = registry.subscribe(listener);
    registry.report('one', { writing: true, unsaved: false });
    registry.report('two', { writing: false, unsaved: true });
    expect(registry.snapshot()).toEqual({ writing: true, unsaved: true });
    registry.clear('one');
    expect(registry.snapshot()).toEqual({ writing: false, unsaved: true });
    stop();
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
