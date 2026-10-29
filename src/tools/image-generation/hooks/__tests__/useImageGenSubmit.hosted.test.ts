import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { RUNTIME_CONNECTION_COPY } from '@/shared/components/RuntimeConnection/copy.ts';

// The gateway origin is the only difference between the two cases below, so the origin is the one mutable mock.
let origin = '';
const mockCreateImageGenerationTasks = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/integrations/runtime/connection.ts', () => ({ runtimeOrigin: () => origin }));
vi.mock('@/shared/lib/taskCreation', () => ({
  createImageGenerationTasks: (...args: unknown[]) => mockCreateImageGenerationTasks(...args),
}));
vi.mock('@/shared/lib/queryKeys', () => ({
  queryKeys: { unified: { projectPrefix: (id: string | null) => ['unified', id] } },
}));
vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({ normalizeAndPresentError: vi.fn() }));
vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn() },
}));

import { useImageGenSubmit } from '../useImageGenSubmit';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: new QueryClient() }, children);
const params = { prompts: [{ fullPrompt: 'a landscape' }] } as never;

describe('useImageGenSubmit on the hosted build', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    origin = '';
    mockCreateImageGenerationTasks.mockResolvedValue({ task_id: 'task-1', task_ids: ['task-1'], status: 'queued' });
  });

  it('with the gateway origin, shows the compose line and sends no request', async () => {
    origin = 'http://127.0.0.1:17340';
    const { result } = renderHook(() => useImageGenSubmit({ projectId: 'p', effectiveProjectId: 'p' }), { wrapper });

    let ids: string[] = ['unset'];
    await act(async () => { ids = await result.current.handleNewGenerate(params); });

    expect(ids).toEqual([]);
    expect(mockCreateImageGenerationTasks).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(RUNTIME_CONNECTION_COPY.composeDisabled);
  });

  it('same-origin is unchanged: the task is created', async () => {
    const { result } = renderHook(() => useImageGenSubmit({ projectId: 'p', effectiveProjectId: 'p' }), { wrapper });

    let ids: string[] = [];
    await act(async () => { ids = await result.current.handleNewGenerate(params); });

    expect(ids).toEqual(['task-1']);
    expect(mockCreateImageGenerationTasks).toHaveBeenCalledWith('p', params);
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
