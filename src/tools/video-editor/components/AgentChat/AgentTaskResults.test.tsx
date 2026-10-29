import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AstridRuntimeClient } from '@/integrations/runtime/client';
import { AstridRuntimeClient as RuntimeClient } from '@/integrations/runtime/client';
import type { Task } from '@/integrations/runtime/generated';
import { AgentTaskResults, loadLinkedTaskResults } from './AgentTaskResults';
import { buildRenderedTurns } from './AgentChat';

const ref = { project_id: 'project', run_id: 'run', task_id: 'task', capability_id: 'media.clip_extract' };
function client() {
  return {
    getTask: vi.fn(async () => ref),
    listGenerations: vi.fn(async () => ({ items: [], next_cursor: null })),
    listManagedOutputs: vi.fn(async () => ({ items: [], next_cursor: null })),
    listVariants: vi.fn(async () => ({ items: [], next_cursor: null })),
    objectContentUrl: (id: string) => `/objects/${id}`,
  };
}

const runtimeTask = (overrides: Partial<Task> = {}): Task => ({
  task_id: ref.task_id,
  run_id: ref.run_id,
  project_id: ref.project_id,
  state: 'running',
  version: 7,
  capability_id: ref.capability_id,
  capability_digest: 'sha256:' + 'a'.repeat(64),
  idempotency_key: 'admit',
  created_at: new Date(Date.now() - 12_000).toISOString(),
  updated_at: new Date().toISOString(),
  runtime_epoch: 1,
  input_object_ids: [],
  spec: {},
  ...overrides,
});

function renderResults() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={queryClient}><AgentTaskResults refs={[ref]} projectId="project" /></QueryClientProvider>);
  return { ...view, queryClient };
}

