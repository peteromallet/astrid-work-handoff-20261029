/**
 * Task type cache — pure data layer for synchronous task type lookups.
 *
 * The cache is populated once on app load by useAllTaskTypesConfig (in hooks/tasks/useTaskType.ts).
 * Consumers in lib/ (e.g. taskConfig.ts) read from here without importing from hooks/.
 */

export interface TaskTypeInfo {
  id: string;
  name: string;
  content_type: string | null;
  tool_type: string | null;
  display_name: string;
  category: string;
  is_visible: boolean;
  supports_progress: boolean;
}

// Global cache for synchronous access (populated by useAllTaskTypesConfig hook)
let _taskTypeConfigCache: Record<string, TaskTypeInfo> = {};
let _cacheInitialized = false;

/** Get the global task type config cache */
export function getTaskTypeConfigCache(): Record<string, TaskTypeInfo> {
  return _taskTypeConfigCache;
}

/** Check if the cache has been initialized */
export function isTaskTypeConfigCacheInitialized(): boolean {
  return _cacheInitialized;
}

/** Update the global cache (called from the hook after fetching) */
export function setTaskTypeConfigCache(cache: Record<string, TaskTypeInfo>): void {
  _taskTypeConfigCache = cache;
  _cacheInitialized = true;
}
