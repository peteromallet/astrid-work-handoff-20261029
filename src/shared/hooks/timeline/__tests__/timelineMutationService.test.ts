import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryKeys } from '@/shared/lib/queryKeys';

const mockRunTimelineWriteWithTimeout = vi.fn();
const mockIsTimelineWriteTimeoutError = vi.fn();
const mockPersistTimelineFrameBatch = vi.fn();

vi.mock('@/shared/lib/timelineWriteQueue', () => ({
  runTimelineWriteWithTimeout: (...args: unknown[]) => mockRunTimelineWriteWithTimeout(...args),
  isTimelineWriteTimeoutError: (...args: unknown[]) => mockIsTimelineWriteTimeoutError(...args),
}));

vi.mock('@/shared/lib/timelineFrameBatchPersist', () => ({
  persistTimelineFrameBatch: (...args: unknown[]) => mockPersistTimelineFrameBatch(...args),
}));

import {
  persistSingleTimelineFrame,
  refetchTimelineFrameCaches,
  syncTimelineGenerationFrames,
} from '../timelineMutationService';

describe('timelineMutationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunTimelineWriteWithTimeout.mockImplementation(
      async (_name: string, operation: () => Promise<void>) => operation(),
    );
    mockIsTimelineWriteTimeoutError.mockReturnValue(false);
  });

  it('refetches all relevant timeline caches', async () => {
    const queryClient = {
      refetchQueries: vi.fn(),
    };

    await refetchTimelineFrameCaches({
      queryClient: queryClient as never,
      shotId: 'shot-1',
      projectId: 'project-1',
      includeLiveTimeline: true,
    });

    expect(queryClient.refetchQueries).toHaveBeenNthCalledWith(1, {
      queryKey: queryKeys.generations.byShot('shot-1'),
    });
    expect(queryClient.refetchQueries).toHaveBeenNthCalledWith(2, {
      queryKey: queryKeys.generations.meta('shot-1'),
    });
    expect(queryClient.refetchQueries).toHaveBeenNthCalledWith(3, {
      queryKey: queryKeys.shots.list('project-1'),
    });
    expect(queryClient.refetchQueries).toHaveBeenNthCalledWith(4, {
      queryKey: queryKeys.segments.liveTimeline('shot-1'),
    });
  });

  it('persists a single frame through the document placement batch writer', async () => {
    mockPersistTimelineFrameBatch.mockResolvedValue({ updateCount: 1, durationMs: 1, skipped: false });
    const signal = new AbortController().signal;
    const log = vi.fn();

    await persistSingleTimelineFrame({
      shotId: 'shot-1',
      shotGenerationId: 'sg-shot-1-gen-1',
      frame: 24,
      signal,
      logPrefix: '[timeline]',
      log,
    });

    expect(mockPersistTimelineFrameBatch).toHaveBeenCalledTimes(1);
    expect(mockPersistTimelineFrameBatch).toHaveBeenCalledWith({
      shotId: 'shot-1',
      updates: [{ shotGenerationId: 'sg-shot-1-gen-1', timelineFrame: 24 }],
      operationLabel: 'single-frame update',
      timeoutOperationName: 'timeline-frame-single-update-write',
      signal,
      logPrefix: '[timeline]',
      log,
    });
  });

  it('syncs every generation target through the write queue', async () => {
    const syncShotData = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await syncTimelineGenerationFrames({
      shotId: 'shot-1',
      targets: [
        { generationId: 'gen-1', frame: 12 },
        { generationId: 'gen-2', frame: 36 },
      ],
      syncShotData,
      logPrefix: '[timeline]',
      log,
    });

    expect(mockRunTimelineWriteWithTimeout).toHaveBeenCalledWith(
      'timeline-frame-sync-shot-data',
      expect.any(Function),
      expect.objectContaining({ timeoutMs: 10_000 }),
    );
    expect(syncShotData).toHaveBeenNthCalledWith(1, 'gen-1', 'shot-1', 12);
    expect(syncShotData).toHaveBeenNthCalledWith(2, 'gen-2', 'shot-1', 36);
  });

  it('swallows timeout errors when ignoreTimeout is true', async () => {
    const timeoutError = new Error('timed out');
    mockRunTimelineWriteWithTimeout.mockRejectedValueOnce(timeoutError);
    mockIsTimelineWriteTimeoutError.mockReturnValue(true);
    const log = vi.fn();

    await expect(syncTimelineGenerationFrames({
      shotId: 'shot-1',
      targets: [{ generationId: 'gen-1', frame: 8 }],
      syncShotData: vi.fn(),
      logPrefix: '[timeline]',
      log,
      ignoreTimeout: true,
    })).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(
      '[timeline] shot_data sync timeout ignored',
      expect.objectContaining({ shotId: 'shot-1'.slice(0, 8), syncCount: 1 }),
    );
  });

  it('does not enqueue sync work when there are no targets', async () => {
    await syncTimelineGenerationFrames({
      shotId: 'shot-1',
      targets: [],
      syncShotData: vi.fn(),
      logPrefix: '[timeline]',
      log: vi.fn(),
    });

    expect(mockRunTimelineWriteWithTimeout).not.toHaveBeenCalled();
  });
});
