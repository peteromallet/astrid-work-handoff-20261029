import { getSettingsPrefix, type ExtensionSettingsBacking } from '@/sdk/extensionSettingsService';
import { runtimeKeyPart } from '@/shared/settings/defineSetting';
import { getSettingsStore } from '@/shared/settings/instance';
import type { SettingRef } from '@/shared/settings/settingsStore';

/** The Runtime app-state key holding one extension's settings: `ext.<id>` with the id made key-safe. */
export function extensionSettingsGroup(extensionId: string): string {
  return `ext.${runtimeKeyPart(extensionId)}`.slice(0, 64);
}

/**
 * An extension's settings kept in the Runtime per user (`ext.<extension>`) through the settings store. Values an
 * older browser kept under `astrid.ext.<id>.*` localStorage keys are imported once.
 */
export function createRuntimeSettingsBacking(extensionId: string): ExtensionSettingsBacking {
  const store = getSettingsStore();
  const group = extensionSettingsGroup(extensionId);
  store.importLegacyPrefix(group, getSettingsPrefix(extensionId));
  const refs = new Map<string, SettingRef>();
  const refFor = (key: string): SettingRef => {
    let ref = refs.get(key);
    if (!ref) {
      ref = { group, field: key, default: undefined, validate: () => true };
      refs.set(key, ref);
    }
    return ref;
  };
  return {
    get: (key) => store.get(refFor(key)),
    set(key, value) { store.set(refFor(key), value); return true; },
    remove(key) { store.remove(refFor(key)); return true; },
    keys: () => store.fields(group),
    subscribe: (listener) => store.subscribeGroup(group, listener),
  };
}