describe('exact originating call result cards', () => {
  it('pairs concurrent tool results by identity despite reverse completion order', () => {
    const items = buildRenderedTurns([
      { role: 'tool_call', content: 'A', tool_call_id: 'A', timestamp: '1' },
      { role: 'tool_call', content: 'B', tool_call_id: 'B', timestamp: '2' },
      { role: 'tool_result', content: 'B result', tool_call_id: 'B', timestamp: '3', task_refs: [ref] },
      { role: 'tool_result', content: 'A result', tool_call_id: 'A', timestamp: '4' },
      { role: 'assistant', content: 'Actual reply.', timestamp: '5' },
    ]);
    expect(items[0]).toMatchObject({ kind: 'tool_group', pairs: [
      { call: { content: 'A' }, result: { content: 'A result' } },
      { call: { content: 'B' }, result: { content: 'B result', task_refs: [ref] } },
    ] });
    expect(items[1]).toMatchObject({ kind: 'message', turn: { content: 'Actual reply.' } });
  });

  it('loads real managed outputs only for the exact project/run/task', async () => {
    const source = client();
    source.listManagedOutputs.mockResolvedValue({ items: [
      { ...ref, association_id: 'output', filename: 'clip.mp4', object_id: 'sha256:clip', media_type: 'video/mp4', state: 'available', role: 'result' },
      { ...ref, project_id: 'other', association_id: 'wrong', filename: 'wrong.mp4', object_id: 'sha256:wrong', media_type: 'video/mp4', state: 'available', role: 'result' },
    ] as never[], next_cursor: null });
    expect(await loadLinkedTaskResults(ref, source as unknown as AstridRuntimeClient)).toEqual([
      { id: 'output', name: 'clip.mp4', url: '/objects/sha256:clip', mediaType: 'video/mp4' },
    ]);
    source.getTask.mockResolvedValue({ ...ref, run_id: 'other-run' });
    await expect(loadLinkedTaskResults(ref, source as unknown as AstridRuntimeClient)).rejects.toThrow('does not belong');
  });

  it('joins published generation results solely through source_task_id', async () => {
    const source = client();
    source.listGenerations.mockResolvedValue({ items: [
      { generation_id: 'linked', project_id: 'project', source_task_id: 'task', type: 'image', metadata: { name: 'Real generated image' } },
      { generation_id: 'unlinked', project_id: 'project', source_task_id: 'other', type: 'image', metadata: {} },
    ] as never[], next_cursor: null });
    source.listVariants.mockResolvedValue({ items: [{ variant_id: 'variant', generation_id: 'linked', object_id: 'sha256:image', variant_type: 'original', metadata: { media_type: 'image/png', is_primary: true } }] as never[], next_cursor: null });
    const results = await loadLinkedTaskResults(ref, source as unknown as AstridRuntimeClient);
    expect(results).toEqual([{ id: 'linked', generationId: 'linked', name: 'Real generated image', url: '/objects/sha256:image', mediaType: 'image/png' }]);
    expect(source.listVariants).toHaveBeenCalledTimes(1);
  });

  it('shows running state and elapsed time with a cancel control', async () => {
    vi.spyOn(RuntimeClient.prototype, 'getTask').mockResolvedValue(runtimeTask());
    const { unmount, queryClient } = renderResults();
    expect(await screen.findByText(/running · 12s elapsed/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    unmount();
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('cancels through the Runtime task API and then shows cancelled', async () => {
    const getTask = vi.spyOn(RuntimeClient.prototype, 'getTask')
      .mockResolvedValueOnce(runtimeTask())
      .mockResolvedValue(runtimeTask({ state: 'cancelled', version: 8 }));
    const cancelTask = vi.spyOn(RuntimeClient.prototype, 'cancelTask').mockResolvedValue(runtimeTask({ state: 'cancelled', version: 8 }) as never);
    const { unmount, queryClient } = renderResults();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(cancelTask).toHaveBeenCalledWith(ref.task_id, `astrid.agent-chat.cancel-${ref.task_id}-7`, 7));
    expect(await screen.findByText('Task cancelled.')).toBeTruthy();
    expect(getTask).toHaveBeenCalled();
    unmount();
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('shows failed task message and next action from error details', async () => {
    vi.spyOn(RuntimeClient.prototype, 'getTask').mockResolvedValue(runtimeTask({ state: 'failed', result: {
      error: { message: 'ComfyUI is missing a node.', details: { next_action: 'Install the missing custom node and restart ComfyUI.' } },
    } }));
    const { unmount, queryClient } = renderResults();
    expect(await screen.findByText('Task failed: ComfyUI is missing a node.')).toBeTruthy();
    expect(screen.getByText('Next: Install the missing custom node and restart ComfyUI.')).toBeTruthy();
    unmount();
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('keeps succeeded output rendering unchanged', async () => {
    vi.spyOn(RuntimeClient.prototype, 'getTask').mockResolvedValue(runtimeTask({ state: 'succeeded' }));
    vi.spyOn(RuntimeClient.prototype, 'listGenerations').mockResolvedValue({ items: [], next_cursor: null });
    vi.spyOn(RuntimeClient.prototype, 'listManagedOutputs').mockResolvedValue({ items: [
      { ...ref, attempt_id: 'attempt', output_port: 'result', group_key: 'g', variant_key: 'v', selector: { group_key: 'g', variant_key: 'v' }, association_id: 'output', filename: 'clip.mp4', object_id: 'sha256:clip', digest: 'sha256:clip', size: 1, media_type: 'video/mp4', state: 'available', role: 'result', ordinal: 0, producer: {}, provenance: {}, durability: 'durable', version: 1, lifecycle: {} },
    ], next_cursor: null });
    vi.spyOn(RuntimeClient.prototype, 'objectContentUrl').mockReturnValue('/objects/sha256:clip');
    const { unmount, queryClient } = renderResults();
    expect(await screen.findByRole('link', { name: 'clip.mp4' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    unmount();
    queryClient.clear();
    vi.restoreAllMocks();
  });
});
