import { afterEach, describe, expect, it } from 'vitest';
import { TASK_POLL_ACTIVE_MS, TASK_POLL_IDLE_MS, taskPollingCadence } from './taskPollingCadence.ts';

describe('taskPollingCadence', () => {
  afterEach(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  it('polls at the active cadence while the page is visible and the idle cadence while hidden', () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    expect(taskPollingCadence()).toBe(TASK_POLL_ACTIVE_MS);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    expect(taskPollingCadence()).toBe(TASK_POLL_IDLE_MS);
  });
});
