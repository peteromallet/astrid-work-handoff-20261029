import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { setSettingsStoreForTests } from '@/shared/settings/instance';

// Automatic DOM cleanup after each test
afterEach(() => {
  cleanup();
  // The settings store keeps values in memory: every test starts from a fresh one.
  setSettingsStoreForTests(null);
  if (typeof localStorage !== 'undefined') {
    // ...and without the store's first-paint snapshots, which would carry a value into the next test.
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith('astrid.settings.snapshot.v1:')) localStorage.removeItem(key);
    } catch { /* A test that stubbed storage has nothing to clear. */ }
  }
});

if (typeof window !== 'undefined') {
  // Mock window.matchMedia (not available in jsdom)
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  // Mock IntersectionObserver (not available in jsdom)
  class MockIntersectionObserver {
    readonly root: Element | null = null;
    readonly rootMargin: string = '';
    readonly thresholds: ReadonlyArray<number> = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: MockIntersectionObserver,
  });

  // Mock ResizeObserver (not available in jsdom)
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: MockResizeObserver,
  });
}
