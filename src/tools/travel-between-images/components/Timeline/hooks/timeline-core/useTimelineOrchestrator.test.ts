import { describe, expect, it, vi } from 'vitest';

import { runGenerationDropInterceptor } from './useTimelineOrchestratorActions';

describe('useTimelineOrchestrator helpers', () => {
  it('wraps generation drops with pending-frame bookkeeping and cleanup', async () => {
    const setPendingDropFrame = vi.fn();
    const setIsInternalDropProcessing = vi.fn();
    const onGenerationDrop = vi.fn().mockResolvedValue(undefined);

    await runGenerationDropInterceptor({
      generationId: 'gen-1',
      imageUrl: 'https://image.test/frame.png',
      thumbUrl: 'https://image.test/thumb.png',
      targetFrame: 12,
      onGenerationDrop,
      setPendingDropFrame,
      setIsInternalDropProcessing,
    });

    expect(setPendingDropFrame).toHaveBeenNthCalledWith(1, 12);
    expect(setIsInternalDropProcessing).toHaveBeenNthCalledWith(1, true);
    expect(onGenerationDrop).toHaveBeenCalledWith(
      'gen-1',
      'https://image.test/frame.png',
      'https://image.test/thumb.png',
      12,
    );
    expect(setIsInternalDropProcessing).toHaveBeenLastCalledWith(false);
    expect(setPendingDropFrame).toHaveBeenLastCalledWith(null);
  });
});
