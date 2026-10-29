/**
 * builtInExtensionEnablement — a stable external store for enable/disable of the bundled (built-in) direct
 * extensions. The choice is the `extensions.disabled` setting (Runtime `ui.extensions`; the browser key
 * `astrid.dev-extensions.disabled` is imported once). It is the single enablement source for DEV and production.
 *
 * - `getSnapshot()` returns a stable, readonly disabled-ID set; unchanged reads return the same identity.
 * - `subscribe(listener)` registers a change listener and returns an idempotent unsubscribe.
 * - `setBuiltInExtensionEnabled(id, enabled)` flips one extension and saves the sorted ID list; a no-op saves nothing.
 */

import { disabledBuiltInExtensions } from '@/shared/settings/declarations';
import { getSettingsStore } from '@/shared/settings/instance';

const ref = disabledBuiltInExtensions.ref();
const store = () => getSettingsStore();

/** Stable snapshot of the disabled-ID set: rebuilt only when the saved list changes. */
let cachedList: readonly string[] | null = null;
let cachedDisabled: ReadonlySet<string> | null = null;

/**
 * Returns the current disabled-ID set as a stable snapshot.
 *
 * The returned set is readonly and must not be mutated. Its identity is stable while the saved list is unchanged.
 */
export function getSnapshot(): ReadonlySet<string> {
  const list = store().get(ref);
  if (cachedDisabled === null || list !== cachedList) {
    cachedList = list;
    cachedDisabled = new Set(list.filter((id): id is string => typeof id === 'string'));
  }
  return cachedDisabled;
}

/** Subscribes to disabled-set changes (this tab's toggles, a re-read from the Runtime). Returns an idempotent unsubscribe. */
export function subscribe(listener: () => void): () => void {
  return store().subscribe(ref, listener);
}

/**
 * Enables or disables one built-in extension. A no-op write (already in the requested state) saves nothing.
 */
export function setBuiltInExtensionEnabled(extensionId: string, enabled: boolean): void {
  const current = getSnapshot();
  const next = new Set(current);
  if (enabled) next.delete(extensionId); else next.add(extensionId);
  if (next.has(extensionId) === current.has(extensionId)) return;
  store().set(ref, [...next].sort());
}
