import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RUNTIME_CONNECTION_COPY } from '@/shared/components/RuntimeConnection/copy.ts';
import type { BatchImageGenerationTaskParams } from '@/shared/types/imageGeneration';

// The gateway origin is the only difference between the cases below, so the origin is the one mutable mock.
let origin = '';
const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  ingestProjectInputFromUrl: vi.fn(),
  resolveTaskCapability: vi.fn(),
}));

vi.mock('@/integrations/runtime/connection.ts', () => ({
  runtimeOrigin: () => origin,
  astridBase: () => `${origin}/api/astrid`,
}));
vi.mock('./createTask', () => mocks);

import { createImageGenerationTasks, createImageToImageTask } from './imageGeneration';

const params = {
  project_id: 'project-1',
  prompts: [{ id: 'p-1', fullPrompt: 'a lighthouse at dawn' }],
  imagesPerPrompt: 1,
  model_name: 'z-image',
  execution: 'cloud',
  resolution: '1024x1024',
} as BatchImageGenerationTaskParams;

describe('image-generation task creation on the hosted build', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    origin = 'http://127.0.0.1:17340';
    vi.stubGlobal('fetch', vi.fn());
  });

  it('createImageGenerationTasks refuses with the compose line and sends no request', async () => {
    await expect(createImageGenerationTasks('project-1', params)).rejects.toThrow(RUNTIME_CONNECTION_COPY.composeDisabled);

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.resolveTaskCapability).not.toHaveBeenCalled();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it('createImageToImageTask refuses with the compose line and sends no request', async () => {
    await expect(createImageToImageTask('project-1', {
      sourceUrl: 'https://example.com/a.png', prompt: 'p', strength: 0.5, count: 1,
    })).rejects.toThrow(RUNTIME_CONNECTION_COPY.composeDisabled);

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.resolveTaskCapability).not.toHaveBeenCalled();
    expect(mocks.ingestProjectInputFromUrl).not.toHaveBeenCalled();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it('same-origin is unchanged: the Runtime capability is resolved', async () => {
    origin = '';
    mocks.resolveTaskCapability.mockRejectedValue(new Error('stop after capability'));

    await expect(createImageGenerationTasks('project-1', params)).rejects.toThrow('stop after capability');
    expect(mocks.resolveTaskCapability).toHaveBeenCalledTimes(1);
  });
});
