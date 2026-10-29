import { SettingsStore, type AppStateApi } from './settingsStore';

/** Unit tests run without a Runtime: every read is "unreachable" until a test installs its own store. */
const unreachableApi: AppStateApi = {
  get: () => Promise.reject(new Error('no Runtime in tests')),
  put: () => Promise.reject(new Error('no Runtime in tests')),
};

/** The Runtime client loads on first use, so importing the store stays cheap. */
let runtimeApi: Promise<AppStateApi> | null = null;
const lazyRuntimeApi: AppStateApi = {
  async get(key) {
    runtimeApi ??= import('./runtimeAppStateApi').then((module) => module.createRuntimeAppStateApi());
    return (await runtimeApi).get(key);
  },
  async put(key, content, expectedVersion) {
    runtimeApi ??= import('./runtimeAppStateApi').then((module) => module.createRuntimeAppStateApi());
    return (await runtimeApi).put(key, content, expectedVersion);
  },
};

let store: SettingsStore | null = null;

/** The one settings store of this page. */
export function getSettingsStore(): SettingsStore {
  // In the app the store stays off the Runtime until the connection provider says it answered.
  store ??= new SettingsStore(import.meta.env.MODE === 'test' ? { api: unreachableApi } : { api: lazyRuntimeApi, connected: false });
  return store;
}

/** Replaces the process-wide store, or clears it so the next use makes a fresh one (tests). */
export function setSettingsStoreForTests(next: SettingsStore | null): void {
  store?.dispose();
  store = next;
}
