import { setSettingsStoreForTests } from '@/shared/settings/instance';
import { SettingsStore, type AppStateApi, type AppStateRecord } from '@/shared/settings/settingsStore';

/** An in-memory stand-in for the Runtime's per-user app-state, with the real version and 409 rules. */
export function createFakeAppStateApi() {
  const records = new Map<string, AppStateRecord>();
  const calls: Array<{ op: 'get' | 'put'; key: string; content?: Record<string, unknown>; expectedVersion?: number }> = [];
  const state = { unreachable: false };

  const api: AppStateApi = {
    async get(key) {
      calls.push({ op: 'get', key });
      if (state.unreachable) throw new Error('Runtime unreachable');
      const record = records.get(key) ?? { version: 0, content: null };
      return structuredClone(record);
    },
    async put(key, content, expectedVersion) {
      calls.push({ op: 'put', key, content: structuredClone(content), expectedVersion });
      if (state.unreachable) throw new Error('Runtime unreachable');
      const current = records.get(key)?.version ?? 0;
      if (expectedVersion !== current) throw Object.assign(new Error('app-state version conflict'), { status: 409 });
      const next = { version: current + 1, content: structuredClone(content) };
      records.set(key, next);
      return structuredClone(next);
    },
  };

  return {
    api,
    calls,
    /** Make every call fail like an unreachable Runtime (or work again). */
    setUnreachable(value: boolean) { state.unreachable = value; },
    /** What the Runtime holds for a key. */
    record(key: string): AppStateRecord { return structuredClone(records.get(key) ?? { version: 0, content: null }); },
    /** Another tab or machine writes: the version moves and the content is replaced. */
    writeElsewhere(key: string, content: Record<string, unknown>) {
      records.set(key, { version: (records.get(key)?.version ?? 0) + 1, content: structuredClone(content) });
    },
    puts() { return calls.filter((call) => call.op === 'put'); },
  };
}

export type FakeAppStateApi = ReturnType<typeof createFakeAppStateApi>;

/** Installs a fresh settings store on a fake Runtime for one test (the global setup resets it afterwards). */
export function installTestSettingsStore(fake: FakeAppStateApi = createFakeAppStateApi()) {
  const store = new SettingsStore({ api: fake.api, storage: window.localStorage });
  setSettingsStoreForTests(store);
  return { store, fake };
}
