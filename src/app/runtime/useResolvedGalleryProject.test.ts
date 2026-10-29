import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const useRuntimeAuthority = vi.hoisted(() => vi.fn());
vi.mock('./runtimeAuthority', () => ({ useRuntimeAuthority }));

import { useResolvedGalleryProject } from './useResolvedGalleryProject';

describe('useResolvedGalleryProject', () => {
  it('uses the canonical Runtime project id without requiring a timeline', () => {
    useRuntimeAuthority.mockReturnValue({ runtimeAuthority: true, runtimeProjectId: 'project-uuid' });
    const { result } = renderHook(() => useResolvedGalleryProject());
    expect(result.current).toMatchObject({
      projectId: 'project-uuid', runtimeAuthority: true, status: 'resolved', isResolving: false,
    });
  });

  it('keeps Runtime authority while canonical project identity is pending', () => {
    useRuntimeAuthority.mockReturnValue({ runtimeAuthority: true, runtimeProjectId: null });
    const { result } = renderHook(() => useResolvedGalleryProject());
    expect(result.current).toMatchObject({
      projectId: null, runtimeAuthority: true, status: 'pending', isResolving: true,
    });
  });

  it('does not resolve a project for a non-Runtime gallery', () => {
    useRuntimeAuthority.mockReturnValue({ runtimeAuthority: false, runtimeProjectId: null });
    const { result } = renderHook(() => useResolvedGalleryProject());
    expect(result.current).toMatchObject({
      projectId: null, runtimeAuthority: false, status: 'not-applicable', isResolving: false,
    });
  });
});
