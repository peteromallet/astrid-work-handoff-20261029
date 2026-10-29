import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationRow, Shot } from '@/domains/generation/types';
import type { ExtractedGenerationSettings } from './types';

const mocks = vi.hoisted(() => ({
  persistTimelineFrameBatch: vi.fn(),
}));

vi.mock('@/shared/lib/timelineFrameBatchPersist', () => ({
  persistTimelineFrameBatch: (...args: unknown[]) => mocks.persistTimelineFrameBatch(...args),
}));

import { applyFramePositionsToExistingImages } from './imageService';

const shot = { id: 'shot-1' } as Shot;
const images = [{ id: 'sg-a' }, { id: 'sg-b' }, { id: 'sg-c' }] as GenerationRow[];

function settingsWith(segmentFramesExpanded: number[] | undefined) {
  return { segmentFramesExpanded } as ExtractedGenerationSettings;
}

describe('applyFramePositionsToExistingImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.persistTimelineFrameBatch.mockResolvedValue({ updateCount: 3, durationMs: 1, skipped: false });
  });

  it('persists cumulative frames for the existing images in one batch', async () => {
    const result = await applyFramePositionsToExistingImages(settingsWith([30, 45]), shot, images);

    expect(mocks.persistTimelineFrameBatch).toHaveBeenCalledTimes(1);
    expect(mocks.persistTimelineFrameBatch).toHaveBeenCalledWith(expect.objectContaining({
      shotId: 'shot-1',
      updates: [
        { shotGenerationId: 'sg-a', timelineFrame: 0 },
        { shotGenerationId: 'sg-b', timelineFrame: 30 },
        { shotGenerationId: 'sg-c', timelineFrame: 75 },
      ],
    }));
    expect(result).toEqual({
      success: true,
      settingName: 'framePositions',
      details: { updated: 3, total: 3 },
    });
  });

  it('extends past the last gap with the last gap size and skips images without an id', async () => {
    await applyFramePositionsToExistingImages(
      settingsWith([30]),
      shot,
      [{ id: 'sg-a' }, { id: undefined }, { id: 'sg-c' }] as GenerationRow[],
    );

    expect(mocks.persistTimelineFrameBatch).toHaveBeenCalledWith(expect.objectContaining({
      updates: [
        { shotGenerationId: 'sg-a', timelineFrame: 0 },
        { shotGenerationId: 'sg-c', timelineFrame: 60 },
      ],
    }));
  });

  it('does nothing without segment gaps or a shot', async () => {
    await expect(applyFramePositionsToExistingImages(settingsWith(undefined), shot, images))
      .resolves.toMatchObject({ success: true, details: 'no data' });
    await expect(applyFramePositionsToExistingImages(settingsWith([30]), null, images))
      .resolves.toMatchObject({ success: true, details: 'skipped - no shot' });
    expect(mocks.persistTimelineFrameBatch).not.toHaveBeenCalled();
  });

  it('reports a failed batch write as an unsuccessful setting', async () => {
    mocks.persistTimelineFrameBatch.mockRejectedValue(new Error('write failed'));

    const result = await applyFramePositionsToExistingImages(settingsWith([30]), shot, images);

    expect(result).toMatchObject({ success: false, settingName: 'framePositions' });
  });
});
