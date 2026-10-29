/**
 * builtInExtensionEnablement — unit tests for the stable external store:
 * stable snapshot identity, notification-free no-op writes, corrupt-storage
 * recovery, and browser storage-event synchronization.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeAppStateApi } from '@/test/settingsStoreHarness';

const DISABLED_KEY = 'astrid.dev-extensions.disabled';
/** The Runtime app-state record that holds the disabled list (`extensions.disabled`). */
const RUNTIME_RECORD = 'ui.extensions';

// Each test gets a fresh module instance (cache + listeners) so snapshot
// identity and notification counts are fully isolated.
let store: typeof import('./builtInExtensionEnablement');
let settings: typeof import('@/shared/settings/instance');
let fake: FakeAppStateApi;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  store = await import('./builtInExtensionEnablement');
  // Imported after the reset so it shares this test's module instances.
  const harness = await import('@/test/settingsStoreHarness');
  settings = await import('@/shared/settings/instance');
  ({ fake } = harness.installTestSettingsStore());
});

const flush = () => settings.getSettingsStore().flush();
const refresh = () => settings.getSettingsStore().refresh();

afterEach(() => {
  vi.unstubAllGlobals();
});

function dispatchStorageEvent(init: StorageEventInit): void {
  window.dispatchEvent(new StorageEvent('storage', init));
}

describe('getSnapshot', () => {
  it('returns the same identity for repeated unchanged reads', () => {
    const first = store.getSnapshot();
    expect(first).toBe(store.getSnapshot());
    expect(first).toBe(store.getSnapshot());
    expect(first).toBe(store.getSnapshot());
  });

  it('returns a new identity once the underlying storage changes', () => {
    const before = store.getSnapshot();
    store.setBuiltInExtensionEnabled('ext-a', false);
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
    expect([...after]).toEqual(['ext-a']);
  });

  it('stays identity-stable when an external write repeats the same value', () => {
    localStorage.setItem(DISABLED_KEY, '["ext-a"]');
    const first = store.getSnapshot();
    localStorage.setItem(DISABLED_KEY, '["ext-a"]');
    expect(store.getSnapshot()).toBe(first);
  });

  it('exposes the disabled set as readonly to callers', () => {
    localStorage.setItem(DISABLED_KEY, '["ext-a"]');
    const snapshot = store.getSnapshot();
    expect(snapshot.has('ext-a')).toBe(true);
    expect(snapshot.size).toBe(1);
  });
});

describe('no-op writes', () => {
  it('sends zero notifications and persists nothing when the state is unchanged', () => {
    localStorage.setItem(DISABLED_KEY, '["ext-a"]');
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    // Disabling an already-disabled extension and enabling an
    // already-enabled extension are both no-ops.
    store.setBuiltInExtensionEnabled('ext-a', false);
    store.setBuiltInExtensionEnabled('ext-b', true);

    expect(listener).not.toHaveBeenCalled();
    expect(localStorage.getItem(DISABLED_KEY)).toBe('["ext-a"]');
    unsubscribe();
  });

  it('notifies exactly once and saves the list to the Runtime for a real toggle', async () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setBuiltInExtensionEnabled('ext-a', false);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().has('ext-a')).toBe(true);
    await flush();
    expect(fake.record(RUNTIME_RECORD).content).toEqual({ disabled: ['ext-a'] });
    unsubscribe();
  });
});

describe('corrupt storage', () => {
  it('recovers to a valid empty snapshot without throwing', () => {
    localStorage.setItem(DISABLED_KEY, '{not-json');
    const snapshot = store.getSnapshot();
    expect(snapshot).toBeInstanceOf(Set);
    expect(snapshot.size).toBe(0);
    expect(store.getSnapshot().size).toBe(0);
  });

  it('treats non-array JSON as an empty snapshot', () => {
    localStorage.setItem(DISABLED_KEY, '{"a":1}');
    expect(store.getSnapshot().size).toBe(0);
  });

  it('filters non-string ids out of a valid array', () => {
    localStorage.setItem(DISABLED_KEY, '["a", 5, null, "b"]');
    expect([...store.getSnapshot()]).toEqual(['a', 'b']);
  });

  it('keeps the recovered empty snapshot identity stable', () => {
    localStorage.setItem(DISABLED_KEY, '{broken');
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    expect(store.getSnapshot()).toBe(first);
  });

  it('heals corrupt storage on the next real toggle', async () => {
    localStorage.setItem(DISABLED_KEY, '{broken');
    expect(store.getSnapshot().size).toBe(0);

    store.setBuiltInExtensionEnabled('ext-a', false);

    expect(store.getSnapshot().has('ext-a')).toBe(true);
    await flush();
    expect(fake.record(RUNTIME_RECORD).content).toEqual({ disabled: ['ext-a'] });
  });
});

