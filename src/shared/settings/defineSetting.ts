import type { SettingRef } from './settingsStore';

export type SettingScope = 'user' | 'timeline' | 'device';

export interface SettingDefinition<T> {
  /**
   * Dotted id. Its first segment picks the Runtime key for user settings (`panes.tasks.locked` is the `tasks.locked`
   * field of `ui.panes`); a single segment lands in `ui.preferences`. Timeline settings are saved under
   * `ui.timeline.<timelineId>` and keep the whole id as the field.
   */
  id: string;
  /** Also the type check: a stored value of another type reads back as this default. */
  default: T;
  scope: SettingScope;
  /** The browser key this setting used before the Runtime held it (a function of the timeline id for timeline scope). It is imported once, then removed. */
  legacyKey?: string | ((scopeId: string) => string);
  /** Turns a legacy raw string into the value; defaults to JSON.parse. Return `undefined` to ignore it. */
  legacyParse?: (raw: string) => unknown;
  /** The localStorage key for `device` scope (defaults to the legacy key). */
  deviceKey?: string;
  /**
   * A browser key kept in step with the saved value, for readers that run before the app does (the boot script).
   * It is also read as the legacy key and, unlike a legacy key, never removed.
   */
  mirrorKey?: string;
  /** For defaults whose type cannot say what is valid (a `null` default). */
  validate?: (value: unknown) => boolean;
  debounceMs?: number;
}

export interface SettingDeclaration<T> {
  readonly id: string;
  readonly scope: SettingScope;
  readonly default: T;
  /** The store's reference to this setting; timeline settings pass the timeline id. */
  ref(scopeId?: string): SettingRef<T>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The default's type is the schema: same primitive type, array, or object. */
export function validatorFor(sample: unknown): (value: unknown) => boolean {
  if (Array.isArray(sample)) return Array.isArray;
  if (sample === null) return (value) => value === null;
  if (typeof sample === 'number') return (value) => typeof value === 'number' && Number.isFinite(value);
  if (typeof sample === 'object') return isPlainObject;
  return (value) => typeof value === typeof sample;
}

/** A Runtime key made of lowercase letters, digits, dot, dash and underscore, at most 64 characters. */
export function runtimeKeyPart(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
}

const REGISTRY = new Map<string, SettingDeclaration<unknown>>();

/** Declares one setting. The declaration is the whole definition: add a line here and call `useSetting` with it. */
export function defineSetting<T>(definition: SettingDefinition<T>): SettingDeclaration<T> {
  const existing = REGISTRY.get(`${definition.scope}:${definition.id}`);
  if (existing) return existing as SettingDeclaration<T>;

  const segments = definition.id.split('.');
  const validate = definition.validate ?? validatorFor(definition.default);
  const refs = new Map<string, SettingRef<T>>();

  const build = (scopeId = ''): SettingRef<T> => {
    const legacy = typeof definition.legacyKey === 'function'
      ? (scopeId ? definition.legacyKey(scopeId) : undefined)
      : definition.legacyKey;
    const common = {
      default: definition.default,
      validate,
      legacyParse: definition.legacyParse,
      mirrorKey: definition.mirrorKey,
      debounceMs: definition.debounceMs,
    };
    if (definition.scope === 'device') {
      return { ...common, group: 'device', field: definition.deviceKey ?? (legacy as string | undefined) ?? `astrid.setting.${definition.id}`, device: true };
    }
    if (definition.scope === 'timeline') {
      return { ...common, group: `ui.timeline.${runtimeKeyPart(scopeId)}`.slice(0, 64), field: definition.id, legacyKey: legacy };
    }
    const [first, ...rest] = segments;
    return rest.length === 0
      ? { ...common, group: 'ui.preferences', field: first, legacyKey: legacy }
      : { ...common, group: `ui.${first}`, field: rest.join('.'), legacyKey: legacy };
  };

  const declaration: SettingDeclaration<T> = {
    id: definition.id,
    scope: definition.scope,
    default: definition.default,
    ref(scopeId) {
      const key = scopeId ?? '';
      let ref = refs.get(key);
      if (!ref) {
        ref = build(scopeId);
        refs.set(key, ref);
      }
      return ref;
    },
  };
  REGISTRY.set(`${definition.scope}:${definition.id}`, declaration as SettingDeclaration<unknown>);
  return declaration;
}
