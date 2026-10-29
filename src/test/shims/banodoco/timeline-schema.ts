type UnknownRecord = Record<string, unknown>;

export type ThemeT = {
  id?: string;
  visual?: UnknownRecord;
};

export type ThemeRegistry = Record<string, ThemeT>;
export type ThemeOverridesT = UnknownRecord;
export type TimelineClipT = UnknownRecord;
export type TimelineOutputT = UnknownRecord;
export type AssetEntryT = UnknownRecord;
export type TimelineConfigT = UnknownRecord;

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const deepMerge = <T extends UnknownRecord>(base: T, overlay: UnknownRecord): T => {
  const result: UnknownRecord = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = result[key];
    if (isRecord(current) && isRecord(value)) {
      result[key] = deepMerge(current, value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
};

/**
 * Test-shim counterpart of the canonical timeline-schema runtime export.
 * Keep its one-level nested-object merge and replace-list semantics aligned
 * with vendor/timeline-schema/typescript/src/resolveTheme.ts.
 */
export function deepMergeTheme(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const baseValue = result[key];
    if (isRecord(baseValue) && isRecord(value)) {
      const merged: Record<string, unknown> = { ...baseValue };
      for (const [subKey, subValue] of Object.entries(value)) {
        const innerBase = merged[subKey];
        if (isRecord(innerBase) && isRecord(subValue)) {
          merged[subKey] = { ...innerBase, ...subValue };
        } else {
          merged[subKey] = subValue;
        }
      }
      result[key] = merged;
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function resolveTheme(
  input: {
    theme?: string;
    theme_overrides?: ThemeOverridesT;
  },
  registry: ThemeRegistry,
): ThemeT {
  const themeId = input.theme;
  if (typeof themeId !== 'string' || themeId.length === 0) {
    throw new Error('Theme id is required');
  }

  const installedTheme = registry[themeId];
  if (!installedTheme) {
    throw new Error(`Theme '${themeId}' is not installed`);
  }

  if (!isRecord(input.theme_overrides) || Object.keys(input.theme_overrides).length === 0) {
    return deepMerge({} as ThemeT, installedTheme);
  }

  return deepMerge(
    deepMerge({} as ThemeT, installedTheme),
    input.theme_overrides,
  );
}
