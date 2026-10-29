import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RUNTIME_CONNECTION_COPY } from '@/shared/components/RuntimeConnection/copy.ts';
import type { BatchImageGenerationTaskParams } from '@/shared/types/imageGeneration';

// The gateway origin is the only difference between the cases below, so the origin is the one mutable mock.
let origin = '';
const mockRun = vi.fn();
const mockCreateImageGenerationTasks = vi.fn();
const mockToastError = vi.fn();
let onGenerate: ((params: BatchImageGenerationTaskParams) => Promise<string[]>) | undefined;

vi.mock('@/integrations/runtime/connection.ts', () => ({ runtimeOrigin: () => origin }));
vi.mock('@/shared/hooks/useModal', () => ({
  useExtraLargeModal: () => ({ className: '', style: {}, headerClass: '', scrollClass: '' }),
}));
vi.mock('@/shared/components/ImageGenerationForm', () => ({
  ImageGenerationForm: (props: { onGenerate: typeof onGenerate }) => {
    onGenerate = props.onGenerate;
    return null;
  },
}));
vi.mock('@/shared/lib/taskCreation', () => ({
  createImageGenerationTasks: (...args: unknown[]) => mockCreateImageGenerationTasks(...args),
}));
vi.mock('@/shared/contexts/ProjectContext', () => ({ useProjectSelectionContext: () => ({ selectedProjectId: 'proj-1' }) }));
vi.mock('@/shared/hooks/tasks/useTaskPlaceholder', () => ({ useTaskPlaceholder: () => mockRun }));
vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn() },
}));

import { ImageGenerationModal } from './ImageGenerationModal';

const params = { prompts: [{ fullPrompt: 'a landscape' }] } as unknown as BatchImageGenerationTaskParams;

function renderModal() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ImageGenerationModal isOpen onClose={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ImageGenerationModal on the hosted build', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    origin = '';
    onGenerate = undefined;
    mockRun.mockImplementation(async ({ create }: { create: () => Promise<unknown> }) => create());
    mockCreateImageGenerationTasks.mockResolvedValue({ task_id: 't', task_ids: ['t'], status: 'Queued' });
  });

  it('with the gateway origin, shows the compose line and creates no task', async () => {
    origin = 'http://127.0.0.1:17340';
    renderModal();
    await act(async () => { await onGenerate?.(params); });

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockCreateImageGenerationTasks).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(RUNTIME_CONNECTION_COPY.composeDisabled);
  });

  it('same-origin is unchanged: the task is created', async () => {
    renderModal();
    await act(async () => { await onGenerate?.(params); });

    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockCreateImageGenerationTasks).toHaveBeenCalledWith('proj-1', params);
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
