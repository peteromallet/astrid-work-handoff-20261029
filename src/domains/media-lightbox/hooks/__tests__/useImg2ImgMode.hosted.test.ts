import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { GenerationRow } from '@/domains/generation/types';
import { RUNTIME_CONNECTION_COPY } from '@/shared/components/RuntimeConnection/copy.ts';

// The gateway origin is the only difference between the two cases below, so the origin is the one mutable mock.
let origin = '';
const mockRun = vi.fn();
const mockCreateImageToImageTask = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/integrations/runtime/connection.ts', () => ({ runtimeOrigin: () => origin }));
vi.mock('@/shared/hooks/tasks/useTaskPlaceholder', () => ({ useTaskPlaceholder: () => mockRun }));
vi.mock('@/shared/lib/taskCreation/imageGeneration', () => ({
  createImageToImageTask: (...args: unknown[]) => mockCreateImageToImageTask(...args),
}));
vi.mock('@/domains/lora/hooks/useLoraManager', () => ({ useLoraManager: () => ({ selectedLoras: [] }) }));
vi.mock('@/shared/lib/media/mediaTypeHelpers', () => ({ getGenerationId: (media: { id: string }) => media.id }));
vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn() },
}));

import { useImg2ImgMode } from '../useImg2ImgMode';

function render() {
  return renderHook(() => useImg2ImgMode({
    media: { id: 'gen-1', params: {} } as unknown as GenerationRow,
    selectedProjectId: 'proj-1',
    isVideo: false,
    state: {
      strength: 0.6, setStrength: vi.fn(), enablePromptExpansion: false, setEnablePromptExpansion: vi.fn(),
      prompt: 'a prompt', setPrompt: vi.fn(), promptHasBeenSet: true, numGenerations: 1,
    },
    source: { baseImageUrl: 'https://example.com/image.png' },
  }));
}

describe('useImg2ImgMode on the hosted build', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    origin = '';
    mockRun.mockImplementation(async ({ create }: { create: () => Promise<unknown> }) => create());
    mockCreateImageToImageTask.mockResolvedValue({ task_id: 't', task_ids: ['t'], status: 'Queued' });
  });

  it('with the gateway origin, shows the compose line and sends no request', async () => {
    origin = 'http://127.0.0.1:17340';
    const { result } = render();

    await act(async () => { await result.current.handleGenerateImg2Img(); });

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockCreateImageToImageTask).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(RUNTIME_CONNECTION_COPY.composeDisabled);
  });

  it('same-origin is unchanged: the task is created', async () => {
    const { result } = render();

    await act(async () => { await result.current.handleGenerateImg2Img(); });

    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockCreateImageToImageTask).toHaveBeenCalledWith('proj-1', expect.objectContaining({ prompt: 'a prompt' }));
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