describe('storage event synchronization', () => {
  it('updates subscribers exactly once when another tab\'s change is read from the Runtime', async () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await refresh();
    listener.mockClear();

    // Another tab saves the list; this tab picks it up when the Runtime is read again (window focus).
    fake.writeElsewhere(RUNTIME_RECORD, { disabled: ['tab-ext'] });
    await refresh();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().has('tab-ext')).toBe(true);
    unsubscribe();
  });

  it('ignores storage events for unrelated keys', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    dispatchStorageEvent({ key: 'some.other.key', newValue: '["nope"]' });

    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot().size).toBe(0);
    unsubscribe();
  });

  it('empties the snapshot when the Runtime record is cleared elsewhere', async () => {
    fake.writeElsewhere(RUNTIME_RECORD, { disabled: ['ext-a'] });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await refresh();
    expect(store.getSnapshot().has('ext-a')).toBe(true);
    listener.mockClear();

    // Another tab clears the saved list; the next read sees an empty record.
    fake.writeElsewhere(RUNTIME_RECORD, {});
    await refresh();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().size).toBe(0);
    unsubscribe();
  });

  it('does not double-notify for same-tab writes', () => {
    // The storage event fires only in *other* tabs; the writing tab is
    // notified exactly once by the write itself.
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setBuiltInExtensionEnabled('ext-a', false);

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe('subscribe', () => {
  it('unsubscribes and stops receiving notifications', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    store.setBuiltInExtensionEnabled('ext-a', false);

    expect(listener).not.toHaveBeenCalled();
  });

  it('is idempotent', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    unsubscribe();

    store.setBuiltInExtensionEnabled('ext-a', false);

    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies every subscriber exactly once per change', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = store.subscribe(first);
    const unsubscribeSecond = store.subscribe(second);

    store.setBuiltInExtensionEnabled('ext-a', false);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    unsubscribeFirst();
    unsubscribeSecond();
  });

  it('deduplicates the same listener', () => {
    const listener = vi.fn();
    const unsubscribeFirst = store.subscribe(listener);
    const unsubscribeSecond = store.subscribe(listener);

    store.setBuiltInExtensionEnabled('ext-a', false);

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribeFirst();
    unsubscribeSecond();
  });
});

describe('setBuiltInExtensionEnabled', () => {
  it('saves a sorted list of disabled ids to the Runtime', async () => {
    store.setBuiltInExtensionEnabled('z-ext', false);
    store.setBuiltInExtensionEnabled('a-ext', false);
    await flush();
    expect(fake.record(RUNTIME_RECORD).content).toEqual({ disabled: ['a-ext', 'z-ext'] });
  });

  it('removes an id when re-enabled', async () => {
    store.setBuiltInExtensionEnabled('ext-a', false);
    store.setBuiltInExtensionEnabled('ext-b', false);
    store.setBuiltInExtensionEnabled('ext-a', true);

    expect(store.getSnapshot().has('ext-a')).toBe(false);
    await flush();
    expect(fake.record(RUNTIME_RECORD).content).toEqual({ disabled: ['ext-b'] });
  });
});

describe('SSR safety', () => {
  it('starts empty and keeps changes in memory without localStorage', async () => {
    vi.stubGlobal('localStorage', undefined);
    // A store built now sees the missing localStorage (the one from beforeEach was built with it).
    vi.resetModules();
    const ext = await import('./builtInExtensionEnablement');

    expect(ext.getSnapshot().size).toBe(0);
    expect(() => ext.setBuiltInExtensionEnabled('ext-a', false)).not.toThrow();
    expect(ext.getSnapshot().has('ext-a')).toBe(true);
  });

  it('skips attaching a storage listener when the browser has no storage events', () => {
    // A window without addEventListener must not crash subscription.
    vi.stubGlobal('window', {} as Window & typeof globalThis);

    const unsubscribe = store.subscribe(vi.fn());
    expect(() => unsubscribe()).not.toThrow();
  });
});
