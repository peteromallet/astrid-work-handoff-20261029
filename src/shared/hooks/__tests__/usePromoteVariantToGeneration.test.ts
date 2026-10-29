import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

vi.mock('@/shared/lib/typeGuards', () => ({
  hasVideoExtension: vi.fn((url: string) => url?.endsWith('.mp4')),
}));

import { usePromoteVariantToGeneration } from '@/shared/hooks/variants/usePromoteVariantToGeneration';

describe('usePromoteVariantToGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns mutation object', () => {
    const { result } = renderHookWithProviders(() => usePromoteVariantToGeneration());
    expect(typeof result.current.mutateAsync).toBe('function');
    expect(result.current.isPending).toBe(false);
  });

  it('fails closed because standalone promotion is disabled', async () => {
    const { result } = renderHookWithProviders(() => usePromoteVariantToGeneration());

    await act(async () => {
      await expect(
        result.current.mutateAsync({ variantId: 'v-1', projectId: 'proj-1' })
      ).rejects.toThrow('Creating a standalone generation from a variant is disabled');
    });
  });
});
