import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ITEMS_PER_PAGE, STATUS_GROUPS } from '../constants';
import { useTasksPaneController } from './useTasksPaneController';

const mocks = vi.hoisted(() => ({
  usePaginatedTasks: vi.fn(),
  useTaskStatusCounts: vi.fn(),
  useAllTaskTypes: vi.fn(),
  getTaskDisplayName: vi.fn(),
  useTasksPaneViewState: vi.fn(),
  useTasksPaneCancelPending: vi.fn(),
  useRuntimeTasks: vi.fn(),
}));

vi.mock('@/shared/hooks/tasks/useTasks', () => ({
  usePaginatedTasks: (...args: unknown[]) => mocks.usePaginatedTasks(...args),
}));

vi.mock('@/shared/hooks/tasks/useTaskStatusCounts', () => ({
  useTaskStatusCounts: (...args: unknown[]) => mocks.useTaskStatusCounts(...args),
  useAllTaskTypes: (...args: unknown[]) => mocks.useAllTaskTypes(...args),
}));

vi.mock('@/shared/lib/tasks/taskConfig', () => ({
  getTaskDisplayName: (...args: unknown[]) => mocks.getTaskDisplayName(...args),
}));

vi.mock('./useTasksPaneViewState', () => ({
  useTasksPaneViewState: (...args: unknown[]) => mocks.useTasksPaneViewState(...args),
}));

vi.mock('./useTasksPaneCancelPending', () => ({
  useTasksPaneCancelPending: (...args: unknown[]) => mocks.useTasksPaneCancelPending(...args),
}));

vi.mock('./useRuntimeTasks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useRuntimeTasks')>();
  return {
    ...actual,
    useRuntimeTasks: (...args: unknown[]) => mocks.useRuntimeTasks(...args),
  };
});

function buildViewState(overrides: Record<string, unknown> = {}) {
  return {
    selectedFilter: 'Processing',
    selectedTaskType: null,
    projectScope: 'current',
    currentPage: 1,
    mobileActiveTaskId: null,
    setProjectScope: vi.fn(),
    setMobileActiveTaskId: vi.fn(),
    handleFilterChange: vi.fn(),
    handleTaskTypeChange: vi.fn(),
    handlePageChange: vi.fn(),
    handleStatusIndicatorClick: vi.fn(),
    ...overrides,
  };
}

