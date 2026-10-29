import { useMemo } from 'react';
import { useRuntimeAuthority } from './runtimeAuthority';

export type GalleryProjectResolutionStatus =
  | 'not-applicable'
  | 'pending'
  | 'resolved'
  | 'error';

export interface ResolvedGalleryProject {
  /** Canonical Runtime project id when this route is Runtime-owned. */
  projectId: string | null;
  /** True when the gallery must not fall back to the legacy generation API. */
  runtimeAuthority: boolean;
  status: GalleryProjectResolutionStatus;
  isResolving: boolean;
  error: Error | null;
  selector: string | null;
}

/** Read gallery identity from the same canonical authority used by Runtime queries. */
export function useResolvedGalleryProject(): ResolvedGalleryProject {
  const { runtimeAuthority, runtimeProjectId } = useRuntimeAuthority();

  return useMemo(() => {
    if (!runtimeAuthority) {
      return {
        projectId: null,
        runtimeAuthority: false,
        status: 'not-applicable' as const,
        isResolving: false,
        error: null,
        selector: null,
      };
    }

    if (runtimeProjectId) {
      return {
        projectId: runtimeProjectId,
        runtimeAuthority: true,
        status: 'resolved' as const,
        isResolving: false,
        error: null,
        selector: runtimeProjectId,
      };
    }

    return {
      projectId: null,
      runtimeAuthority: true,
      status: 'pending' as const,
      isResolving: true,
      error: null,
      selector: null,
    };
  }, [runtimeAuthority, runtimeProjectId]);
}
