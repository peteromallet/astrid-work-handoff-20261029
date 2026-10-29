import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { queryKeys } from '@/shared/lib/queryKeys';
import { getProjectSelectionFallbackId } from '@/shared/contexts/projectSelectionStore';
import type { ToolDefaultsById, ToolDefaultsId } from '@/tooling/toolDefaultsRegistry';

export type SettingsScope = 'user' | 'project' | 'shot';

export interface SettingsFetchResult<T = Record<string, unknown>> {
  settings: T;
  hasShotSettings: boolean;
}

// ============================================================================
// Cache format helpers
// ============================================================================

/**
 * Helper to check if a cache value has the wrapper format.
 * settings reads always return { settings, hasShotSettings },
 * but legacy or manually-set cache entries may use flat format.
 */
function isSettingsWrapper(data: unknown): data is SettingsFetchResult {
  if (!data || typeof data !== 'object') return false;
  return 'settings' in data && 'hasShotSettings' in data;
}

/**
 * Helper to extract settings from cache data (handles wrapper format)
 * Cache stores data as { settings: T, hasShotSettings: boolean }
 */
export function extractSettingsFromCache<T>(cacheData: unknown): T | undefined {
  if (!cacheData) return undefined;
  return isSettingsWrapper(cacheData) ? (cacheData.settings as T) : (cacheData as T);
}

/**
 * Helper to update settings cache with proper wrapper format
 * Use this in setQueryData callbacks for optimistic updates
 *
 * @param prev - The previous cache value (may be wrapper or flat format)
 * @param updater - Either an object of updates, or a function that receives prevSettings and returns updates
 */
export function updateSettingsCache<T extends object>(
  prev: unknown,
  updater: Partial<T> | ((prevSettings: T) => Partial<T>)
): SettingsFetchResult<T> {
  const wrapper = isSettingsWrapper(prev);
  const prevSettings = (wrapper ? ((prev as SettingsFetchResult).settings ?? {}) : (prev ?? {})) as T;
  const updates = typeof updater === 'function' ? updater(prevSettings) : updater;
  return {
    settings: { ...prevSettings, ...updates } as T,
    hasShotSettings: wrapper ? ((prev as SettingsFetchResult).hasShotSettings ?? false) : false
  };
}

// Type overloads
export function useToolSettings<TToolId extends ToolDefaultsId>(toolId: TToolId, context?: { projectId?: string; shotId?: string; enabled?: boolean }): {
  settings: ToolDefaultsById[TToolId] | undefined;
  isLoading: boolean;
  error: Error | null;
  update: (scope: SettingsScope, settings: Partial<ToolDefaultsById[TToolId]>) => Promise<void>;
  isUpdating: boolean;
  hasShotSettings: boolean;
};
export function useToolSettings<T extends object>(toolId: string, context?: { projectId?: string; shotId?: string; enabled?: boolean }): {
  settings: T | undefined;
  isLoading: boolean;
  error: Error | null;
  update: (scope: SettingsScope, settings: Partial<T>) => Promise<void>;
  isUpdating: boolean;
  /** Whether the shot had settings stored in DB (vs just defaults/project settings) */
  hasShotSettings: boolean;
};

/**
 * Tool settings hook. The Runtime path has no tool-settings backend, so the
 * query is never fetched and `update` is a no-op. The hook still observes the
 * settings cache, which other hooks seed with `setQueryData` (shot settings
 * seeding, reference/style handlers), so `settings`, `hasShotSettings` and
 * `error` come from whatever those writers put there.
 */
export function useToolSettings<T extends object>(
  toolId: string,
  context?: { projectId?: string; shotId?: string; enabled?: boolean },
) {
  const projectId = context?.projectId ?? getProjectSelectionFallbackId() ?? undefined;
  const { data: queryResult, isLoading, error } = useQuery({
    queryKey: queryKeys.settings.tool(toolId, projectId, context?.shotId),
    queryFn: async (): Promise<SettingsFetchResult<T> | null> => null,
    enabled: false,
  });
  const wrapper = isSettingsWrapper(queryResult);
  const settings = wrapper ? queryResult.settings : queryResult;
  const hasShotSettings = wrapper ? (queryResult.hasShotSettings ?? false) : false;
  const update = useCallback(async (_scope: SettingsScope, _settings: Partial<T>): Promise<void> => {}, []);

  return useMemo(() => ({
    settings: settings as T | undefined,
    isLoading,
    error: error as Error | null,
    update,
    isUpdating: false,
    hasShotSettings,
  }), [settings, isLoading, error, update, hasShotSettings]);
}
