import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { Task as RuntimeTask } from '@/integrations/runtime/generated.ts';
import { pollRuntimeTasks, refreshRuntimeTaskList, runtimeTaskQueryKey } from './useRuntimeTasks';

const task = (id: string, version: number) => ({
  task_id: id, project_id: 'p', state: 'running', version,
  capability_id: 'c', updated_at: 'u', spec: {},
}) as unknown as RuntimeTask;

describe('pollRuntimeTasks safety read', () => {
  it('preserves event upserts that arrive during a full-list request', async () => {
    let finish!: (page: { items: RuntimeTask[]; next_cursor: null }) => void;
    const client = {
      listProjectTasks: vi.fn(() => new Promise<{ items: RuntimeTask[]; next_cursor: null }>(
        (resolve) => { finish = resolve; },
      )),
    };
    const queryClient = new QueryClient();
    const key = runtimeTaskQueryKey('p');
    queryClient.setQueryData(key, [task('old', 1)]);

    const fullList = pollRuntimeTasks(client, queryClient, 'p');
    const progress = { ...task('old', 1), progress: { phase: 'Working', percent: 80 } };
    queryClient.setQueryData(key, [progress, task('new', 1)]);
    finish({ items: [task('old', 1)], next_cursor: null });

    await expect(fullList).resolves.toEqual([progress, task('new', 1)]);
    queryClient.clear();
  });

  it('invalidates the list immediately after local admission', () => {
    const queryClient = new QueryClient();
    const key = runtimeTaskQueryKey('p');
    queryClient.setQueryData(key, [task('old', 1)]);

    refreshRuntimeTaskList(queryClient, 'p');

    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    queryClient.clear();
  });
});
