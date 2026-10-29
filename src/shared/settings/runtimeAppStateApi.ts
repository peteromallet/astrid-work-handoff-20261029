import { AstridRuntimeClient } from '@/integrations/runtime/client';
import type { AppStateApi } from './settingsStore';

/** The Runtime's per-user app-state, the same route the editor tour record uses. */
export function createRuntimeAppStateApi(client: AstridRuntimeClient = new AstridRuntimeClient()): AppStateApi {
  return {
    async get(key) {
      const state = await client.getUserAppState(key);
      return { version: state.version, content: state.content };
    },
    async put(key, content, expectedVersion) {
      const state = await client.updateUserAppState(key, content, expectedVersion);
      return { version: state.version, content: state.content };
    },
  };
}
