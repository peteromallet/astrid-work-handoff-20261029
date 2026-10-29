import { useMemo, useState } from 'react';
import { editorPreferences, EDITOR_PREFERENCES_LEGACY_PREFIX } from '@/shared/settings/declarations';
import { validatorFor } from '@/shared/settings/defineSetting';
import { useSettingRef } from '@/shared/settings/useSetting';
import type { SettingRef } from '@/shared/settings/settingsStore';

type Setter<T> = T | ((current: T) => T);

interface EditorSettingsOptions {
  /** Kept for existing callers; the store sets the write delay for a timeline's settings (1.5 s, flushed when the tab hides). */
  debounceMs?: number;
  /** False keeps the value in memory only: nothing is read from or written to storage (the tour's demo timeline). */
  persist?: boolean;
}

/** A timeline's editor settings are saved per timeline in the Runtime (`ui.timeline.<id>`). */
function refFor<T>(storageKey: string, initialValue: T): SettingRef<T> {
  if (storageKey.startsWith(EDITOR_PREFERENCES_LEGACY_PREFIX)) {
    const base = editorPreferences.ref(storageKey.slice(EDITOR_PREFERENCES_LEGACY_PREFIX.length));
    return { ...base, default: initialValue } as SettingRef<T>;
  }
  return { group: 'device', field: storageKey, default: initialValue, validate: validatorFor(initialValue), device: true };
}

/**
 * A saved editor value. A thin adapter onto the settings store. Only an explicit `setValue` is written back: mounting
 * with the default (or with a record that merely lacks newer fields) must not turn that default into a saved choice.
 */
export function useEditorSettings<T>(storageKey: string, initialValue: T, { persist = true }: EditorSettingsOptions = {}) {
  const ref = useMemo((): SettingRef<T> => (persist
    ? refFor(storageKey, initialValue)
    // Not persisting: the hook still needs a ref, so it reads one device key that nothing ever writes.
    : { group: 'device', field: '__editor-settings-memory-only__', default: initialValue, validate: () => true, device: true }),
  [persist, storageKey, initialValue]);
  const [stored, setStored] = useSettingRef(ref);
  const [memory, setMemory] = useState<T>(initialValue);
  const value = persist ? stored : memory;
  const setValue = (update: Setter<T>) => {
    if (persist) setStored(update);
    else setMemory(update);
  };
  return [value, setValue] as const;
}
