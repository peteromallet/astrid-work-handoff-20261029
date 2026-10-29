import { createContext, useContext } from 'react';
import {
  getRuntimeDocumentProjectId,
  isRuntimeDocumentMode,
} from './runtimeDocument';

export interface RuntimeAuthority {
  /** True when the current surface is owned by Astrid/Workspace Runtime. */
  runtimeAuthority: boolean;
  /** Canonical Runtime project id, once URL selection has resolved. */
  runtimeProjectId: string | null;
}

export const RuntimeAuthorityContext = createContext<RuntimeAuthority | null>(
  null,
);

export function resolveRuntimeAuthority(
  search = typeof window === 'undefined' ? '' : window.location.search,
  pathname = typeof window === 'undefined' ? '' : window.location.pathname,
): RuntimeAuthority {
  const runtimeProjectId = getRuntimeDocumentProjectId(search, pathname);
  return {
    runtimeAuthority:
      isRuntimeDocumentMode(search, pathname) || runtimeProjectId !== null,
    runtimeProjectId,
  };
}

/**
 * Read the nearest explicit authority. Outside a route provider, canonical
 * document URLs are still authoritative. No generation-id
 * shape is used to choose a backend.
 */
export function useRuntimeAuthority(): RuntimeAuthority {
  const provided = useContext(RuntimeAuthorityContext);
  if (provided) return provided;

  return resolveRuntimeAuthority();
}
