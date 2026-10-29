import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { renderHookWithProviders } from '@/test/test-utils';
import { generationQueryKeys } from '@/shared/lib/queryKeys/generations';

const mockMarkVariantViewed = vi.fn();
const mockMarkGenerationVariantsViewed = vi.fn();
vi.mock('@/integrations/runtime/client', () => ({
  AstridRuntimeClient: class {
    markVariantViewed = mockMarkVariantViewed;
    markGenerationVariantsViewed = mockMarkGenerationVariantsViewed;
  },
}));

import { useMarkVariantViewed } from '@/shared/hooks/variants/useMarkVariantViewed';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 60_000, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe('useMarkVariantViewed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkVariantViewed.mockResolvedValue({ viewed_at: '2026-01-01T00:00:00.000Z' });
    mockMarkGenerationVariantsViewed.mockResolvedValue({ viewed_at: '2026-01-01T00:00:00.000Z' });
  });

  it('returns markViewed and markAllViewed functions', () => {
    const { result } = renderHookWithProviders(() => useMarkVariantViewed());

    expect(typeof result.current.markViewed).toBe('function');
    expect(typeof result.current.markAllViewed).toBe('function');
    expect(result.current.isMarking).toBe(false);
    expect(result.current.isMarkingAll).toBe(false);
  });

  it('marks a single variant as viewed and updates variant cache optimistically', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(generationQueryKeys.variants('gen-1'), [
      { id: 'v-1', generation_id: 'gen-1', viewed_at: null },
      { id: 'v-2', generation_id: 'gen-1', viewed_at: null },
    ]);
    queryClient.setQueryData(['variant-badges', 'gen-1'], {
      derivedCounts: {},
      hasUnviewedVariants: { 'gen-1': true },
      unviewedVariantCounts: { 'gen-1': 2 },
    });

    const { result } = renderHookWithProviders(() => useMarkVariantViewed(), { queryClient });

    act(() => {
      result.current.markViewed({ variantId: 'v-1', generationId: 'gen-1' });
    });

    await waitFor(() => {
      const variants = queryClient.getQueryData(generationQueryKeys.variants('gen-1')) as Array<{ id: string; viewed_at: string | null }>;
      expect(variants[0].viewed_at).not.toBeNull();
      expect(variants[1].viewed_at).toBeNull();
    });

    const badges = queryClient.getQueryData(['variant-badges', 'gen-1']) as {
      unviewedVariantCounts: Record<string, number>;
    };
    expect(badges.unviewedVariantCounts['gen-1']).toBe(1);

    expect(mockMarkVariantViewed).toHaveBeenCalledWith('v-1');
  });

  it('does not double-decrement badges when markViewed is called twice for the same variant', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(generationQueryKeys.variants('gen-1'), [
      { id: 'v-1', generation_id: 'gen-1', viewed_at: null },
    ]);
    queryClient.setQueryData(['variant-badges', 'gen-1'], {
      derivedCounts: {},
      hasUnviewedVariants: { 'gen-1': true },
      unviewedVariantCounts: { 'gen-1': 3 },
    });

    const { result } = renderHookWithProviders(() => useMarkVariantViewed(), { queryClient });

    act(() => {
      result.current.markViewed({ variantId: 'v-1', generationId: 'gen-1' });
      result.current.markViewed({ variantId: 'v-1', generationId: 'gen-1' });
    });

    await waitFor(() => {
      const badges = queryClient.getQueryData(['variant-badges', 'gen-1']) as {
        unviewedVariantCounts: Record<string, number>;
      };
      expect(badges.unviewedVariantCounts['gen-1']).toBe(2);
    });
  });

  it('marks all variants for a generation as viewed and zeroes the badge count', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(generationQueryKeys.variants('gen-1'), [
      { id: 'v-1', generation_id: 'gen-1', viewed_at: null },
      { id: 'v-2', generation_id: 'gen-1', viewed_at: null },
      { id: 'other-gen', generation_id: 'gen-2', viewed_at: null },
    ]);
    queryClient.setQueryData(['variant-badges', 'gen-1'], {
      derivedCounts: {},
      hasUnviewedVariants: { 'gen-1': true },
      unviewedVariantCounts: { 'gen-1': 2 },
    });

    const { result } = renderHookWithProviders(() => useMarkVariantViewed(), { queryClient });

    act(() => {
      result.current.markAllViewed('gen-1');
    });

    await waitFor(() => {
      const variants = queryClient.getQueryData(generationQueryKeys.variants('gen-1')) as Array<{
        id: string;
        generation_id: string;
        viewed_at: string | null;
      }>;
      expect(variants.find((v) => v.id === 'v-1')?.viewed_at).not.toBeNull();
      expect(variants.find((v) => v.id === 'v-2')?.viewed_at).not.toBeNull();
      expect(variants.find((v) => v.id === 'other-gen')?.viewed_at).toBeNull();
    });

    const badges = queryClient.getQueryData(['variant-badges', 'gen-1']) as {
      hasUnviewedVariants: Record<string, boolean>;
      unviewedVariantCounts: Record<string, number>;
    };
    expect(badges.hasUnviewedVariants['gen-1']).toBe(false);
    expect(badges.unviewedVariantCounts['gen-1']).toBe(0);
    expect(mockMarkGenerationVariantsViewed).toHaveBeenCalledWith('gen-1');
  });

  it('patches the Runtime variant cache when a single variant is viewed', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(['runtime', 'generation-variants', 'project-1', 'gen-1'], [
      { id: 'v-1', generation_id: 'gen-1', viewed_at: null },
      { id: 'v-2', generation_id: 'gen-1', viewed_at: null },
    ]);

    const { result } = renderHookWithProviders(() => useMarkVariantViewed(), { queryClient });

    act(() => {
      result.current.markViewed({ variantId: 'v-1', generationId: 'gen-1' });
    });

    await waitFor(() => {
      const variants = queryClient.getQueryData(['runtime', 'generation-variants', 'project-1', 'gen-1']) as Array<{
        id: string;
        viewed_at: string | null;
      }>;
      expect(variants.find((v) => v.id === 'v-1')?.viewed_at).not.toBeNull();
      expect(variants.find((v) => v.id === 'v-2')?.viewed_at).toBeNull();
    });
  });

  it('patches the Runtime variant cache when a whole generation is viewed', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(['runtime', 'generation-variants', 'project-1', 'gen-1'], [
      { id: 'v-1', generation_id: 'gen-1', viewed_at: null },
      { id: 'v-2', generation_id: 'gen-1', viewed_at: null },
    ]);

    const { result } = renderHookWithProviders(() => useMarkVariantViewed(), { queryClient });

    act(() => {
      result.current.markAllViewed('gen-1');
    });

    await waitFor(() => {
      const variants = queryClient.getQueryData(['runtime', 'generation-variants', 'project-1', 'gen-1']) as Array<{
        viewed_at: string | null;
      }>;
      expect(variants.every((v) => v.viewed_at !== null)).toBe(true);
    });
  });
});
