import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';

const mockPrefetchTaskData = vi.fn();
const mockPrefetchTaskById = vi.fn();

vi.mock('@/shared/hooks/tasks/useTaskPrefetch', () => ({
  usePrefetchTaskData: () => mockPrefetchTaskData,
  usePrefetchTaskById: () => mockPrefetchTaskById,
}));

import { useVariantActions } from './useVariantActions';

const variant: GenerationVariant = {
  id: 'variant-1',
  generation_id: 'generation-1',
  location: 'https://example.com/variant.jpg',
  thumbnail_url: null,
  params: {},
  is_primary: true,
  starred: false,
  variant_type: 'original',
  name: null,
  created_at: '2024-01-01T00:00:00Z',
  viewed_at: null,
};

function renderActions(isMobile = false) {
  return renderHook(() => useVariantActions({ isMobile }));
}

describe('useVariantActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefetches the generation task data when a variant is hovered on desktop', () => {
    const { result } = renderActions();

    act(() => {
      result.current.handleVariantMouseEnter(variant);
    });

    expect(mockPrefetchTaskData).toHaveBeenCalledWith('generation-1');
    expect(mockPrefetchTaskById).not.toHaveBeenCalled();
  });

  it('prefetches by source task id when the variant records one', () => {
    const { result } = renderActions();

    act(() => {
      result.current.handleVariantMouseEnter({
        ...variant,
        params: { source_task_id: '8b0f4f0a-5c0e-4c53-8a35-0d5b9d9b7f10' },
      });
    });

    expect(mockPrefetchTaskById).toHaveBeenCalledTimes(1);
    expect(mockPrefetchTaskData).not.toHaveBeenCalled();
  });

  it('does not prefetch on mobile', () => {
    const { result } = renderActions(true);

    act(() => {
      result.current.handleVariantMouseEnter(variant);
    });

    expect(mockPrefetchTaskData).not.toHaveBeenCalled();
    expect(mockPrefetchTaskById).not.toHaveBeenCalled();
  });
});
