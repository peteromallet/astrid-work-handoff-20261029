import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchGenerationById: vi.fn(),
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/integrations/astrid/repositories/generationRepository', () => ({
  fetchGenerationById: (...args: unknown[]) => mocks.fetchGenerationById(...args),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

import { navigateToGenerationById } from '@/domains/generation/navigation';

describe('editMedia/navigation navigateToGenerationById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves generation and calls the resolved callback', async () => {
    const generation = { id: 'gen-1' };
    const onResolved = vi.fn();
    mocks.fetchGenerationById.mockResolvedValue(generation);

    await navigateToGenerationById('gen-1', {
      context: 'navigation.test',
      onResolved,
    });

    expect(onResolved).toHaveBeenCalledWith(generation);
    expect(mocks.normalizeAndPresentError).not.toHaveBeenCalled();
  });

  it('does nothing when no generation is returned', async () => {
    const onResolved = vi.fn();
    mocks.fetchGenerationById.mockResolvedValue(null);

    await navigateToGenerationById('missing-gen', {
      context: 'navigation.test',
      onResolved,
    });

    expect(onResolved).not.toHaveBeenCalled();
  });

  it('normalizes errors from repository lookup', async () => {
    const onResolved = vi.fn();
    mocks.fetchGenerationById.mockRejectedValue(new Error('boom'));

    await navigateToGenerationById('gen-1', {
      context: 'navigation.test',
      onResolved,
    });

    expect(onResolved).not.toHaveBeenCalled();
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      { context: 'navigation.test', showToast: false },
    );
  });
});
