import { useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { disabledBuiltInExtensions, skyPreviewEnvironment, tasksPaneLocked, themeHour } from '@/shared/settings/declarations';
import type { SettingDeclaration } from '@/shared/settings/defineSetting';
import { validatorFor } from '@/shared/settings/defineSetting';
import { useSettingRef } from '@/shared/settings/useSetting';
import type { SettingRef } from '@/shared/settings/settingsStore';

/** The declared settings an old call site still names by its browser key. */
const DECLARED_BY_STORAGE_KEY = new Map<string, SettingDeclaration<unknown>>(
  [
    ['astrid.tasks-pane-locked.v1', tasksPaneLocked],
    ['theme-hour', themeHour],
    ['theme-include-environment', skyPreviewEnvironment],
    ['astrid.dev-extensions.disabled', disabledBuiltInExtensions],
  ] as Array<[string, SettingDeclaration<unknown>]>,
);

const deviceRefs = new Map<string, SettingRef>();
function refForStorageKey<T>(key: string, defaultValue: T): SettingRef<T> {
  const declared = DECLARED_BY_STORAGE_KEY.get(key);
  if (declared) return declared.ref() as SettingRef<T>;
  // An undeclared key is a device setting: it stays in this browser, behind the same store.
  let ref = deviceRefs.get(key);
  if (!ref) {
    ref = { group: 'device', field: key, default: defaultValue, validate: validatorFor(defaultValue), device: true };
    deviceRefs.set(key, ref);
  }
  return ref as SettingRef<T>;
}

/**
 * A value saved under a key. A thin adapter onto the settings store: keys with a declaration (see
 * `shared/settings/declarations.ts`) are kept in the Runtime, any other key stays on this device.
 */
export function usePersistentState<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
  const ref = useMemo(() => refForStorageKey(key, defaultValue), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [value, set] = useSettingRef(ref);
  const setState = useCallback<Dispatch<SetStateAction<T>>>((update) => set(update), [set]);
  return [value, setState];
}