describe('useTasksPaneController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePaginatedTasks.mockReturnValue({
      data: { tasks: [], total: 0, hasMore: false, totalPages: 0 },
      isLoading: false,
    });
    mocks.useTaskStatusCounts.mockReturnValue({
      data: {
        processing: 0,
        recentSuccesses: 0,
        recentFailures: 0,
        degraded: false,
        failedQueries: [],
      },
      isLoading: false,
    });
    mocks.useAllTaskTypes.mockReturnValue({ data: [] });
    mocks.getTaskDisplayName.mockImplementation((value: string) => value);
    mocks.useTasksPaneViewState.mockReturnValue(buildViewState());
    mocks.useTasksPaneCancelPending.mockReturnValue({
      handleCancelAllPending: vi.fn(),
      isCancelAllPending: false,
    });
    mocks.useRuntimeTasks.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      actionError: null,
      tasks: [],
      cancelTask: vi.fn(),
      retryTask: vi.fn(),
      cancelAllPending: vi.fn(),
      isCancelAllPending: false,
      isTaskActionPending: vi.fn().mockReturnValue(false),
      isActionPending: false,
      canCancel: vi.fn(),
      canRetry: vi.fn(),
    });
  });

  it('derives all-project query params and computed values for processing filter', () => {
    const handleCancelAllPending = vi.fn();
    mocks.useTasksPaneViewState.mockReturnValue(buildViewState({
      selectedFilter: 'Processing',
      selectedTaskType: 'z_type',
      projectScope: 'all',
      currentPage: 3,
      mobileActiveTaskId: 'mobile-1',
    }));
    mocks.usePaginatedTasks.mockReturnValue({
      data: { tasks: [], total: 120, hasMore: false, totalPages: 3 },
      isLoading: true,
    });
    mocks.useTaskStatusCounts.mockReturnValue({
      data: {
        processing: 4,
        recentSuccesses: 2,
        recentFailures: 1,
        degraded: true,
        failedQueries: ['processing', 'failure'],
      },
      isLoading: false,
    });
    mocks.useAllTaskTypes.mockReturnValue({ data: ['z_type', 'a_type'] });
    mocks.getTaskDisplayName.mockImplementation((taskType: string) =>
      taskType === 'z_type' ? 'Zebra' : 'Alpha',
    );
    mocks.useTasksPaneCancelPending.mockReturnValue({
      handleCancelAllPending,
      isCancelAllPending: true,
    });

    const input = {
      selectedProjectId: 'project-1',
      projects: [
        { id: 'project-1', name: 'First' },
        { id: 'project-2', name: 'Second' },
      ],
      incomingTasks: [
        {},
        { expectedCount: 3 },
        { taskIds: ['resolved'] },
      ],
      cancelAllIncoming: vi.fn(),
    };

    const { result } = renderHook(() => useTasksPaneController(input));

    expect(mocks.usePaginatedTasks).toHaveBeenCalledWith({
      projectId: null,
      status: STATUS_GROUPS.Processing,
      limit: ITEMS_PER_PAGE,
      offset: 100,
      taskType: 'z_type',
      allProjects: true,
      allProjectIds: ['project-1', 'project-2'],
    });
    expect(mocks.useTaskStatusCounts).toHaveBeenCalledWith('project-1', { allProjectIds: ['project-1', 'project-2'] });
    expect(mocks.useAllTaskTypes).toHaveBeenCalledWith('project-1');
    expect(mocks.useTasksPaneCancelPending).toHaveBeenCalledWith({
      selectedProjectId: 'project-1',
      selectedFilter: 'Processing',
      currentPage: 3,
      cancelAllIncoming: input.cancelAllIncoming,
    });

    expect(result.current.taskTypeOptions).toEqual([
      { value: 'a_type', label: 'Alpha' },
      { value: 'z_type', label: 'Zebra' },
    ]);
    expect(result.current.totalTasks).toBe(120);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.cancellableTaskCount).toBe(124);
    expect(result.current.effectiveProjectId).toBeNull();
    expect(result.current.isAllProjectsMode).toBe(true);
    expect(result.current.projectNameMap).toEqual({
      'project-1': 'First',
      'project-2': 'Second',
    });
    expect(result.current.isStatusCountsDegraded).toBe(true);
    expect(result.current.failedStatusQueries).toBe('processing, failure');
    expect(result.current.handleCancelAllPending).toBe(handleCancelAllPending);
    expect(result.current.isCancelAllPending).toBe(true);
  });

  it('keeps prior status counts while loading, then updates once fresh counts settle', () => {
    const statusPayload = {
      data: {
        processing: 7,
        recentSuccesses: 1,
        recentFailures: 0,
        degraded: false,
        failedQueries: [] as string[],
      },
      isLoading: false,
    };
    mocks.useTasksPaneViewState.mockReturnValue(buildViewState({
      selectedFilter: 'Succeeded',
      projectScope: 'current',
      currentPage: 1,
    }));
    mocks.useTaskStatusCounts.mockImplementation(() => statusPayload);

    const { result, rerender } = renderHook(() =>
      useTasksPaneController({
        selectedProjectId: 'project-9',
        projects: [{ id: 'project-9', name: 'Ninth' }],
        incomingTasks: [{ expectedCount: 2 }],
        cancelAllIncoming: vi.fn(),
      }),
    );

    expect(result.current.displayStatusCounts?.processing).toBe(7);
    expect(result.current.cancellableTaskCount).toBe(9);
    expect(result.current.isStatusCountsDegraded).toBe(false);
    expect(result.current.failedStatusQueries).toBe('');

    statusPayload.data = {
      processing: 99,
      recentSuccesses: 2,
      recentFailures: 1,
      degraded: true,
      failedQueries: ['success'],
    };
    statusPayload.isLoading = true;
    rerender();

    expect(result.current.displayStatusCounts?.processing).toBe(7);
    expect(result.current.cancellableTaskCount).toBe(9);
    expect(result.current.isStatusCountsDegraded).toBe(false);
    expect(result.current.failedStatusQueries).toBe('');

    statusPayload.isLoading = false;
    rerender();

    expect(result.current.displayStatusCounts?.processing).toBe(99);
    expect(result.current.cancellableTaskCount).toBe(101);
    expect(result.current.isStatusCountsDegraded).toBe(true);
    expect(result.current.failedStatusQueries).toBe('success');
    expect(mocks.usePaginatedTasks).toHaveBeenCalledWith({
      projectId: 'project-9',
      status: STATUS_GROUPS.Succeeded,
      limit: ITEMS_PER_PAGE,
      offset: 0,
      taskType: null,
      allProjects: false,
      allProjectIds: undefined,
    });
  });

  it('disables task loading dependencies when no project is selected', () => {
    mocks.useTasksPaneViewState.mockReturnValue(buildViewState({
      selectedFilter: 'Failed',
      projectScope: 'current',
    }));

    const { result } = renderHook(() =>
      useTasksPaneController({
        selectedProjectId: null,
        projects: [],
        incomingTasks: [],
        cancelAllIncoming: vi.fn(),
      }),
    );

    expect(mocks.useTaskStatusCounts).toHaveBeenCalledWith(null, undefined);
    expect(mocks.useAllTaskTypes).toHaveBeenCalledWith(null);
    expect(mocks.usePaginatedTasks).toHaveBeenCalledWith({
      projectId: null,
      status: STATUS_GROUPS.Failed,
      limit: ITEMS_PER_PAGE,
      offset: 0,
      taskType: null,
      allProjects: false,
      allProjectIds: undefined,
    });
    expect(result.current.effectiveProjectId).toBeNull();
    expect(result.current.taskTypeOptions).toEqual([]);
    expect(result.current.totalPages).toBe(0);
    expect(result.current.cancellableTaskCount).toBe(0);
  });

  it('uses only the explicit Runtime project for task reads and lifecycle actions', () => {
    const runtimeCancelAll = vi.fn();
    const runtimeCancel = vi.fn();
    const runtimeRetry = vi.fn();
    const runtimeTask = (
      taskId: string,
      state: string,
      version: number,
      family = 'generation.generate_image',
      capabilityId = family,
      updatedAt = '2026-09-11T00:01:00Z',
    ) => ({
      task_id: taskId,
      run_id: `run-${taskId}`,
      project_id: 'runtime-project',
      state,
      version,
      capability_id: capabilityId,
      capability_digest: 'sha256:capability',
      idempotency_key: `admit:${taskId}`,
      created_at: '2026-09-11T00:00:00Z',
      updated_at: updatedAt,
      runtime_epoch: 4,
      input_object_ids: [`sha256:${taskId}`],
      spec: { spec: { family, params: { prompt: taskId } } },
    });
    const queuedImage = runtimeTask('queued-image', 'queued', 2);
    const queuedVideo = runtimeTask('queued-video', 'queued', 2, 'generation.generate_video');
    const failedImage = runtimeTask('failed-image', 'failed', 3);
    const hiddenByFamily = runtimeTask(
      'import-family',
      'queued',
      1,
      'runtime.media.import.v1',
      'astrid.media-import-worker',
    );
    const hiddenByCapability = runtimeTask(
      'import-capability',
      'succeeded',
      1,
      'generation.generate_image',
      'runtime.media.import.v1',
      new Date().toISOString(),
    );
    const runtimeTasks = [
      queuedImage,
      queuedVideo,
      failedImage,
      hiddenByFamily,
      hiddenByCapability,
    ];
    mocks.useRuntimeTasks.mockReturnValue({
      data: runtimeTasks,
      isLoading: false,
      error: null,
      actionError: null,
      tasks: runtimeTasks,
      cancelTask: runtimeCancel,
      retryTask: runtimeRetry,
      cancelAllPending: runtimeCancelAll,
      isCancelAllPending: false,
      isTaskActionPending: vi.fn().mockReturnValue(false),
      isActionPending: false,
      canCancel: vi.fn(),
      canRetry: vi.fn(),
    });

    const { result, rerender } = renderHook(() => useTasksPaneController({
      selectedProjectId: 'legacy-project',
      runtimeProjectId: 'runtime-project',
      projects: [{ id: 'legacy-project', name: 'Legacy' }],
      incomingTasks: [{ expectedCount: 99 }],
      cancelAllIncoming: vi.fn(),
    }));

    expect(mocks.useRuntimeTasks).toHaveBeenCalledWith('runtime-project');
    expect(mocks.usePaginatedTasks).toHaveBeenCalledWith(expect.objectContaining({
      projectId: null,
      allProjects: false,
    }));
    expect(mocks.useTaskStatusCounts).toHaveBeenCalledWith(null, undefined);
    expect(mocks.useTasksPaneCancelPending).toHaveBeenCalledWith(expect.objectContaining({
      selectedProjectId: null,
      cancelAllIncoming: expect.any(Function),
    }));
    expect(result.current.isRuntimeMode).toBe(true);
    expect(result.current.effectiveProjectId).toBe('runtime-project');
    expect(result.current.runtimeTaskData?.tasks.map((task) => task.task_id)).toEqual([
      'queued-image',
      'queued-video',
    ]);
    expect(result.current.runtimeActivityTasks.map((task) => task.task_id)).toEqual([
      'queued-image',
      'queued-video',
      'failed-image',
    ]);
    expect(result.current.totalTasks).toBe(2);
    expect(result.current.displayStatusCounts).toMatchObject({
      processing: 2,
      recentSuccesses: 0,
    });
    expect(result.current.taskTypeOptions.map(({ value }) => value)).toEqual([
      'generation.generate_image',
      'generation.generate_video',
    ]);
    expect(result.current.cancellableTaskCount).toBe(2);
    result.current.handleCancelAllPending();
    expect(runtimeCancelAll).toHaveBeenCalledWith([queuedImage, queuedVideo]);
    expect(result.current.runtimeTaskActions.cancelTask).toBe(runtimeCancel);
    expect(result.current.runtimeTaskActions.retryTask).toBe(runtimeRetry);

    mocks.useTasksPaneViewState.mockReturnValue(buildViewState({
      selectedFilter: 'Processing',
      selectedTaskType: 'generation.generate_video',
    }));
    rerender();
    expect(result.current.runtimeTaskData?.tasks.map((task) => task.task_id)).toEqual(['queued-video']);
    expect(result.current.runtimeActivityTasks.map((task) => task.task_id)).toEqual([
      'queued-image',
      'queued-video',
      'failed-image',
    ]);
  });
});
