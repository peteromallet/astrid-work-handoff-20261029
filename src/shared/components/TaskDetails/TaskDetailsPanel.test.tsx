// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskDetailsPanel } from './TaskDetailsPanel';
import type { Task } from '@/types/tasks';

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/shared/components/TaskDetails/components/TaskDetailsSummarySection', () => ({
  TaskDetailsSummarySection: () => <div data-testid="summary" />,
}));

const task = { id: 'task-1', params: {} } as unknown as Task;

describe('TaskDetailsPanel', () => {
  it('applies settings by task id and renders no include-images control', () => {
    const onApplySettingsFromTask = vi.fn();
    render(
      <TaskDetailsPanel
        task={task}
        isLoading={false}
        error={null}
        inputImages={['a.png', 'b.png']}
        taskId="task-1"
        onApplySettingsFromTask={onApplySettingsFromTask}
      />,
    );

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/2 images/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Apply Settings/ }));
    expect(onApplySettingsFromTask).toHaveBeenCalledWith('task-1');
  });
});
