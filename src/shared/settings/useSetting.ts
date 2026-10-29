import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { SettingDeclaration } from './defineSetting';
import { getSettingsStore } from './instance';
import type { SettingRef } from './settingsStore';

export type SettingUpdate<T> = T | ((current: T) => T);

/** Reads and writes a ref through the store; the hook behind `useSetting` and the old helpers' adapters. */
export function useSettingRef<T>(ref: SettingRef<T>): readonly [T, (update: SettingUpdate<T>) => void] {
  const store = getSettingsStore();
  const value = useSyncExternalStore(
    useCallback((listener: () => void) => store.subscribe(ref as SettingRef, listener), [store, ref]),
    () => store.get(ref),
    () => ref.default,
  );
  const set = useCallback((update: SettingUpdate<T>) => {
    store.set(ref, typeof update === 'function' ? (update as (current: T) => T)(store.get(ref)) : update);
  }, [store, ref]);
  return [value, set] as const;
}

/** `useSetting(tasksLocked)` returns `[value, set]`. Timeline settings pass the timeline id. */
export function useSetting<T>(declaration: SettingDeclaration<T>, scopeId?: string): readonly [T, (update: SettingUpdate<T>) => void] {
  const ref = useMemo(() => declaration.ref(scopeId), [declaration, scopeId]);
  return useSettingRef(ref);
}
