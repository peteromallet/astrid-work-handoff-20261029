import { describe, expect, it, vi } from 'vitest';
import type { ManagedOutput, Task as RuntimeTask } from '@/integrations/runtime/generated.ts';
import {
  FINAL_VIDEO_RESOLVE_CONCURRENCY,
  completedRenderTaskIds,
  nextFinalVideoRetryDelay,
  readRuntimeFinalVideos,
  type ResolvedRenderCache,
} from './useFinalVideoAvailable.ts';

const RENDER_COUNT = 214;

function renderTask(i: number, state: RuntimeTask['state'] = 'succeeded'): RuntimeTask {
  return {
    task_id: `render-${i}`, run_id: `run-${i}`, project_id: 'p', state, version: 2,
    capability_id: 'rendering.render', capability_digest: 'sha256:x', idempotency_key: `k${i}`,
    created_at: '2026-01-01T00:00:00Z', updated_at: `2026-01-01T00:00:${i % 60}Z`,
    runtime_epoch: 1, input_object_ids: [],
    spec: { family: 'rendering.render', params: { shot_id: `shot-${i % 5}` } },
  } as unknown as RuntimeTask;
}

function output(taskId: string): ManagedOutput {
  const id = `sha256:${taskId.padStart(64, 'a')}`;
  return {
    association_id: `a-${taskId}`, project_id: 'p', run_id: 'r', task_id: taskId, attempt_id: 'at',
    output_port: 'video', object_id: id, digest: id, size: 1, filename: 'f.mp4',
    media_type: 'video/mp4', role: 'render', state: 'available',
  } as unknown as ManagedOutput;
}

function mockClient() {
  let inFlight = 0;
  let peak = 0;
  const track = async <T,>(value: T): Promise<T> => {
    inFlight++; peak = Math.max(peak, inFlight);
    await Promise.resolve(); await Promise.resolve();
    inFlight--;
    return value;
  };
  const client = {
    listProjectTasks: vi.fn(),
    getTask: vi.fn((id: string) => track(renderTask(Number(id.split('-')[1])))),
    listManagedOutputs: vi.fn((id: string) => track({ items: [output(id)], next_cursor: null })),
    objectContentUrl: vi.fn((id: string) => `/o/${id}`),
    exportManagedOutput: vi.fn(),
  };
  return { client, peak: () => peak };
}

describe('final-video sweep request budget', () => {
  const tasks = Array.from({ length: RENDER_COUNT }, (_, i) => renderTask(i));

  it('resolves each finished render once, however many sweeps run, with bounded concurrency', async () => {
    const { client, peak } = mockClient();
    const cache: ResolvedRenderCache = new Map();
    const first = await readRuntimeFinalVideos(client, 'p', tasks, null, cache);
    expect(client.getTask).toHaveBeenCalledTimes(RENDER_COUNT);
    expect(client.listManagedOutputs).toHaveBeenCalledTimes(RENDER_COUNT);
    expect(peak()).toBeLessThanOrEqual(FINAL_VIDEO_RESOLVE_CONCURRENCY);
    expect(first.size).toBe(5);

    // 20 further poll ticks: before the fix each re-fetched all 214 tasks.
    for (let tick = 0; tick < 20; tick++) {
      await readRuntimeFinalVideos(client, 'p', tasks, null, cache);
    }
    expect(client.getTask).toHaveBeenCalledTimes(RENDER_COUNT);
    expect(client.listManagedOutputs).toHaveBeenCalledTimes(RENDER_COUNT);
  });

  it('fetches only the newly finished render on a later sweep', async () => {
    const { client } = mockClient();
    const cache: ResolvedRenderCache = new Map();
    await readRuntimeFinalVideos(client, 'p', tasks, null, cache);
    client.getTask.mockClear();
    client.listManagedOutputs.mockClear();
    await readRuntimeFinalVideos(client, 'p', [...tasks, renderTask(999)], null, cache);
    expect(client.getTask).toHaveBeenCalledTimes(1);
    expect(client.listManagedOutputs).toHaveBeenCalledTimes(1);
  });

  it('retries an empty output listing and backs off until an output appears', async () => {
    const { client } = mockClient();
    const cache: ResolvedRenderCache = new Map();
    client.listManagedOutputs
      .mockResolvedValueOnce({ items: [], next_cursor: null })
      .mockResolvedValueOnce({ items: [output('render-0')], next_cursor: null });
    const oneTask = [tasks[0]!];

    const first = await readRuntimeFinalVideos(client, 'p', oneTask, null, cache);
    expect(first.retryableNoOutput).toBe(true);
    expect(nextFinalVideoRetryDelay(first.retryableNoOutput, false)).toBe(1_000);
    expect(nextFinalVideoRetryDelay(true, 1_000)).toBe(2_000);

    const second = await readRuntimeFinalVideos(client, 'p', oneTask, null, cache);
    expect(second.retryableNoOutput).toBe(false);
    expect(second.get('shot-0')?.id).toBe(output('render-0').object_id);
    expect(client.getTask).toHaveBeenCalledTimes(2);
    expect(client.listManagedOutputs).toHaveBeenCalledTimes(2);
    expect(nextFinalVideoRetryDelay(false, 2_000)).toBe(false);
  });

  it('caches a completed listing that proves the task produced no video', async () => {
    const { client } = mockClient();
    const cache: ResolvedRenderCache = new Map();
    const imageOutput = {
      ...output('render-0'),
      output_port: 'image',
      role: 'asset',
      media_type: 'image/png',
      filename: 'still.png',
    } as ManagedOutput;
    client.listManagedOutputs.mockResolvedValue({ items: [imageOutput], next_cursor: null });
    const oneTask = [tasks[0]!];

    await readRuntimeFinalVideos(client, 'p', oneTask, null, cache);
    await readRuntimeFinalVideos(client, 'p', oneTask, null, cache);

    expect(client.getTask).toHaveBeenCalledTimes(1);
    expect(client.listManagedOutputs).toHaveBeenCalledTimes(1);
  });

  it('retries a listed video output that is not available yet', async () => {
    const { client } = mockClient();
    const cache: ResolvedRenderCache = new Map();
    const pendingVideo = { ...output('render-0'), state: 'pending' } as ManagedOutput;
    client.listManagedOutputs.mockResolvedValue({ items: [pendingVideo], next_cursor: null });

    const first = await readRuntimeFinalVideos(client, 'p', [tasks[0]!], null, cache);
    const second = await readRuntimeFinalVideos(client, 'p', [tasks[0]!], null, cache);

    expect(first.retryableNoOutput).toBe(true);
    expect(second.retryableNoOutput).toBe(true);
    expect(client.getTask).toHaveBeenCalledTimes(2);
    expect(client.listManagedOutputs).toHaveBeenCalledTimes(2);
  });

  it('keeps the first-listed task per owner', async () => {
    const { client } = mockClient();
    const videos = await readRuntimeFinalVideos(client, 'p', tasks, null, new Map());
    expect(videos.get('shot-0')?.id).toBe(output('render-0').object_id);
  });

  it('keys on succeeded render ids only, ignoring unrelated task churn', () => {
    const other = { ...renderTask(1000, 'running'), capability_id: 'x', spec: { family: 'x' } } as RuntimeTask;
    const base = completedRenderTaskIds([...tasks, other]);
    const churned = completedRenderTaskIds([...tasks, { ...other, version: 9, updated_at: 'later' } as RuntimeTask]);
    expect(churned).toEqual(base);
    expect(completedRenderTaskIds([...tasks, renderTask(1001, 'running')])).toEqual(base);
    expect(completedRenderTaskIds([...tasks, renderTask(1001)])).toHaveLength(RENDER_COUNT + 1);
  });
});
